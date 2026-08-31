/**
 * Turning punches into hours.
 *
 * Pure and on its own, because this is what connects the time clock to the
 * money. Until this existed, payroll counted calendar days minus leave and
 * never read a single punch — somebody absent without leave was paid in full.
 *
 * ## What this does NOT decide
 *
 * Shifts, night rates and crossing-midnight rules are out of scope (they are
 * named in the quotation's exclusion list). A session is paired strictly in
 * time order and attributed to the day it STARTED, which is the reading that
 * needs no shift calendar to be true.
 */

/** Longer than this is a forgotten punch, not a shift. Matches the overtime cap. */
export const MAX_SESSION_MINUTES = 16 * 60;

export type PunchKind = 'IN' | 'OUT';

export interface Punch {
  kind: PunchKind;
  occurredAt: Date;
}

export interface WorkSession {
  in: Date;
  /** Null when the person never punched out. */
  out: Date | null;
  /** Counted minutes. Zero for an open or over-long session — never guessed. */
  minutes: number;
  /** Bangkok calendar day the session started, 'YYYY-MM-DD'. */
  day: string;
  /**
   * Why this session contributes no minutes:
   * `OPEN` punched in, never out · `TOO_LONG` beyond MAX_SESSION_MINUTES ·
   * `ORPHAN_OUT` an out with no in before it.
   */
  problem: 'OPEN' | 'TOO_LONG' | 'ORPHAN_OUT' | null;
}

/** The Bangkok calendar day of an instant. en-CA is the locale that formats YYYY-MM-DD. */
export function bangkokDay(at: Date): string {
  return at.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

/**
 * Pair punches into sessions.
 *
 * An IN arriving while one is already open does not close it: the earlier one
 * is left OPEN and reported. Guessing an end time would put invented minutes
 * into somebody's pay, and the whole point of the flag is that a human looks.
 */
export function pairPunches(punches: Punch[]): WorkSession[] {
  const ordered = [...punches].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const sessions: WorkSession[] = [];
  let open: Date | null = null;

  const pushOpen = (at: Date) => {
    sessions.push({ in: at, out: null, minutes: 0, day: bangkokDay(at), problem: 'OPEN' });
  };

  for (const punch of ordered) {
    if (punch.kind === 'IN') {
      if (open) pushOpen(open);
      open = punch.occurredAt;
      continue;
    }

    if (!open) {
      // An OUT with nothing before it. Recorded rather than dropped: it is
      // evidence the person was here, and dropping it hides a real problem.
      sessions.push({
        in: punch.occurredAt,
        out: punch.occurredAt,
        minutes: 0,
        day: bangkokDay(punch.occurredAt),
        problem: 'ORPHAN_OUT',
      });
      continue;
    }

    const minutes = Math.round((punch.occurredAt.getTime() - open.getTime()) / 60_000);
    const tooLong = minutes > MAX_SESSION_MINUTES;
    sessions.push({
      in: open,
      out: punch.occurredAt,
      minutes: tooLong ? 0 : Math.max(0, minutes),
      day: bangkokDay(open),
      problem: tooLong ? 'TOO_LONG' : null,
    });
    open = null;
  }

  if (open) pushOpen(open);
  return sessions;
}

export interface AttendanceSummary {
  /** Distinct Bangkok days with at least one punch. */
  daysPresent: number;
  minutesWorked: number;
  /** Sessions that contributed no minutes and need somebody to look. */
  openSessions: number;
  sessions: WorkSession[];
}

export function summariseAttendance(punches: Punch[]): AttendanceSummary {
  const sessions = pairPunches(punches);
  const days = new Set(sessions.map((s) => s.day));

  return {
    // A day somebody was clearly at work counts as present even when the
    // pairing is broken — the punch is not in doubt, only its partner.
    daysPresent: days.size,
    minutesWorked: sessions.reduce((sum, s) => sum + s.minutes, 0),
    openSessions: sessions.filter((s) => s.problem !== null).length,
    sessions,
  };
}

/** Hours, rounded to two places for display and for payroll lines. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export interface DayRow {
  day: string;
  minutes: number;
  firstIn: Date | null;
  lastOut: Date | null;
  problem: WorkSession['problem'];
}

/** One row per day worked — the daily report the quotation asks for. */
export function dailyRows(punches: Punch[]): DayRow[] {
  const byDay = new Map<string, DayRow>();

  for (const session of pairPunches(punches)) {
    const row = byDay.get(session.day) ?? {
      day: session.day,
      minutes: 0,
      firstIn: null,
      lastOut: null,
      problem: null,
    };

    row.minutes += session.minutes;
    if (!row.firstIn || session.in < row.firstIn) row.firstIn = session.in;
    if (session.out && (!row.lastOut || session.out > row.lastOut)) row.lastOut = session.out;
    // The first problem of the day is enough to make somebody look at it.
    row.problem = row.problem ?? session.problem;

    byDay.set(session.day, row);
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}
