import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma';
import { wagesAtDate } from './wage.service';
import { approvedOvertimeInPeriod } from './overtime.service';
import { approvedLeaveInPeriod } from './leave.service';
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
    };
  }

  const ids = staff.map((s) => s.id);

  // The rate in force during the period, not today's — see wage.service.
  const wages = await wagesAtDate(ids, period.to);
  const overtime = await approvedOvertimeInPeriod(period.from, period.to);
  const leave = await approvedLeaveInPeriod(period.from, period.to);

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
    const daysWorked = Math.max(0, workingDays - taken.paid - taken.unpaid);

    const slip = buildPayslip({
      basis,
      daysWorked,
      unpaidLeaveDays: taken.unpaid,
      overtime: lines,
    });

    totalNetSatang += slip.netSatang;
    anyRaised = anyRaised || slip.anyRaisedToLegalMinimum;

    const data = {
      wageRate: basis.wageRate,
      employmentType: basis.employmentType,
      daysWorked,
      paidLeaveDays: taken.paid,
      unpaidLeaveDays: taken.unpaid,
      overtimeHours: lines.reduce((sum, l) => sum + l.hours, 0),
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
