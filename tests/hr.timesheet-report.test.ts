import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import { timesheetFor } from '../src/modules/hr/timeclock.service';
import { otRatesAtDate, recordWageChange } from '../src/modules/hr/wage.service';
import { approveOvertime, requestOvertime } from '../src/modules/hr/overtime.service';

/**
 * The two things ใบเสนอราคา QT-2024-052 asked for and had not got:
 * a per-person timesheet (ข้อ 2) and a personal overtime rate (ข้อ 5).
 *
 * The pairing arithmetic is already covered without a database in
 * hr.worktime.test.ts. What is defended here is everything that only goes
 * wrong once there are rows — the month boundary, the Bangkok day, and a rate
 * read as it stood on the day the work happened rather than as it stands now.
 */

const CODE = 'EMP-TSR-';
let employeeId: string;
let actorId: string;

async function punch(kind: 'IN' | 'OUT', iso: string) {
  return prisma.timeClockEntry.create({
    data: {
      employeeId,
      kind,
      occurredAt: new Date(iso),
      scanPointId: 'OFFICE',
      tokenKind: 'STATIC',
      geofence: 'INSIDE',
    },
  });
}

async function cleanUp() {
  const staff = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: CODE } },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);
  // Guarded: an unset filter matches every row in Prisma.
  if (ids.length > 0) {
    await prisma.timeClockEntry.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeeWageChange.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeeAccessLog.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  actorId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
});

beforeEach(async () => {
  await cleanUp();
  const e = await prisma.employee.create({
    data: {
      employeeCode: `${CODE}${Math.random().toString(36).slice(2, 9)}`,
      firstNameTh: 'ทดสอบ',
      lastNameTh: 'ใบลงเวลา',
      position: 'ช่างเทคนิค',
      status: 'ACTIVE',
      employmentType: 'MONTHLY',
    },
    select: { id: true },
  });
  employeeId = e.id;
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

const SEP = { from: new Date(Date.UTC(2026, 8, 1)), to: new Date(Date.UTC(2026, 8, 30)) };

describe('one person, one month', () => {
  it('adds up the days that paired', async () => {
    await punch('IN', '2026-09-01T01:00:00Z'); // 08:00 Bangkok
    await punch('OUT', '2026-09-01T10:00:00Z'); // 17:00
    await punch('IN', '2026-09-02T01:00:00Z');
    await punch('OUT', '2026-09-02T10:00:00Z');

    const sheet = await timesheetFor(employeeId, SEP.from, SEP.to);
    expect(sheet.summary.daysPresent).toBe(2);
    expect(sheet.summary.minutesWorked).toBe(1080);
    expect(sheet.days).toHaveLength(2);
  });

  it('shows a forgotten punch as a day with no hours, not as a day off', async () => {
    await punch('IN', '2026-09-03T01:00:00Z');

    const sheet = await timesheetFor(employeeId, SEP.from, SEP.to);
    const [day] = sheet.days;
    // A zero here would read as "did not come in", which is a different and
    // wrong statement about somebody's pay.
    expect(day!.problem).toBe('OPEN');
    expect(day!.minutes).toBe(0);
    expect(sheet.summary.daysPresent).toBe(1);
  });

  it('includes punches on the last day of the month', async () => {
    // `to` is a @db.Date midnight; an off-by-one here silently drops the
    // 30th out of every September timesheet.
    await punch('IN', '2026-09-30T02:00:00Z');
    await punch('OUT', '2026-09-30T11:00:00Z');

    const sheet = await timesheetFor(employeeId, SEP.from, SEP.to);
    expect(sheet.days.map((d) => d.day)).toContain('2026-09-30');
  });

  it('keeps a neighbouring month out', async () => {
    await punch('IN', '2026-10-01T02:00:00Z');
    await punch('OUT', '2026-10-01T11:00:00Z');

    expect((await timesheetFor(employeeId, SEP.from, SEP.to)).days).toHaveLength(0);
  });

  it('files an early-morning punch under the Bangkok day, not the UTC one', async () => {
    // 23:00Z on the 9th is 06:00 on the 10th in Bangkok — the morning shift
    // this system exists to record.
    await punch('IN', '2026-09-09T23:00:00Z');
    await punch('OUT', '2026-09-10T08:00:00Z');

    const sheet = await timesheetFor(employeeId, SEP.from, SEP.to);
    expect(sheet.days[0]!.day).toBe('2026-09-10');
  });

  it('returns an empty month rather than throwing', async () => {
    const sheet = await timesheetFor(employeeId, SEP.from, SEP.to);
    expect(sheet.days).toEqual([]);
    expect(sheet.summary.minutesWorked).toBe(0);
  });
});

describe('the personal overtime rate', () => {
  const wage = {
    effectiveFrom: '2026-01-01',
    wageRate: 18_000,
    employmentType: 'MONTHLY' as const,
  };

  it('is null when nobody set one — the statutory floor, not zero', async () => {
    await recordWageChange({ employeeId, ...wage }, { id: actorId, name: 'ผู้ดูแลระบบ' });
    expect(await otRatesAtDate(employeeId, new Date(Date.UTC(2026, 8, 1)))).toEqual({});
  });

  it('is used as the default when the approver types nothing', async () => {
    await recordWageChange(
      { employeeId, ...wage, otWorkdayMultiplier: 2 },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );
    const request = await requestOvertime({
      employeeId,
      workDate: '2026-09-01',
      kind: 'WORKDAY_OT',
      hours: 3,
      reason: 'ปิดงานลูกค้า',
    });

    const result = await approveOvertime({ requestId: request.id, deciderId: actorId });
    expect(result.multiplier).toBe(2);
  });

  it('is overridden by a number the approver does type', async () => {
    await recordWageChange(
      { employeeId, ...wage, otWorkdayMultiplier: 2 },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );
    const request = await requestOvertime({
      employeeId,
      workDate: '2026-09-01',
      kind: 'WORKDAY_OT',
      hours: 3,
      reason: 'ปิดงานลูกค้า',
    });

    const result = await approveOvertime({
      requestId: request.id,
      deciderId: actorId,
      multiplier: 2.5,
    });
    expect(result.multiplier).toBe(2.5);
  });

  it('is read as it stood on the day worked, not as it stands today', async () => {
    await recordWageChange(
      { employeeId, ...wage, otWorkdayMultiplier: 2 },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );
    // A rate raised in October must not change what September paid — the same
    // rule the wage itself follows, and for the same reason.
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-10-01', wageRate: 20_000, employmentType: 'MONTHLY', otWorkdayMultiplier: 3 },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );

    const september = await otRatesAtDate(employeeId, new Date(Date.UTC(2026, 8, 15)));
    const october = await otRatesAtDate(employeeId, new Date(Date.UTC(2026, 9, 15)));
    expect(september.WORKDAY_OT).toBe(2);
    expect(october.WORKDAY_OT).toBe(3);
  });

  it('never takes somebody below the legal floor', async () => {
    // 1.2 is above the "is this a typo" guard but below ม.61's 1.5. The row
    // may carry it; the approval must not.
    await recordWageChange(
      { employeeId, ...wage, otWorkdayMultiplier: 1.2 },
      { id: actorId, name: 'ผู้ดูแลระบบ' },
    );
    const request = await requestOvertime({
      employeeId,
      workDate: '2026-09-01',
      kind: 'WORKDAY_OT',
      hours: 3,
      reason: 'ปิดงานลูกค้า',
    });

    const result = await approveOvertime({ requestId: request.id, deciderId: actorId });
    expect(result.multiplier).toBe(1.5);
    expect(result.raisedToLegalMinimum).toBe(true);
  });
});
