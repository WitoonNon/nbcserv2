import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import type { EmploymentType, OvertimeKind } from '@/generated/prisma';

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
  /** อัตราค่าล่วงเวลารายบุคคล — omitted or null = ใช้ขั้นต่ำตามกฎหมาย. */
  otWorkdayMultiplier?: number | null;
  otHolidayWorkMultiplier?: number | null;
  otHolidayOtMultiplier?: number | null;
}

/**
 * An optional personal overtime multiplier as it goes into the column.
 *
 * Rejected rather than clamped when it is below 1: a rate under the plain
 * hourly wage is a typo every time, and storing it would leave a number on the
 * record that overtimeAmount() silently overrides. Below the statutory floor
 * but above 1 is allowed through here and raised at approval, where the
 * correction is reported to the person making it.
 */
function rate(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 1) {
    throw new WageError('อัตราค่าล่วงเวลาต้องไม่น้อยกว่า 1 เท่า');
  }
  return new Prisma.Decimal(value.toFixed(2));
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

export interface PeriodWageSegment {
  /** First day of the period this rate covered, inclusive. */
  from: Date;
  /** Last day it covered, inclusive. */
  to: Date;
  calendarDays: number;
  wageRate: number;
  employmentType: EmploymentType;
}

const DAY_MS = 86_400_000;

function daysInclusive(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

/**
 * The period cut into stretches where the wage did not change.
 *
 * `wagesAtDate` answers "the rate on one day", which is the right question for
 * a period that had a single rate throughout and the wrong one for a period
 * containing a raise. Asking it with the period's last day — which is what
 * payroll did — prices the days before the raise at the rate that replaced
 * them.
 *
 * Returns an empty list for anybody with no rate on record at all. Payroll
 * must read that as "cannot compute", exactly as it reads a missing entry from
 * `wagesAtDate`, and never as zero.
 */
export async function wageSegmentsInPeriod(
  employeeIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, PeriodWageSegment[]>> {
  const out = new Map<string, PeriodWageSegment[]>();
  if (employeeIds.length === 0) return out;

  // The rate each person was already on when the period opened.
  const opening = await wagesAtDate(employeeIds, from);

  // Every change landing inside the period, in order.
  const changes = await prisma.employeeWageChange.findMany({
    where: {
      employeeId: { in: employeeIds },
      effectiveFrom: { gt: from, lte: to },
    },
    orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'asc' }],
    select: { employeeId: true, effectiveFrom: true, wageRate: true, employmentType: true },
  });

  const changesByEmployee = new Map<string, typeof changes>();
  for (const c of changes) {
    const list = changesByEmployee.get(c.employeeId) ?? [];
    list.push(c);
    changesByEmployee.set(c.employeeId, list);
  }

  for (const id of employeeIds) {
    const mid = changesByEmployee.get(id) ?? [];
    const start = opening.get(id);

    // Nothing before the period and nothing during it: no rate on record.
    if (!start && mid.length === 0) continue;

    const segments: PeriodWageSegment[] = [];
    let cursor = from;
    let current = start ?? null;

    for (const change of mid) {
      if (current) {
        const segTo = new Date(change.effectiveFrom.getTime() - DAY_MS);
        if (segTo >= cursor) {
          segments.push({
            from: cursor,
            to: segTo,
            calendarDays: daysInclusive(cursor, segTo),
            wageRate: current.wageRate,
            employmentType: current.employmentType,
          });
        }
      }
      cursor = change.effectiveFrom;
      current = {
        wageRate: Number(change.wageRate),
        employmentType: change.employmentType,
      };
    }

    if (current && to >= cursor) {
      segments.push({
        from: cursor,
        to,
        calendarDays: daysInclusive(cursor, to),
        wageRate: current.wageRate,
        employmentType: current.employmentType,
      });
    }

    if (segments.length > 0) out.set(id, segments);
  }

  return out;
}

/**
 * The personal overtime rates in force on a day — ใบเสนอราคาข้อ 5.
 *
 * Same "in force on that date" rule as the wage, and for the same reason: a
 * rate edited in September must not change what August paid. Missing entries
 * mean "use the statutory floor", which is what almost everybody is on.
 */
export async function otRatesAtDate(
  employeeId: string,
  on: Date,
): Promise<Partial<Record<OvertimeKind, number>>> {
  const row = await prisma.employeeWageChange.findFirst({
    where: { employeeId, effectiveFrom: { lte: on } },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      otWorkdayMultiplier: true,
      otHolidayWorkMultiplier: true,
      otHolidayOtMultiplier: true,
    },
  });
  if (!row) return {};

  const rates: Partial<Record<OvertimeKind, number>> = {};
  if (row.otWorkdayMultiplier !== null) rates.WORKDAY_OT = Number(row.otWorkdayMultiplier);
  if (row.otHolidayWorkMultiplier !== null) {
    rates.HOLIDAY_WORK = Number(row.otHolidayWorkMultiplier);
  }
  if (row.otHolidayOtMultiplier !== null) rates.HOLIDAY_OT = Number(row.otHolidayOtMultiplier);
  return rates;
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
        otWorkdayMultiplier: rate(input.otWorkdayMultiplier),
        otHolidayWorkMultiplier: rate(input.otHolidayWorkMultiplier),
        otHolidayOtMultiplier: rate(input.otHolidayOtMultiplier),
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
 * Set a wage from the employee form, where there is no "effective from" box.
 *
 * The form has a wage field and used to write only `Employee.wageRate`. That
 * column is the *current* rate for display; payroll reads the history, so a
 * wage typed into the form saved cleanly, showed on the screen, and left the
 * payroll run reporting "ยังไม่ได้บันทึกค่าแรง" for that person. The office
 * would have entered ten salaries, seen ten confirmations, and found the run
 * still blocked on all ten with nothing explaining why.
 *
 * So the form's wage becomes a history entry too:
 *
 *  - unchanged from what is already in force → nothing written, so re-saving a
 *    record to fix a phone number does not litter the history with duplicates
 *  - a change on a date that already has one → that row is replaced, because
 *    two corrections on the same day are one decision being typed twice
 *  - otherwise a new entry, effective from the hire date for somebody with no
 *    wage yet, and from today for a change to an existing one
 *
 * Backdating to the hire date matters: a new joiner entered mid-month must be
 * payable for the days already worked, and an entry effective today would
 * leave those days with no rate at all.
 */
export async function setWageFromEmployeeForm(
  params: {
    employeeId: string;
    wageRate: number;
    employmentType: EmploymentType;
    /** The person's hire date, used when they have no wage on record yet. */
    hiredAt?: Date | null;
  },
  actor: { id: string; name: string },
): Promise<'created' | 'replaced' | 'unchanged'> {
  const existing = await prisma.employeeWageChange.findFirst({
    where: { employeeId: params.employeeId },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, effectiveFrom: true, wageRate: true, employmentType: true },
  });

  if (
    existing &&
    Number(existing.wageRate) === params.wageRate &&
    existing.employmentType === params.employmentType
  ) {
    return 'unchanged';
  }

  const today = new Date();
  const todayOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  // First wage ever: backdate to the hire date so days already worked have one.
  const effectiveFrom = existing ? todayOnly : (params.hiredAt ?? todayOnly);

  const sameDay = await prisma.employeeWageChange.findUnique({
    where: {
      employeeId_effectiveFrom: { employeeId: params.employeeId, effectiveFrom },
    },
    select: { id: true },
  });

  if (sameDay) {
    await prisma.$transaction(async (tx) => {
      await tx.employeeWageChange.update({
        where: { id: sameDay.id },
        data: {
          wageRate: new Prisma.Decimal(params.wageRate.toFixed(2)),
          employmentType: params.employmentType,
          recordedById: actor.id,
          recordedByName: actor.name,
        },
      });
      await tx.employee.update({
        where: { id: params.employeeId },
        data: {
          wageRate: new Prisma.Decimal(params.wageRate.toFixed(2)),
          employmentType: params.employmentType,
        },
      });
    });
    return 'replaced';
  }

  await recordWageChange(
    {
      employeeId: params.employeeId,
      effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
      wageRate: params.wageRate,
      employmentType: params.employmentType,
      reason: existing ? null : 'ค่าแรงตั้งต้น — บันทึกจากหน้าข้อมูลพนักงาน',
    },
    actor,
  );
  return 'created';
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
