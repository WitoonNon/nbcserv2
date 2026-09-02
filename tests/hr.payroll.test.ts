import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import { recordWageChange } from '../src/modules/hr/wage.service';
import {
  approveOvertime,
  cancelOvertime,
  OvertimeError,
  rejectOvertime,
  requestOvertime,
} from '../src/modules/hr/overtime.service';
import { approveLeave, LeaveError, requestLeave } from '../src/modules/hr/leave.service';
import {
  calculatePeriod,
  closePeriod,
  openPeriod,
  PayrollError,
  payslipFor,
} from '../src/modules/hr/payroll.service';
import { toBaht } from '../src/modules/hr/payroll-rules';

/**
 * Overtime, leave and payroll against real Postgres.
 *
 * The arithmetic is tested without a database in hr.payroll-rules.test.ts and
 * hr.leave-rules.test.ts. What is defended here is everything that only goes
 * wrong once there are rows: paying the same overtime twice, two approvals
 * racing for the last paid leave day, a closed period being quietly
 * recalculated, and somebody with no wage on record vanishing from the run.
 *
 * Run against a real database on 31 ส.ค. 2569. The fixtures below were
 * originally pinned to September 2026 and could not pass — see the note on
 * PERIOD.
 */

const CODE_PREFIX = 'EMP-PAY-';
let monthlyId: string;
let dailyId: string;
let noWageId: string;
let actorId: string;

/**
 * The period under test is always the calendar month that has just ended.
 *
 * Fixed dates were used here originally and the file could not pass: every
 * overtime date sat in the future, and requestOvertime refuses anything more
 * than a day ahead because overtime is worked, not planned. A payroll suite
 * pinned to September 2026 is only correct during September 2026, which is a
 * property no test should have.
 *
 * Anchoring to last month also matches what a payroll run actually is — a
 * period that has finished — so the fixtures exercise the real case rather
 * than a hypothetical future one.
 */
const NOW = new Date();
const PERIOD_YEAR = NOW.getUTCMonth() === 0 ? NOW.getUTCFullYear() - 1 : NOW.getUTCFullYear();
const PERIOD_MONTH = NOW.getUTCMonth() === 0 ? 11 : NOW.getUTCMonth() - 1;

/** Day `d` of the period month, as a UTC calendar date. */
function periodDay(d: number): Date {
  return new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, d));
}
/** Day `d` of the period month, as 'YYYY-MM-DD'. */
function periodDayIso(d: number): string {
  return periodDay(d).toISOString().slice(0, 10);
}
/** Last calendar day of the period month. */
const PERIOD_LAST_DAY = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH + 1, 0)).getUTCDate();
/**
 * A period code no real payroll will ever use.
 *
 * This used to be the actual Buddhist year and month, which put the tests and
 * the company on the same key. openPeriod returns an existing period when the
 * code matches rather than creating one, so once the client closes a real
 * period the suite would have picked it up, written test payroll lines into
 * it, and then deleted it in cleanUp. Nothing had gone wrong yet only because
 * no period existed.
 *
 * 2400 BE is 1857 AD. The format openPeriod enforces is satisfied and the
 * namespace cannot collide. The dates in PERIOD are still the real ones —
 * they are what the calculations read; the code is only a label.
 */
function periodCode(offsetMonths = 0): string {
  return `2400-${String(1 + offsetMonths).padStart(2, '0')}`;
}
const PERIOD_CODE = periodCode();

const PERIOD = {
  code: PERIOD_CODE,
  from: periodDay(1),
  to: periodDay(PERIOD_LAST_DAY),
};

async function makeEmployee(over: Record<string, unknown> = {}) {
  return prisma.employee.create({
    data: {
      employeeCode: `${CODE_PREFIX}${Math.random().toString(36).slice(2, 9)}`,
      firstNameTh: 'ทดสอบ',
      lastNameTh: 'เงินเดือน',
      position: 'ช่างเทคนิค',
      status: 'ACTIVE',
      employmentType: 'MONTHLY',
      ...over,
    },
    select: { id: true },
  });
}

async function cleanUp() {
  const staff = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: CODE_PREFIX } },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);

  // Guarded: an unset filter matches every row in Prisma, and these would
  // otherwise empty payroll for the whole company.
  if (ids.length > 0) {
    await prisma.payrollLine.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeeWageChange.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }
  // NOT '2569-'. That is the current Buddhist year, so the filter matched
  // every real period the company would ever close this year — a test run
  // would have deleted the client's payroll along with its own. It had not
  // fired only because no period existed yet.
  await prisma.payrollPeriod.deleteMany({ where: { code: { startsWith: '2400-' } } });
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });
  actorId = user.id;
});

beforeEach(async () => {
  await cleanUp();

  monthlyId = (await makeEmployee({ employmentType: 'MONTHLY' })).id;
  dailyId = (await makeEmployee({ employmentType: 'DAILY' })).id;
  noWageId = (await makeEmployee()).id;

  await recordWageChange(
    { employeeId: monthlyId, effectiveFrom: '2026-01-01', wageRate: 18_000, employmentType: 'MONTHLY' },
    { id: actorId, name: 'ผู้ดูแลระบบ' },
  );
  await recordWageChange(
    { employeeId: dailyId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
    { id: actorId, name: 'ผู้ดูแลระบบ' },
  );
  // noWageId deliberately has no wage record.
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('asking for overtime', () => {
  it('records a request with a reason', async () => {
    const request = await requestOvertime({
      employeeId: monthlyId,
      workDate: periodDayIso(10),
      kind: 'WORKDAY_OT',
      hours: 3,
      reason: 'ปิดงานลูกค้าโรงแรม',
    });
    expect(request.status).toBe('PENDING');
  });

  it('refuses a request with no reason', async () => {
    // "Why" is the only thing an approver has to go on.
    await expect(
      requestOvertime({
        employeeId: monthlyId, workDate: periodDayIso(10),
        kind: 'WORKDAY_OT', hours: 3, reason: '   ',
      }),
    ).rejects.toBeInstanceOf(OvertimeError);
  });

  it('refuses more hours than a day holds', async () => {
    await expect(
      requestOvertime({
        employeeId: monthlyId, workDate: periodDayIso(10),
        kind: 'WORKDAY_OT', hours: 20, reason: 'พิมพ์ผิด',
      }),
    ).rejects.toBeInstanceOf(OvertimeError);
  });
});

describe('deciding on overtime', () => {
  async function pending() {
    return requestOvertime({
      employeeId: monthlyId, workDate: periodDayIso(10),
      kind: 'WORKDAY_OT', hours: 2, reason: 'งานด่วน',
    });
  }

  it('freezes the multiplier at approval', async () => {
    const request = await pending();
    await approveOvertime({ requestId: request.id, deciderId: actorId, multiplier: 2 });

    // Frozen, not read from configuration later: a payslip reissued in two
    // years must show the rate that was actually paid.
    const row = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(Number(row.approvedMultiplier)).toBe(2);
    expect(row.status).toBe('APPROVED');
  });

  it('raises a multiplier below the statutory floor', async () => {
    const request = await pending();
    const result = await approveOvertime({
      requestId: request.id, deciderId: actorId, multiplier: 1,
    });

    // Below the floor is not a discount, it is an offence.
    expect(result.multiplier).toBe(1.5);
    expect(result.raisedToLegalMinimum).toBe(true);
  });

  it('will not decide the same request twice', async () => {
    const request = await pending();
    await approveOvertime({ requestId: request.id, deciderId: actorId });

    await expect(
      approveOvertime({ requestId: request.id, deciderId: actorId }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('requires a reason to refuse', async () => {
    const request = await pending();
    await expect(
      rejectOvertime({ requestId: request.id, deciderId: actorId, note: '' }),
    ).rejects.toBeInstanceOf(OvertimeError);
  });

  it('lets the person who asked withdraw it, but not somebody else', async () => {
    const request = await pending();

    await expect(
      cancelOvertime({ requestId: request.id, employeeId: dailyId }),
    ).rejects.toMatchObject({ status: 403 });

    await cancelOvertime({ requestId: request.id, employeeId: monthlyId });
    const row = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id: request.id } });
    // Cancelled, not deleted: a request made and withdrawn is part of the
    // record of what happened.
    expect(row.status).toBe('CANCELLED');
  });
});

describe('leave', () => {
  it('splits paid from unpaid at approval', async () => {
    const request = await requestLeave({
      employeeId: monthlyId, type: 'SICK',
      fromDate: periodDayIso(7), toDate: periodDayIso(9), reason: 'ไข้หวัด',
    });

    const split = await approveLeave({ requestId: request.id, deciderId: actorId });
    expect(split.paidDays).toBe(3);
    expect(split.unpaidDays).toBe(0);
  });

  it('does not pay the same last day to two people racing', async () => {
    // 15 paid sick days. Take 14, then two requests of 2 days each.
    await prisma.leaveRequest.create({
      data: {
        employeeId: monthlyId, type: 'SICK',
        fromDate: new Date(Date.UTC(PERIOD_YEAR, 0, 5)), toDate: new Date(Date.UTC(PERIOD_YEAR, 0, 18)),
        reason: 'ป่วยยาว', status: 'APPROVED', totalDays: 14, paidDays: 14, unpaidDays: 0,
      },
    });

    const first = await requestLeave({
      employeeId: monthlyId, type: 'SICK',
      fromDate: periodDayIso(7), toDate: periodDayIso(8), reason: 'ป่วย',
    });
    const second = await requestLeave({
      employeeId: monthlyId, type: 'SICK',
      fromDate: periodDayIso(10), toDate: periodDayIso(11), reason: 'ป่วยอีก',
    });

    const a = await approveLeave({ requestId: first.id, deciderId: actorId });
    const b = await approveLeave({ requestId: second.id, deciderId: actorId });

    // Whoever is approved first takes the remaining day; the second is split
    // against what is actually left.
    expect(a.paidDays).toBe(1);
    expect(a.unpaidDays).toBe(1);
    expect(b.paidDays).toBe(0);
    expect(b.unpaidDays).toBe(2);
  });

  it('makes a daily worker\'s sick leave unpaid, per the client\'s policy', async () => {
    const request = await requestLeave({
      employeeId: dailyId, type: 'SICK',
      fromDate: periodDayIso(7), toDate: periodDayIso(8), reason: 'ป่วย',
    });

    const split = await approveLeave({ requestId: request.id, deciderId: actorId });
    expect(split.paidDays).toBe(0);
    expect(split.unpaidDays).toBe(2);
  });

  it('refuses a range that runs backwards', async () => {
    await expect(
      requestLeave({
        employeeId: monthlyId, type: 'SICK',
        fromDate: periodDayIso(10), toDate: periodDayIso(7), reason: 'ป่วย',
      }),
    ).rejects.toBeInstanceOf(LeaveError);
  });
});

describe('running payroll', () => {
  async function calculated() {
    const period = await openPeriod(PERIOD);
    const summary = await calculatePeriod(period.id);
    return { period, summary };
  }

  it('pays a monthly salary with approved overtime on top', async () => {
    const ot = await requestOvertime({
      employeeId: monthlyId, workDate: periodDayIso(10),
      kind: 'WORKDAY_OT', hours: 10, reason: 'งานเร่ง',
    });
    await approveOvertime({ requestId: ot.id, deciderId: actorId });

    const { period } = await calculated();
    const line = await prisma.payrollLine.findUniqueOrThrow({
      where: { periodId_employeeId: { periodId: period.id, employeeId: monthlyId } },
    });

    // 18,000 + (75/hr × 10 × 1.5 = 1,125)
    expect(toBaht(line.baseSatang)).toBeCloseTo(18_000, 2);
    expect(toBaht(line.overtimeSatang)).toBeCloseTo(1_125, 2);
    expect(toBaht(line.netSatang)).toBeCloseTo(19_125, 2);
  });

  it('writes a line explaining why somebody could not be calculated', async () => {
    const { period, summary } = await calculated();

    // Dropping them from the run means they are simply not paid, with nothing
    // on screen to show it.
    expect(summary.blocked.some((b) => b.employeeId === noWageId)).toBe(true);
    const line = await prisma.payrollLine.findUniqueOrThrow({
      where: { periodId_employeeId: { periodId: period.id, employeeId: noWageId } },
    });
    expect(line.blockedReason).toContain('ค่าแรง');
    expect(line.netSatang).toBe(0);
  });

  it('can be re-run while the period is open, replacing the lines', async () => {
    const { period } = await calculated();
    const before = await prisma.payrollLine.count({ where: { periodId: period.id } });

    await calculatePeriod(period.id);
    expect(await prisma.payrollLine.count({ where: { periodId: period.id } })).toBe(before);
  });

  it('uses the wage in force during the period, not today\'s', async () => {
    // A raise in October must not change what September was worth.
    await recordWageChange(
      { employeeId: monthlyId, effectiveFrom: new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH + 1, 1)).toISOString().slice(0, 10), wageRate: 25_000, employmentType: 'MONTHLY' },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );

    const { period } = await calculated();
    const line = await prisma.payrollLine.findUniqueOrThrow({
      where: { periodId_employeeId: { periodId: period.id, employeeId: monthlyId } },
    });
    expect(Number(line.wageRate)).toBe(18_000);
  });

  it('apportions a raise that takes effect inside the period', async () => {
    // The case the after-period test above does not reach. Raised on the 15th,
    // the days before it were being paid at the new rate — the whole month at
    // 30,000 instead of a fortnight of each.
    await recordWageChange(
      {
        employeeId: monthlyId,
        effectiveFrom: periodDayIso(15),
        wageRate: 30_000,
        employmentType: 'MONTHLY',
      },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );

    const { period } = await calculated();
    const line = await prisma.payrollLine.findUniqueOrThrow({
      where: { periodId_employeeId: { periodId: period.id, employeeId: monthlyId } },
    });

    const before = 14;
    const after = PERIOD_LAST_DAY - before;
    const expected = 18_000 * (before / PERIOD_LAST_DAY) + 30_000 * (after / PERIOD_LAST_DAY);

    expect(toBaht(line.baseSatang)).toBeCloseTo(expected, 0);
    // The thing that was actually wrong: a full month at the new rate.
    expect(toBaht(line.baseSatang)).toBeLessThan(30_000);
    // And not a full month at the old one either.
    expect(toBaht(line.baseSatang)).toBeGreaterThan(18_000);
  });

  it('is unchanged when the wage held steady all period', async () => {
    // The ordinary case, guarded so apportioning cannot drift it.
    const { period } = await calculated();
    const line = await prisma.payrollLine.findUniqueOrThrow({
      where: { periodId_employeeId: { periodId: period.id, employeeId: monthlyId } },
    });
    expect(toBaht(line.baseSatang)).toBe(18_000);
  });
});

describe('closing the period', () => {
  it('refuses while anybody is still uncalculated', async () => {
    const period = await openPeriod(PERIOD);
    await calculatePeriod(period.id);

    // Closing a period that silently excludes somebody is how a person goes
    // unpaid for a month.
    await expect(
      closePeriod({ periodId: period.id, closedById: actorId }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('closes when the exclusion is accepted deliberately', async () => {
    const period = await openPeriod(PERIOD);
    await calculatePeriod(period.id);
    await closePeriod({ periodId: period.id, closedById: actorId, acceptBlocked: true });

    const closed = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedById).toBe(actorId);
  });

  it('cannot be recalculated once closed', async () => {
    const period = await openPeriod(PERIOD);
    await calculatePeriod(period.id);
    await closePeriod({ periodId: period.id, closedById: actorId, acceptBlocked: true });

    // A figure that can be quietly amended after the money has gone out is a
    // figure nobody can audit.
    await expect(calculatePeriod(period.id)).rejects.toMatchObject({ status: 409 });
  });

  it('stamps overtime so a later run cannot pay it again', async () => {
    const ot = await requestOvertime({
      employeeId: monthlyId, workDate: periodDayIso(10),
      kind: 'WORKDAY_OT', hours: 4, reason: 'งานเร่ง',
    });
    await approveOvertime({ requestId: ot.id, deciderId: actorId });

    const period = await openPeriod(PERIOD);
    await calculatePeriod(period.id);
    await closePeriod({ periodId: period.id, closedById: actorId, acceptBlocked: true });

    const row = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id: ot.id } });
    expect(row.paidInPeriodId).toBe(period.id);

    // A second period covering the same days finds nothing left to pay.
    const next = await openPeriod({
      code: periodCode(1),
      from: periodDay(1),
      to: new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH + 2, 0)),
    });
    await calculatePeriod(next.id);
    const secondLine = await prisma.payrollLine.findUniqueOrThrow({
      where: { periodId_employeeId: { periodId: next.id, employeeId: monthlyId } },
    });
    expect(secondLine.overtimeSatang).toBe(0);
  });
});

describe('the payslip', () => {
  it('is refused while the period is still open', async () => {
    const period = await openPeriod(PERIOD);
    await calculatePeriod(period.id);

    // A payslip is evidence of payment. Issuing one from figures that can
    // still move means the paper and the system will disagree.
    await expect(payslipFor(period.id, monthlyId)).rejects.toBeInstanceOf(PayrollError);
  });

  it('is issued once the period is closed', async () => {
    const period = await openPeriod(PERIOD);
    await calculatePeriod(period.id);
    await closePeriod({ periodId: period.id, closedById: actorId, acceptBlocked: true });

    const slip = await payslipFor(period.id, monthlyId);
    expect(slip.period.status).toBe('CLOSED');
    expect(toBaht(slip.netSatang)).toBeCloseTo(18_000, 2);
  });
});
