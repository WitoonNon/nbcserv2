import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import { createEmployee, type EmployeeInput } from '../src/modules/hr/employee.service';
import {
  WageError,
  deleteLatestWageChange,
  recordWageChange,
  setWageFromEmployeeForm,
  wageAtDate,
  wageHistory,
  wagesAtDate,
} from '../src/modules/hr/wage.service';

/**
 * Wage history against real Postgres.
 *
 * The whole point of this table is one question: *what was this person on
 * during the period being paid for?* Everything here attacks that question
 * from the direction it actually gets answered wrongly — a raise entered
 * after the period it affects, a forgotten adjustment backdated later, a
 * payroll run for a month that ended before the current rate existed.
 *
 * A single mutable wage column answers all of those confidently and wrongly,
 * and the wrongness is invisible: the run completes, the numbers look like
 * money, and somebody is paid the wrong amount.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const CODE = 'TESTWAGE-001';
const ACTOR = { id: 'test-actor', name: 'ผู้ทดสอบ' };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

let employeeId: string;

function base(): EmployeeInput {
  return {
    employeeCode: CODE,
    firstNameTh: 'ทดสอบ',
    lastNameTh: 'ค่าแรง',
    position: 'ช่างเทคนิค',
    employmentType: 'DAILY',
    status: 'ACTIVE',
    hiredAt: '2026-01-01',
  };
}

async function cleanUp() {
  const rows = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: 'TESTWAGE-' } },
    select: { id: true },
  });
  // Guarded: an unset filter in Prisma matches every row.
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await prisma.employeeWageChange.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.employeeAccessLog.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(cleanUp);
afterAll(cleanUp);

beforeEach(async () => {
  await cleanUp();
  employeeId = await createEmployee(base(), ACTOR);
});

describe('the rate in force on a day', () => {
  it('is the latest change on or before it, not the newest row', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-09-15', wageRate: 600, employmentType: 'DAILY' },
      ACTOR,
    );

    // The scenario this table exists for: August's payroll, run in September,
    // after a raise that took effect in the middle of September.
    expect((await wageAtDate(employeeId, d('2026-08-31')))!.wageRate).toBe(500);
    expect((await wageAtDate(employeeId, d('2026-09-14')))!.wageRate).toBe(500);
    // Effective from the 15th means the 15th itself is on the new rate.
    expect((await wageAtDate(employeeId, d('2026-09-15')))!.wageRate).toBe(600);
    expect((await wageAtDate(employeeId, d('2026-12-31')))!.wageRate).toBe(600);
  });

  it('returns null before any rate was ever set, rather than zero', async () => {
    // Payroll must read this as "cannot compute", never as "paid nothing".
    expect(await wageAtDate(employeeId, d('2026-06-01'))).toBeNull();

    await recordWageChange(
      { employeeId, effectiveFrom: '2026-07-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    expect(await wageAtDate(employeeId, d('2026-06-30'))).toBeNull();
    expect((await wageAtDate(employeeId, d('2026-07-01')))!.wageRate).toBe(500);
  });

  it('carries the employment type with the rate', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-06-01', wageRate: 18000, employmentType: 'MONTHLY' },
      ACTOR,
    );

    // 500 a day and 18,000 a month are not comparable numbers — reading one
    // without the other is how a daily rate gets paid as a monthly salary.
    const before = (await wageAtDate(employeeId, d('2026-05-31')))!;
    const after = (await wageAtDate(employeeId, d('2026-06-01')))!;
    expect(before).toEqual({ wageRate: 500, employmentType: 'DAILY' });
    expect(after).toEqual({ wageRate: 18000, employmentType: 'MONTHLY' });
  });
});

describe('entering a change out of order', () => {
  it('backdating a forgotten raise does not overwrite the current rate', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-09-01', wageRate: 700, employmentType: 'DAILY' },
      ACTOR,
    );

    // Someone remembers a raise from March that was never entered.
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-03-01', wageRate: 550, employmentType: 'DAILY' },
      ACTOR,
    );

    const current = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { wageRate: true },
    });
    // Still on the September rate — the March entry is history, not news.
    expect(Number(current.wageRate)).toBe(700);

    expect((await wageAtDate(employeeId, d('2026-02-28')))!.wageRate).toBe(500);
    expect((await wageAtDate(employeeId, d('2026-03-01')))!.wageRate).toBe(550);
    expect((await wageAtDate(employeeId, d('2026-09-01')))!.wageRate).toBe(700);
  });

  it('records what was actually in force before, not the current rate', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-09-01', wageRate: 700, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-03-01', wageRate: 550, employmentType: 'DAILY' },
      ACTOR,
    );

    const march = (await wageHistory(employeeId)).find((h) =>
      h.effectiveFrom.startsWith('2026-03-01'),
    )!;
    // Came from 500, not from the current 700 — otherwise the row reads as a
    // pay cut when it was a rise.
    expect(march.previousRate).toBe(500);
    expect(march.wageRate).toBe(550);
  });

  it('leaves previousRate empty for the very first rate', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    expect((await wageHistory(employeeId))[0]!.previousRate).toBeNull();
  });
});

describe('what is refused', () => {
  it('refuses two changes effective the same day', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-05-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    // Otherwise "what were they on that day" has two answers, and payroll
    // cannot be ambiguous.
    await expect(
      recordWageChange(
        { employeeId, effectiveFrom: '2026-05-01', wageRate: 600, employmentType: 'DAILY' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(WageError);
  });

  it('refuses a date before the person started', async () => {
    await expect(
      recordWageChange(
        { employeeId, effectiveFrom: '2025-12-31', wageRate: 500, employmentType: 'DAILY' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(WageError);
  });

  it('refuses a negative rate', async () => {
    await expect(
      recordWageChange(
        { employeeId, effectiveFrom: '2026-05-01', wageRate: -1, employmentType: 'DAILY' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(WageError);
  });
});

describe('a whole payroll run', () => {
  it('resolves every employee in one query', async () => {
    const second = await createEmployee(
      { ...base(), employeeCode: 'TESTWAGE-002' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-09-01', wageRate: 700, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId: second, effectiveFrom: '2026-02-01', wageRate: 18000, employmentType: 'MONTHLY' },
      ACTOR,
    );

    const map = await wagesAtDate([employeeId, second], d('2026-08-31'));
    expect(map.get(employeeId)).toEqual({ wageRate: 500, employmentType: 'DAILY' });
    expect(map.get(second)).toEqual({ wageRate: 18000, employmentType: 'MONTHLY' });

    // Agrees with the one-at-a-time function — two paths, one answer.
    for (const id of [employeeId, second]) {
      expect(map.get(id)).toEqual(await wageAtDate(id, d('2026-08-31')));
    }
  });

  it('omits anyone with no rate yet instead of defaulting them to zero', async () => {
    const map = await wagesAtDate([employeeId], d('2026-08-31'));
    expect(map.has(employeeId)).toBe(false);
  });

  it('copes with an empty list', async () => {
    expect((await wagesAtDate([], d('2026-08-31'))).size).toBe(0);
  });
});

describe('undoing a mistake', () => {
  it('removes the newest row and restores the rate that now applies', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-09-01', wageRate: 7000, employmentType: 'DAILY' },
      ACTOR,
    );

    const newest = (await wageHistory(employeeId))[0]!;
    await deleteLatestWageChange(employeeId, newest.id, ACTOR);

    const current = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { wageRate: true },
    });
    expect(Number(current.wageRate)).toBe(500);
    expect((await wageAtDate(employeeId, d('2026-12-31')))!.wageRate).toBe(500);
  });

  it('refuses to delete anything but the newest', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-09-01', wageRate: 700, employmentType: 'DAILY' },
      ACTOR,
    );

    // An older row may already have been paid against; changing the basis of a
    // payment that has been made is worse than an odd-looking row.
    const oldest = (await wageHistory(employeeId)).at(-1)!;
    await expect(deleteLatestWageChange(employeeId, oldest.id, ACTOR)).rejects.toBeInstanceOf(
      WageError,
    );
  });

  it('clears the current rate when the only row is removed', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-01-01', wageRate: 500, employmentType: 'DAILY' },
      ACTOR,
    );
    const only = (await wageHistory(employeeId))[0]!;
    await deleteLatestWageChange(employeeId, only.id, ACTOR);

    const current = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { wageRate: true },
    });
    expect(current.wageRate).toBeNull();
  });
});

describe('the trail', () => {
  it('records who made each change', async () => {
    await recordWageChange(
      { employeeId, effectiveFrom: '2026-05-01', wageRate: 550, employmentType: 'DAILY', reason: 'ผ่านทดลองงาน' },
      { id: 'boss', name: 'เจ้าของ' },
    );

    const [row] = await wageHistory(employeeId);
    expect(row!.recordedByName).toBe('เจ้าของ');
    expect(row!.reason).toBe('ผ่านทดลองงาน');

    // And it lands in the same access log as every other read or write of a wage.
    const logged = await prisma.employeeAccessLog.count({
      where: { employeeId, actorId: 'boss' },
    });
    expect(logged).toBeGreaterThan(0);
  });
});

describe('a wage typed into the employee form', () => {
  it('reaches the history, so payroll can actually see it', async () => {
    // The trap this closes: the form wrote only Employee.wageRate, which is
    // the display column. Payroll reads the history, so a salary saved here
    // left the run reporting "ยังไม่ได้บันทึกค่าแรง" for somebody whose record
    // clearly showed a salary.
    expect(await wageAtDate(employeeId, new Date())).toBeNull();

    await setWageFromEmployeeForm(
      { employeeId, wageRate: 18_000, employmentType: 'MONTHLY', hiredAt: d('2026-01-01') },
      ACTOR,
    );

    const now = await wageAtDate(employeeId, new Date());
    expect(now).toEqual({ wageRate: 18_000, employmentType: 'MONTHLY' });
  });

  it('backdates the first wage to the hire date', async () => {
    // A joiner entered mid-month must be payable for the days already worked.
    await setWageFromEmployeeForm(
      { employeeId, wageRate: 500, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );
    expect((await wageAtDate(employeeId, d('2026-01-01')))!.wageRate).toBe(500);
  });

  it('writes nothing when the wage has not changed', async () => {
    // Re-saving a record to correct a phone number must not litter the history.
    await setWageFromEmployeeForm(
      { employeeId, wageRate: 500, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );
    const before = (await wageHistory(employeeId)).length;

    const result = await setWageFromEmployeeForm(
      { employeeId, wageRate: 500, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );

    expect(result).toBe('unchanged');
    expect((await wageHistory(employeeId)).length).toBe(before);
  });

  it('replaces rather than duplicates a second change on the same day', async () => {
    await setWageFromEmployeeForm(
      { employeeId, wageRate: 500, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );
    await setWageFromEmployeeForm(
      { employeeId, wageRate: 600, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );
    // Typed 650 by mistake as 600, corrected the same afternoon.
    const result = await setWageFromEmployeeForm(
      { employeeId, wageRate: 650, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );

    expect(result).toBe('replaced');
    const today = (await wageHistory(employeeId)).filter(
      (h) => h.effectiveFrom.slice(0, 10) === new Date().toISOString().slice(0, 10),
    );
    expect(today).toHaveLength(1);
    expect(today[0]!.wageRate).toBe(650);
    expect((await wageAtDate(employeeId, new Date()))!.wageRate).toBe(650);
  });

  it('keeps the earlier rate readable after a later change', async () => {
    await setWageFromEmployeeForm(
      { employeeId, wageRate: 500, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );
    await setWageFromEmployeeForm(
      { employeeId, wageRate: 700, employmentType: 'DAILY', hiredAt: d('2026-01-01') },
      ACTOR,
    );
    // January was worked at 500 and must still say so.
    expect((await wageAtDate(employeeId, d('2026-06-01')))!.wageRate).toBe(500);
    expect((await wageAtDate(employeeId, new Date()))!.wageRate).toBe(700);
  });
});
