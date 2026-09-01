import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma';
import { wagesAtDate, wageSegmentsInPeriod } from './wage.service';
import { approvedOvertimeInPeriod } from './overtime.service';
import { approvedLeaveInPeriod } from './leave.service';
import { attendanceInPeriod } from './timeclock.service';
import { leaveDaysBetween } from './leave-rules';
import { buildPayslip, type OvertimeLine } from './payroll-rules';

/**
 * Running payroll for a month.
 *
 * ## Two rules that the rest of this reads as consequences
 *
 * **A closed period locks.** Payslips are only issued from a closed period,
 * and a closed period cannot be recalculated. A figure that can be quietly
 * amended after the money has gone out is a figure nobody can audit, and the
 * payslip in somebody's hand would stop matching the system.
 *
 * **A person who cannot be calculated gets a line saying so.** Not silence.
 * Somebody with no wage on record is the commonest case — a new starter whose
 * rate nobody entered — and dropping them from the run means they are simply
 * not paid, with nothing on screen to show it.
 */

export class PayrollError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'PayrollError';
  }
}

/** Days of the period that fall inside a leave request. */
function overlapDays(
  leaveFrom: Date,
  leaveTo: Date,
  periodFrom: Date,
  periodTo: Date,
): number {
  const from = leaveFrom > periodFrom ? leaveFrom : periodFrom;
  const to = leaveTo < periodTo ? leaveTo : periodTo;
  return leaveDaysBetween(from, to);
}

/** Create the month, or return the one already there. */
export async function openPeriod(params: { code: string; from: Date; to: Date }) {
  if (!/^\d{4}-\d{2}$/.test(params.code)) {
    throw new PayrollError('รหัสงวดต้องอยู่ในรูปแบบ ปี-เดือน เช่น 2569-09');
  }
  const existing = await prisma.payrollPeriod.findUnique({ where: { code: params.code } });
  if (existing) return existing;

  return prisma.payrollPeriod.create({
    data: { code: params.code, from: params.from, to: params.to },
  });
}

export interface CalculationSummary {
  periodId: string;
  calculated: number;
  blocked: { employeeId: string; name: string; reason: string }[];
  totalNetSatang: number;
  anyRaisedToLegalMinimum: boolean;
  /** People the clock shows absent on days no leave covers. */
  absent: { employeeId: string; name: string; days: number }[];
  /** Punched in, never out. Their hours are understated until somebody fixes it. */
  withOpenSessions: number;
  /** True when nobody in the run had any punches — the clock is not in use yet. */
  noAttendanceData: boolean;
}

/**
 * Calculate every line in a period.
 *
 * Re-runnable while the period is DRAFT: the office will add a missing wage
 * record or approve a late overtime request and run it again. Each run
 * replaces the lines rather than adding to them.
 */
export async function calculatePeriod(periodId: string): Promise<CalculationSummary> {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new PayrollError('ไม่พบงวดเงินเดือน', 404);
  if (period.status === 'CLOSED') {
    throw new PayrollError('งวดนี้ปิดแล้ว คำนวณใหม่ไม่ได้ — ต้องเปิดงวดใหม่แทน', 409);
  }

  const staff = await prisma.employee.findMany({
    where: { isActive: true, status: { in: ['ACTIVE', 'PROBATION'] } },
    select: { id: true, firstNameTh: true, lastNameTh: true },
  });
  if (staff.length === 0) {
    return {
      periodId,
      calculated: 0,
      blocked: [],
      totalNetSatang: 0,
      anyRaisedToLegalMinimum: false,
      absent: [],
      withOpenSessions: 0,
      noAttendanceData: true,
    };
  }

  const ids = staff.map((s) => s.id);

  // The rate in force during the period, not today's — see wage.service.
  //
  // Two readings, because they answer different questions. `wages` is the rate
  // at the end of the period: what the line reports as the person's rate, and
  // what overtime is priced from. `segments` is the period cut where the wage
  // changed, so days before a mid-period raise are paid at the rate that was
  // actually in force on them.
  const [wages, segmentsByEmployee] = await Promise.all([
    wagesAtDate(ids, period.to),
    wageSegmentsInPeriod(ids, period.from, period.to),
  ]);
  const periodDays =
    Math.floor((period.to.getTime() - period.from.getTime()) / 86_400_000) + 1;
  const overtime = await approvedOvertimeInPeriod(period.from, period.to);
  const leave = await approvedLeaveInPeriod(period.from, period.to);
  const attendance = await attendanceInPeriod(ids, period.from, period.to);

  const overtimeByEmployee = new Map<string, OvertimeLine[]>();
  for (const row of overtime) {
    const lines = overtimeByEmployee.get(row.employeeId) ?? [];
    lines.push({
      kind: row.kind,
      hours: Number(row.hours),
      // Frozen at approval; never re-read from configuration.
      multiplierOverride: row.approvedMultiplier ? Number(row.approvedMultiplier) : null,
    });
    overtimeByEmployee.set(row.employeeId, lines);
  }

  const leaveByEmployee = new Map<string, { paid: number; unpaid: number }>();
  for (const row of leave) {
    const totals = leaveByEmployee.get(row.employeeId) ?? { paid: 0, unpaid: 0 };
    const inPeriod = overlapDays(row.fromDate, row.toDate, period.from, period.to);
    const total = Number(row.totalDays) || 1;
    // Leave spanning a month boundary is apportioned by how much of it falls
    // in this period, rather than charged wholly to whichever month it
    // started in.
    const share = inPeriod / total;
    totals.paid += Number(row.paidDays) * share;
    totals.unpaid += Number(row.unpaidDays) * share;
    leaveByEmployee.set(row.employeeId, totals);
  }

  const workingDays = leaveDaysBetween(period.from, period.to);
  const blocked: CalculationSummary['blocked'] = [];
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  let totalNetSatang = 0;
  let anyRaised = false;
  const absent: CalculationSummary['absent'] = [];
  let withOpenSessions = 0;

  for (const employee of staff) {
    const name = `${employee.firstNameTh} ${employee.lastNameTh}`;
    const basis = wages.get(employee.id);

    if (!basis) {
      // null means "cannot compute", never zero. A line that explains itself
      // beats a person quietly missing from the run.
      blocked.push({ employeeId: employee.id, name, reason: 'ยังไม่ได้บันทึกค่าแรง' });
      writes.push(
        prisma.payrollLine.upsert({
          where: { periodId_employeeId: { periodId, employeeId: employee.id } },
          create: {
            periodId,
            employeeId: employee.id,
            wageRate: 0,
            employmentType: 'DAILY',
            blockedReason: 'ยังไม่ได้บันทึกค่าแรง — คำนวณไม่ได้',
          },
          update: {
            blockedReason: 'ยังไม่ได้บันทึกค่าแรง — คำนวณไม่ได้',
            baseSatang: 0,
            overtimeSatang: 0,
            netSatang: 0,
          },
        }),
      );
      continue;
    }

    const taken = leaveByEmployee.get(employee.id) ?? { paid: 0, unpaid: 0 };
    const lines = overtimeByEmployee.get(employee.id) ?? [];
    const expectedDays = Math.max(0, workingDays - taken.paid - taken.unpaid);
    const seen = attendance.get(employee.id);

    // How the clock feeds pay, and the line that must not be crossed.
    //
    // A DAILY employee is paid for days worked, so days the clock recorded IS
    // the figure — that is what the client meant by counting real hours.
    //
    // A MONTHLY salary is NOT reduced here. Absence without leave is computed
    // and reported, but deducting it automatically would let one wrong
    // coordinate take money off somebody's salary, and the scan point is
    // still a village-level guess. The office decides, from `absentDays`.
    //
    // With no punches at all the period is assumed worked and stamped
    // CALENDAR, so a month run before the clock was rolled out cannot be
    // mistaken for a month that was actually measured.
    const daysWorked =
      seen && basis.employmentType === 'DAILY'
        ? Math.min(seen.daysPresent, expectedDays)
        : expectedDays;

    const absentDays = seen ? Math.max(0, expectedDays - seen.daysPresent) : 0;

    // Days worked are split across the wage segments in proportion to the
    // calendar days each covered. The clock records which day each punch fell
    // on, but a day worked is not tied to a rate until it is priced, and
    // apportioning is what the ratio of days actually means for a period that
    // was worked evenly. A period with one rate collapses to the single
    // segment and the arithmetic is unchanged.
    const segments = segmentsByEmployee.get(employee.id) ?? [];
    const slip = buildPayslip({
      basis,
      segments: segments.map((seg) => ({
        wageRate: seg.wageRate,
        employmentType: seg.employmentType,
        calendarDays: seg.calendarDays,
        daysWorked: (daysWorked * seg.calendarDays) / periodDays,
      })),
      periodDays,
      daysWorked,
      unpaidLeaveDays: taken.unpaid,
      overtime: lines,
    });

    totalNetSatang += slip.netSatang;
    anyRaised = anyRaised || slip.anyRaisedToLegalMinimum;

    // Reported, never applied on its own. A monthly salary is not reduced by
    // this figure — see the comment above `daysWorked`.
    if (absentDays > 0) absent.push({ employeeId: employee.id, name, days: absentDays });
    if (seen && seen.openSessions > 0) withOpenSessions += 1;

    const data = {
      wageRate: basis.wageRate,
      employmentType: basis.employmentType,
      daysWorked,
      paidLeaveDays: taken.paid,
      unpaidLeaveDays: taken.unpaid,
      overtimeHours: lines.reduce((sum, l) => sum + l.hours, 0),
      daysPresent: seen?.daysPresent ?? 0,
      minutesWorked: seen?.minutesWorked ?? 0,
      absentDays,
      openSessions: seen?.openSessions ?? 0,
      attendanceSource: seen ? 'CLOCK' : 'CALENDAR',
      baseSatang: slip.baseSatang,
      overtimeSatang: slip.overtimeSatang,
      additionsSatang: 0,
      deductionsSatang: 0,
      netSatang: slip.netSatang,
      raisedToLegalMinimum: slip.anyRaisedToLegalMinimum,
      blockedReason: null,
    };

    writes.push(
      prisma.payrollLine.upsert({
        where: { periodId_employeeId: { periodId, employeeId: employee.id } },
        create: { periodId, employeeId: employee.id, ...data },
        update: data,
      }),
    );
  }

  await prisma.$transaction(writes);

  return {
    periodId,
    calculated: staff.length - blocked.length,
    blocked,
    totalNetSatang,
    anyRaisedToLegalMinimum: anyRaised,
    absent,
    withOpenSessions,
    noAttendanceData: attendance.size === 0,
  };
}

/**
 * Close the period.
 *
 * After this the figures cannot change, and the overtime and leave counted in
 * it are stamped with the period so a later run cannot pay them again.
 *
 * Refuses while anybody is still uncalculated. Closing a period that silently
 * excludes three people is how somebody goes unpaid for a month — the office
 * has to either fix the wage record or accept the exclusion deliberately.
 */
export async function closePeriod(params: {
  periodId: string;
  closedById: string;
  /** Close anyway, with people still blocked. A decision, not a default. */
  acceptBlocked?: boolean;
}) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: params.periodId },
    include: { lines: { select: { id: true, blockedReason: true } } },
  });
  if (!period) throw new PayrollError('ไม่พบงวดเงินเดือน', 404);
  if (period.status === 'CLOSED') throw new PayrollError('งวดนี้ปิดไปแล้ว', 409);
  if (period.lines.length === 0) {
    throw new PayrollError('ยังไม่ได้คำนวณงวดนี้', 409);
  }

  const blocked = period.lines.filter((l) => l.blockedReason);
  if (blocked.length > 0 && !params.acceptBlocked) {
    throw new PayrollError(
      `ยังมีพนักงาน ${blocked.length} คนที่คำนวณไม่ได้ — แก้ค่าแรงก่อน หรือยืนยันว่าจะปิดทั้งที่ยังไม่ครบ`,
      409,
    );
  }

  await prisma.$transaction([
    prisma.payrollPeriod.update({
      where: { id: params.periodId },
      data: { status: 'CLOSED', closedById: params.closedById, closedAt: new Date() },
    }),
    // Stamped so a later run cannot pay the same overtime twice.
    prisma.overtimeRequest.updateMany({
      where: {
        status: 'APPROVED',
        paidInPeriodId: null,
        workDate: { gte: period.from, lte: period.to },
      },
      data: { paidInPeriodId: params.periodId },
    }),
    prisma.leaveRequest.updateMany({
      where: {
        status: 'APPROVED',
        countedInPeriodId: null,
        fromDate: { lte: period.to },
        toDate: { gte: period.from },
      },
      data: { countedInPeriodId: params.periodId },
    }),
  ]);
}

/** One payslip. Only from a closed period — see closePeriod. */
export async function payslipFor(periodId: string, employeeId: string) {
  const line = await prisma.payrollLine.findUnique({
    where: { periodId_employeeId: { periodId, employeeId } },
    include: {
      period: true,
      employee: {
        select: {
          employeeCode: true,
          titleTh: true,
          firstNameTh: true,
          lastNameTh: true,
          position: true,
          bankName: true,
          bankAccountLast4: true,
        },
      },
    },
  });
  if (!line) throw new PayrollError('ไม่พบรายการเงินเดือน', 404);
  if (line.period.status !== 'CLOSED') {
    // A payslip is evidence of payment. Issuing one from figures that can
    // still move means the paper and the system will disagree.
    throw new PayrollError('ออกสลิปได้เฉพาะงวดที่ปิดแล้ว', 409);
  }
  return line;
}

export async function listPeriods(limit = 24) {
  return prisma.payrollPeriod.findMany({
    orderBy: { from: 'desc' },
    take: limit,
    include: { _count: { select: { lines: true } } },
  });
}
