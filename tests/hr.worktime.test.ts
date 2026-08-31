import { describe, it, expect } from 'vitest';
import {
  bangkokDay,
  dailyRows,
  minutesToHours,
  pairPunches,
  summariseAttendance,
  type Punch,
} from '../src/modules/hr/worktime';

/**
 * Pairing punches into hours, without a database.
 *
 * This is the module that connects the time clock to the money — before it,
 * payroll counted calendar days and never read a punch. The cases below are
 * the ones that decide somebody's pay: a forgotten punch, a day that starts in
 * UTC yesterday, and anything that would let invented minutes through.
 */

const at = (iso: string): Date => new Date(iso);
const punch = (kind: 'IN' | 'OUT', iso: string): Punch => ({ kind, occurredAt: at(iso) });

describe('pairing', () => {
  it('turns an in and an out into one session', () => {
    const [session] = pairPunches([
      punch('IN', '2026-09-01T01:00:00Z'),
      punch('OUT', '2026-09-01T10:00:00Z'),
    ]);
    expect(session!.minutes).toBe(540);
    expect(session!.problem).toBeNull();
  });

  it('sorts punches that arrive out of order', () => {
    const [session] = pairPunches([
      punch('OUT', '2026-09-01T10:00:00Z'),
      punch('IN', '2026-09-01T01:00:00Z'),
    ]);
    expect(session!.minutes).toBe(540);
  });

  it('never invents an end time for somebody who forgot to punch out', () => {
    const sessions = pairPunches([punch('IN', '2026-09-01T01:00:00Z')]);
    expect(sessions[0]!.problem).toBe('OPEN');
    // The whole point of the flag is that a human looks. Guessing an end would
    // put minutes nobody witnessed into a payslip.
    expect(sessions[0]!.minutes).toBe(0);
  });

  it('leaves the earlier one open when a second IN arrives', () => {
    const sessions = pairPunches([
      punch('IN', '2026-09-01T01:00:00Z'),
      punch('IN', '2026-09-02T01:00:00Z'),
      punch('OUT', '2026-09-02T10:00:00Z'),
    ]);
    expect(sessions.map((s) => s.problem)).toEqual(['OPEN', null]);
    expect(sessions[1]!.minutes).toBe(540);
  });

  it('records an out with no in rather than dropping it', () => {
    const sessions = pairPunches([punch('OUT', '2026-09-01T10:00:00Z')]);
    // Evidence the person was here. Dropping it would hide a real problem.
    expect(sessions[0]!.problem).toBe('ORPHAN_OUT');
    expect(sessions[0]!.minutes).toBe(0);
  });

  it('counts no minutes for a session longer than the 16-hour cap', () => {
    const sessions = pairPunches([
      punch('IN', '2026-09-01T01:00:00Z'),
      punch('OUT', '2026-09-02T05:00:00Z'),
    ]);
    expect(sessions[0]!.problem).toBe('TOO_LONG');
    expect(sessions[0]!.minutes).toBe(0);
  });

  it('keeps a session that crosses midnight on the day it started', () => {
    // 21:00 to 02:00 Bangkok. Shifts are out of scope, so the rule is simply
    // "the day it started" — which needs no shift calendar to be true.
    const sessions = pairPunches([
      punch('IN', '2026-09-01T14:00:00Z'),
      punch('OUT', '2026-09-01T19:00:00Z'),
    ]);
    expect(sessions[0]!.day).toBe('2026-09-01');
    expect(sessions[0]!.minutes).toBe(300);
  });
});

describe('the Bangkok day', () => {
  it('reads 07:00 Bangkok as that calendar day, not the UTC one', () => {
    // 2026-09-01T00:00:00Z is 07:00 on 1 Sep in Bangkok.
    expect(bangkokDay(at('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
  });

  it('reads 06:00 Bangkok as the day after the UTC date', () => {
    // 23:00 UTC on the 1st is 06:00 on the 2nd in Bangkok — the morning shift
    // this system exists to record.
    expect(bangkokDay(at('2026-09-01T23:00:00Z'))).toBe('2026-09-02');
  });
});

describe('the summary payroll reads', () => {
  const twoDays: Punch[] = [
    punch('IN', '2026-09-01T01:00:00Z'),
    punch('OUT', '2026-09-01T10:00:00Z'),
    punch('IN', '2026-09-02T01:00:00Z'),
    punch('OUT', '2026-09-02T10:00:00Z'),
  ];

  it('counts days and minutes', () => {
    const summary = summariseAttendance(twoDays);
    expect(summary.daysPresent).toBe(2);
    expect(summary.minutesWorked).toBe(1080);
    expect(summary.openSessions).toBe(0);
  });

  it('counts a day present even when the pairing is broken', () => {
    const summary = summariseAttendance([punch('IN', '2026-09-01T01:00:00Z')]);
    // The punch is not in doubt, only its partner — the person was at work.
    expect(summary.daysPresent).toBe(1);
    expect(summary.minutesWorked).toBe(0);
    expect(summary.openSessions).toBe(1);
  });

  it('reports nothing for somebody who never punched', () => {
    const summary = summariseAttendance([]);
    expect(summary.daysPresent).toBe(0);
    expect(summary.minutesWorked).toBe(0);
  });

  it('adds up two sessions in one day', () => {
    const summary = summariseAttendance([
      punch('IN', '2026-09-01T01:00:00Z'),
      punch('OUT', '2026-09-01T05:00:00Z'),
      punch('IN', '2026-09-01T06:00:00Z'),
      punch('OUT', '2026-09-01T10:00:00Z'),
    ]);
    expect(summary.daysPresent).toBe(1);
    expect(summary.minutesWorked).toBe(480);
  });
});

describe('the daily report', () => {
  it('gives one row per day with first in and last out', () => {
    const rows = dailyRows([
      punch('IN', '2026-09-01T01:00:00Z'),
      punch('OUT', '2026-09-01T05:00:00Z'),
      punch('IN', '2026-09-01T06:00:00Z'),
      punch('OUT', '2026-09-01T10:00:00Z'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstIn?.toISOString()).toBe('2026-09-01T01:00:00.000Z');
    expect(rows[0]!.lastOut?.toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(rows[0]!.minutes).toBe(480);
  });

  it('sorts by day', () => {
    const rows = dailyRows([
      punch('IN', '2026-09-03T01:00:00Z'),
      punch('OUT', '2026-09-03T05:00:00Z'),
      punch('IN', '2026-09-01T01:00:00Z'),
      punch('OUT', '2026-09-01T05:00:00Z'),
    ]);
    expect(rows.map((r) => r.day)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('carries the problem up to the day so it cannot be missed', () => {
    const rows = dailyRows([punch('IN', '2026-09-01T01:00:00Z')]);
    expect(rows[0]!.problem).toBe('OPEN');
  });
});

describe('hours', () => {
  it('rounds to two places', () => {
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(100)).toBe(1.67);
  });
});
