import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import type { EmploymentType } from '@/generated/prisma';

/**
 * What somebody was paid, and from when.
 *
 * The reason this exists rather than a single mutable column: payroll is
 * almost always run for a period that has already ended. Raise someone on 15
 * September and recalculate August on the 20th, and a single column gives the
 * new rate for a month it was never in force — the wrong money, with nothing
 * on screen to suggest anything is wrong. `wageAtDate` is the function payroll
 * must use, and the rest of this module exists to keep its answer true.
 *
 * `Employee.wageRate` remains as the current rate so ordinary reads need no
 * join. Both are written together, in one transaction, so they cannot disagree.
 */

export class WageError extends Error {}

export interface WageChangeRow {
  id: string;
  effectiveFrom: string;
  wageRate: number;
  previousRate: number | null;
  employmentType: EmploymentType;
  reason: string | null;
  recordedByName: string;
  createdAt: string;
}

export interface RecordWageInput {
  employeeId: string;
  /** 'YYYY-MM-DD'. The rate applies from this calendar day onward. */
  effectiveFrom: string;
  wageRate: number;
  employmentType: EmploymentType;
  reason?: string | null;
}

/** Parsed as a plain calendar date — see the @db.Date note in hr.prisma. */
function dateOnly(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) throw new WageError('รูปแบบวันที่ไม่ถูกต้อง');
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * The rate in force on a given day.
 *
 * The latest change whose `effectiveFrom` is on or before that day — not the
 * employee's current rate, and not the newest row. Returns null when the
 * person had no recorded rate yet, which payroll must treat as "cannot
 * compute" rather than as zero.
 */
export async function wageAtDate(
  employeeId: string,
  on: Date,
): Promise<{ wageRate: number; employmentType: EmploymentType } | null> {
  const row = await prisma.employeeWageChange.findFirst({
    where: { employeeId, effectiveFrom: { lte: on } },
    orderBy: { effectiveFrom: 'desc' },
    select: { wageRate: true, employmentType: true },
  });
  if (!row) return null;
  return { wageRate: Number(row.wageRate), employmentType: row.employmentType };
}

/**
 * Rates in force for a whole payroll run, in one query.
 *
 * A run over thirty people would otherwise be thirty round trips to a database
 * in another region. `DISTINCT ON` is Postgres picking the latest applicable
 * row per employee in a single pass.
 */
export async function wagesAtDate(
  employeeIds: string[],
  on: Date,
): Promise<Map<string, { wageRate: number; employmentType: EmploymentType }>> {
  if (employeeIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    { employeeId: string; wageRate: Prisma.Decimal; employmentType: EmploymentType }[]
  >(Prisma.sql`
    SELECT DISTINCT ON ("employeeId") "employeeId", "wageRate", "employmentType"
      FROM "employee_wage_changes"
     WHERE "employeeId" IN (${Prisma.join(employeeIds)})
       AND "effectiveFrom" <= ${on}
     ORDER BY "employeeId", "effectiveFrom" DESC
  `);

  return new Map(
    rows.map((r) => [r.employeeId, { wageRate: Number(r.wageRate), employmentType: r.employmentType }]),
  );
}

/** Everything on record, newest first. */
export async function wageHistory(employeeId: string): Promise<WageChangeRow[]> {
  const rows = await prisma.employeeWageChange.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      id: true,
      effectiveFrom: true,
      wageRate: true,
      previousRate: true,
      employmentType: true,
      reason: true,
      recordedByName: true,
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    effectiveFrom: r.effectiveFrom.toISOString(),
    wageRate: Number(r.wageRate),
    previousRate: r.previousRate === null ? null : Number(r.previousRate),
    employmentType: r.employmentType,
    reason: r.reason,
    recordedByName: r.recordedByName,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Record an adjustment.
 *
 * `previousRate` is taken from what was actually in force on that date, not
 * from the employee's current rate — those differ whenever a change is entered
 * out of order, which happens when somebody backdates a raise they forgot to
 * enter. Recording the wrong "from" figure would make the history read as a
 * cut when it was a rise.
 *
 * The employee's current rate is only updated when this change is the newest
 * one; backdating a forgotten adjustment must not overwrite a later raise.
 */
export async function recordWageChange(
  input: RecordWageInput,
  actor: { id: string; name: string },
): Promise<string> {
  if (!Number.isFinite(input.wageRate) || input.wageRate < 0) {
    throw new WageError('ค่าแรงต้องเป็นตัวเลขและไม่ติดลบ');
  }
  const effectiveFrom = dateOnly(input.effectiveFrom);

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, hiredAt: true },
  });
  if (!employee) throw new WageError('ไม่พบพนักงานที่ระบุ');

  if (employee.hiredAt && effectiveFrom < employee.hiredAt) {
    throw new WageError('วันที่มีผลต้องไม่ก่อนวันเริ่มงาน');
  }

  const clash = await prisma.employeeWageChange.findUnique({
    where: {
      employeeId_effectiveFrom: { employeeId: input.employeeId, effectiveFrom },
    },
    select: { id: true },
  });
  if (clash) throw new WageError('มีการปรับค่าแรงที่มีผลวันเดียวกันนี้อยู่แล้ว');

  const before = await wageAtDate(input.employeeId, effectiveFrom);

  // Newest-so-far decides whether the denormalised current rate moves.
  const newest = await prisma.employeeWageChange.findFirst({
    where: { employeeId: input.employeeId },
    orderBy: { effectiveFrom: 'desc' },
    select: { effectiveFrom: true },
  });
  const isLatest = !newest || effectiveFrom >= newest.effectiveFrom;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.employeeWageChange.create({
      data: {
        employeeId: input.employeeId,
        effectiveFrom,
        wageRate: new Prisma.Decimal(input.wageRate.toFixed(2)),
        employmentType: input.employmentType,
        previousRate: before === null ? null : new Prisma.Decimal(before.wageRate.toFixed(2)),
        reason: input.reason?.trim() || null,
        recordedById: actor.id,
        recordedByName: actor.name,
      },
      select: { id: true },
    });

    if (isLatest) {
      await tx.employee.update({
        where: { id: input.employeeId },
        data: {
          wageRate: new Prisma.Decimal(input.wageRate.toFixed(2)),
          employmentType: input.employmentType,
        },
      });
    }

    // Same trail as every other read and write of a wage.
    await tx.employeeAccessLog.create({
      data: {
        employeeId: input.employeeId,
        actorId: actor.id,
        actorName: actor.name,
        action: 'edit',
      },
    });

    return row;
  });

  return created.id;
}

/**
 * Remove an adjustment entered by mistake.
 *
 * Deleting rewrites history, so it is deliberately narrow: only the newest row
 * can go, and removing it restores the employee's current rate to whatever now
 * applies. Anything older is left alone — a payroll run may already have been
 * computed against it, and quietly changing the basis of a payment that has
 * been made is worse than living with a wrong-looking row.
 */
export async function deleteLatestWageChange(
  employeeId: string,
  changeId: string,
  actor: { id: string; name: string },
): Promise<void> {
  const rows = await prisma.employeeWageChange.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: 'desc' },
    take: 2,
    select: { id: true, wageRate: true, employmentType: true },
  });

  const newest = rows[0];
  if (!newest || newest.id !== changeId) {
    throw new WageError('ลบได้เฉพาะรายการล่าสุดเท่านั้น');
  }

  await prisma.$transaction(async (tx) => {
    await tx.employeeWageChange.delete({ where: { id: changeId } });

    const previous = rows[1];
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        wageRate: previous ? previous.wageRate : null,
        ...(previous ? { employmentType: previous.employmentType } : {}),
      },
    });

    await tx.employeeAccessLog.create({
      data: { employeeId, actorId: actor.id, actorName: actor.name, action: 'edit' },
    });
  });
}
