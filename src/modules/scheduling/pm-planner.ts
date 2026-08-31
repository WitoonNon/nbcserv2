import type { DayAvailability } from './quota.service';

/**
 * Choosing WHEN a preventive-maintenance visit should be proposed.
 *
 * Split out from the service and kept pure so it can be tested without a
 * database. It is the part of PM planning that is actually hard: everything
 * else is a query, but this decides whether a hundred machines all coming due
 * in the same week land on the same Tuesday.
 *
 * ## Why proposals count against each other
 *
 * A proposal is not a booking. It must not consume quota, because a machine
 * nobody has confirmed a visit for should never take a slot from a customer
 * who is trying to book one now. But if proposals were invisible to each
 * other, the planner would happily place every one of them on the first open
 * day and undo its own purpose.
 *
 * So the planner tracks its own proposals separately and spreads across them,
 * while real quota decides only whether a day is open at all. Proposals
 * compete with proposals; paying customers always win.
 */

/** How many PM visits the planner will put on one day in one zone. */
export const MAX_PM_PROPOSALS_PER_DAY = 3;

/** How far either side of the due date a visit may be pulled. */
export const PM_WINDOW_BEFORE_DAYS = 7;
export const PM_WINDOW_AFTER_DAYS = 21;

export interface PmSlotRequest {
  /** yyyy-mm-dd the machine is actually due. */
  dueOn: string;
  units: number;
  minutes: number;
}

export interface PmSlotChoice {
  date: string;
  /** Days from the due date. Negative is early. */
  offsetDays: number;
}

/** How many proposals this planner has already placed, keyed by yyyy-mm-dd. */
export type PlacedByDate = ReadonlyMap<string, number>;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Pick the day to propose, or null when nothing in the window works.
 *
 * Preference order, in full:
 *
 *  1. closest to the date the machine is actually due — a PM done three weeks
 *     late is a machine that ran three weeks dirty
 *  2. earlier over later at equal distance, because being early is a service
 *     and being late is a lapse
 *
 * A day is usable only when quota says it is open AND has room for this job's
 * units and minutes, AND the planner has not already filled it with its own
 * proposals.
 */
export function pickPmDate(
  request: PmSlotRequest,
  availability: readonly DayAvailability[],
  placed: PlacedByDate,
  maxPerDay: number = MAX_PM_PROPOSALS_PER_DAY,
): PmSlotChoice | null {
  const candidates = availability
    .map((day) => ({ day, offset: daysBetween(request.dueOn, day.date) }))
    .filter(({ offset }) => offset >= -PM_WINDOW_BEFORE_DAYS && offset <= PM_WINDOW_AFTER_DAYS)
    .filter(({ day }) => fitsOn(day, request))
    .filter(({ day }) => (placed.get(day.date) ?? 0) < maxPerDay)
    .sort((a, b) => {
      const distance = Math.abs(a.offset) - Math.abs(b.offset);
      if (distance !== 0) return distance;
      // Equal distance: take the earlier one.
      return a.offset - b.offset;
    });

  const chosen = candidates[0];
  return chosen ? { date: chosen.day.date, offsetDays: chosen.offset } : null;
}

/**
 * Does this visit fit in what is left of the day?
 *
 * `available` already accounts for the caller's requested size, but the
 * planner asks for availability once per zone and then places jobs of
 * different sizes against it, so the axes are re-checked per job here.
 * A null capacity means unlimited on that axis, not zero.
 */
function fitsOn(day: DayAvailability, request: PmSlotRequest): boolean {
  if (!day.available) return false;
  if (day.remainingUnits !== null && day.remainingUnits < request.units) return false;
  if (day.remainingMinutes !== null && day.remainingMinutes < request.minutes) return false;
  return true;
}

/**
 * Plan a whole batch, spreading as it goes.
 *
 * Sorted by due date first so the most overdue machine gets the best pick.
 * Without that, the order the database happened to return rows in would decide
 * who waits — and the machine that has gone longest without a service is
 * exactly the one that should not.
 */
export function planPmBatch<T extends PmSlotRequest>(
  requests: readonly T[],
  availability: readonly DayAvailability[],
  alreadyPlaced: PlacedByDate = new Map(),
  maxPerDay: number = MAX_PM_PROPOSALS_PER_DAY,
): { request: T; choice: PmSlotChoice | null }[] {
  const placed = new Map(alreadyPlaced);

  return [...requests]
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
    .map((request) => {
      const choice = pickPmDate(request, availability, placed, maxPerDay);
      if (choice) {
        placed.set(choice.date, (placed.get(choice.date) ?? 0) + 1);
      }
      // A request with no workable day is returned unplaced rather than forced
      // onto a full day. The office sees it and decides; the planner does not
      // get to oversell a day just because it ran out of options.
      return { request, choice };
    });
}

/**
 * When the next visit falls due after one has been done.
 *
 * Counted from the visit that actually happened, not from when it was due —
 * a PM done a month late should not pull the whole rest of the year forward
 * with it.
 */
export function nextPmDueAfter(completedAt: Date, visitsPerYear: number): Date {
  // A machine on an unknown or nonsensical schedule falls back to twice a
  // year, which is the tier the client's own price list treats as standard.
  const perYear = Number.isFinite(visitsPerYear) && visitsPerYear > 0 ? visitsPerYear : 2;
  const monthsBetween = 12 / perYear;

  const wholeMonths = Math.floor(monthsBetween);
  const next = addMonthsClamped(completedAt, wholeMonths);

  // The remainder is carried in days so an odd frequency is not silently
  // rounded into a different schedule.
  const leftoverDays = Math.round((monthsBetween - wholeMonths) * 30);
  if (leftoverDays > 0) next.setUTCDate(next.getUTCDate() + leftoverDays);

  return next;
}

/**
 * Add months, landing on the last day of the target month when the day of the
 * month does not exist there.
 *
 * `setUTCMonth` alone rolls 31 January + 3 months into 1 May, because 31 April
 * does not exist. A quarterly PM done on the 31st would drift a day into the
 * following month every time, and on a machine serviced for years that walks
 * the schedule off its intended month entirely.
 */
function addMonthsClamped(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const day = from.getUTCDate();

  // Day 0 of the following month is the last day of this one.
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDayOfTarget),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
    ),
  );
}
