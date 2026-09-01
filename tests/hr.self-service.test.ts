import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  cancelOvertime,
  myOvertimeRequests,
  OvertimeError,
  requestOvertime,
  approveOvertime,
} from '../src/modules/hr/overtime.service';
import {
  approveLeave,
  cancelLeave,
  getLeavePolicy,
  leaveBalances,
  LeaveError,
  myLeaveRequests,
  requestLeave,
} from '../src/modules/hr/leave.service';
import { entitlementDays } from '../src/modules/hr/leave-rules';

/**
 * What an employee may do to their OWN requests.
 *
 * The rules being defended here are all about ownership and timing, and they
 * only exist once there are rows: you may withdraw what you asked for, you may
 * not touch what somebody else asked for, and you may not withdraw anything
 * once it has been decided. The screen at /requests enforces none of this —
 * it passes the session's employee id to these functions and they refuse.
 *
 * Expectations are computed from the policy that is actually configured
 * rather than hard-coded. The leave allowance is the client's decision held
 * in AppConfig, so a test asserting "15" would start failing the day somebody
 * legitimately changes it — and would be testing the config, not the code.
 *
 * ⚠️ NOT YET RUN. Written while the development database was unreachable.
 * Typecheck and build pass; this file is what still needs a database.
 */

const CODE_PREFIX = 'EMP-SELF-';
let meId: string;
let otherId: string;
let dailyId: string;
let actorId: string;

async function makeEmployee(over: Record<string, unknown> = {}) {
  return prisma.employee.create({
    data: {
      employeeCode: `${CODE_PREFIX}${Math.random().toString(36).slice(2, 9)}`,
      firstNameTh: 'ทดสอบ',
      lastNameTh: 'คำขอ',
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

  // Guarded: an unset filter matches every row in Prisma.
  if (ids.length > 0) {
    await prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeEach(async () => {
  await cleanUp();
  const user = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });
  actorId = user.id;

  meId = (await makeEmployee()).id;
  otherId = (await makeEmployee()).id;
  dailyId = (await makeEmployee({ employmentType: 'DAILY' })).id;
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

/**
 * Dates are relative to the month that has just ended, not fixed.
 *
 * requestOvertime refuses a date more than a day ahead — overtime is worked,
 * not planned — so a fixture pinned to a future month can never be created,
 * and these tests failed for that reason rather than for anything they were
 * checking. Anchoring to last month also matches the real case: somebody
 * files for overtime they have already done.
 */
const NOW = new Date();
const PERIOD_YEAR = NOW.getUTCMonth() === 0 ? NOW.getUTCFullYear() - 1 : NOW.getUTCFullYear();
const PERIOD_MONTH = NOW.getUTCMonth() === 0 ? 11 : NOW.getUTCMonth() - 1;

function periodDay(d: number): Date {
  return new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, d));
}
function periodDayIso(d: number): string {
  return periodDay(d).toISOString().slice(0, 10);
}

const OT = {
  workDate: periodDayIso(10),
  kind: 'WORKDAY_OT' as const,
  hours: 3,
  reason: 'ปิดงานลูกค้า',
};
const LEAVE = {
  type: 'SICK' as const,
  fromDate: periodDayIso(10),
  toDate: periodDayIso(11),
  reason: 'ไข้หวัด',
};

describe('withdrawing your own leave request', () => {
  it('cancels a pending request instead of deleting it', async () => {
    const request = await requestLeave({ employeeId: meId, ...LEAVE });
    await cancelLeave({ requestId: request.id, employeeId: meId });

    // Still there: a request that was made and withdrawn is part of the
    // record of what happened.
    const after = await prisma.leaveRequest.findUnique({ where: { id: request.id } });
    expect(after?.status).toBe('CANCELLED');
  });

  it("refuses to cancel somebody else's request", async () => {
    const request = await requestLeave({ employeeId: otherId, ...LEAVE });
    await expect(
      cancelLeave({ requestId: request.id, employeeId: meId }),
    ).rejects.toBeInstanceOf(LeaveError);

    const after = await prisma.leaveRequest.findUnique({ where: { id: request.id } });
    expect(after?.status).toBe('PENDING');
  });

  it('refuses once a decision has been made', async () => {
    const request = await requestLeave({ employeeId: meId, ...LEAVE });
    await approveLeave({ requestId: request.id, deciderId: actorId });

    await expect(
      cancelLeave({ requestId: request.id, employeeId: meId }),
    ).rejects.toBeInstanceOf(LeaveError);
  });

  it('refuses an id that does not exist', async () => {
    await expect(
      cancelLeave({ requestId: 'no-such-request', employeeId: meId }),
    ).rejects.toBeInstanceOf(LeaveError);
  });
});

describe('withdrawing your own overtime request', () => {
  it("refuses to cancel somebody else's", async () => {
    const request = await requestOvertime({ employeeId: otherId, ...OT });
    await expect(
      cancelOvertime({ requestId: request.id, employeeId: meId }),
    ).rejects.toBeInstanceOf(OvertimeError);
  });

  it('refuses once approved', async () => {
    const request = await requestOvertime({ employeeId: meId, ...OT });
    await approveOvertime({ requestId: request.id, deciderId: actorId });

    await expect(
      cancelOvertime({ requestId: request.id, employeeId: meId }),
    ).rejects.toBeInstanceOf(OvertimeError);
  });
});

describe('reading back your own requests', () => {
  it('returns only your own', async () => {
    await requestOvertime({ employeeId: meId, ...OT });
    await requestOvertime({ employeeId: otherId, ...OT });

    const mine = await myOvertimeRequests(meId);
    expect(mine).toHaveLength(1);
  });

  it('keeps decided requests visible', async () => {
    const request = await requestLeave({ employeeId: meId, ...LEAVE });
    await approveLeave({ requestId: request.id, deciderId: actorId });

    // Hiding a request once decided makes the screen look like it was never
    // sent — the decision IS the answer the employee came back for.
    const mine = await myLeaveRequests(meId);
    expect(mine.map((r) => r.status)).toEqual(['APPROVED']);
  });

  it('shows the refusal reason to the person who asked', async () => {
    const request = await requestLeave({ employeeId: meId, ...LEAVE });
    await prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', decisionNote: 'ช่วงนี้งานเยอะ เลื่อนได้ไหม' },
    });

    const [mine] = await myLeaveRequests(meId);
    expect(mine!.decisionNote).toBe('ช่วงนี้งานเยอะ เลื่อนได้ไหม');
  });

  it('puts the newest first', async () => {
    await requestLeave({ employeeId: meId, ...LEAVE, fromDate: '2026-03-01', toDate: '2026-03-01' });
    await requestLeave({ employeeId: meId, ...LEAVE, fromDate: periodDayIso(1), toDate: periodDayIso(1) });

    const mine = await myLeaveRequests(meId);
    expect(mine[0]!.fromDate.toISOString().slice(0, 10)).toBe(periodDayIso(1));
  });
});

describe('the balance shown before you ask', () => {
  it('matches the configured entitlement for a monthly employee', async () => {
    const policy = await getLeavePolicy();
    const balances = await leaveBalances(meId, periodDay(1));

    for (const balance of balances) {
      expect(balance.entitlementDays).toBe(entitlementDays(policy, balance.type, 'MONTHLY'));
      expect(balance.usedDays).toBe(0);
      expect(balance.remainingDays).toBe(balance.entitlementDays);
    }
  });

  it("applies the client's monthly-staff-only restriction on sick leave", async () => {
    const policy = await getLeavePolicy();
    const balances = await leaveBalances(dailyId, periodDay(1));
    const sick = balances.find((b) => b.type === 'SICK')!;

    // Not the law's distinction — the client's. Asserted against the policy
    // so this test states the rule rather than a number.
    expect(sick.entitlementDays).toBe(entitlementDays(policy, 'SICK', 'DAILY'));
  });

  it('deducts days only once a request is approved', async () => {
    const request = await requestLeave({ employeeId: meId, ...LEAVE });
    const on = periodDay(1);

    const pending = (await leaveBalances(meId, on)).find((b) => b.type === 'SICK')!;
    // An undecided request has consumed nothing yet — reserving against it
    // would show a smaller balance than the employee actually has.
    expect(pending.usedDays).toBe(0);

    await approveLeave({ requestId: request.id, deciderId: actorId });

    const after = (await leaveBalances(meId, on)).find((b) => b.type === 'SICK')!;
    expect(after.usedDays).toBe(2);
    expect(after.remainingDays).toBe(pending.remainingDays - 2);
  });

  it('counts the calendar year of the date asked about, not today', async () => {
    const request = await requestLeave({
      employeeId: meId,
      ...LEAVE,
      fromDate: '2025-09-10',
      toDate: '2025-09-11',
    });
    await approveLeave({ requestId: request.id, deciderId: actorId });

    const thisYear = (await leaveBalances(meId, periodDay(1))).find(
      (b) => b.type === 'SICK',
    )!;
    const lastYear = (await leaveBalances(meId, new Date(Date.UTC(2025, 8, 1)))).find(
      (b) => b.type === 'SICK',
    )!;

    // Leave allowance resets with the calendar year. A 2025 absence must not
    // eat into the 2026 entitlement.
    expect(thisYear.usedDays).toBe(0);
    expect(lastYear.usedDays).toBe(2);
  });

  it('never reports a negative remainder', async () => {
    const policy = await getLeavePolicy();
    const entitlement = entitlementDays(policy, 'ANNUAL', 'MONTHLY');

    // Five days past the entitlement, whatever it is configured to be. Built
    // by date arithmetic rather than string padding so an allowance that runs
    // past the end of September still produces a real date.
    const end = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, 1 + entitlement + 4));

    const request = await requestLeave({
      employeeId: meId,
      type: 'ANNUAL',
      fromDate: periodDayIso(1),
      toDate: end.toISOString().slice(0, 10),
      reason: 'ลาพักร้อนยาว',
    });
    await approveLeave({ requestId: request.id, deciderId: actorId });

    const annual = (await leaveBalances(meId, periodDay(1))).find(
      (b) => b.type === 'ANNUAL',
    )!;
    // The overrun is split into unpaid days at approval, so the balance
    // bottoms out at zero rather than going into debt.
    expect(annual.remainingDays).toBe(0);
    expect(annual.usedDays).toBeLessThanOrEqual(annual.entitlementDays);
  });
});
