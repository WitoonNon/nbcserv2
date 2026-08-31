import { describe, it, expect } from 'vitest';
import {
  MAX_PM_PROPOSALS_PER_DAY,
  nextPmDueAfter,
  pickPmDate,
  planPmBatch,
} from '../src/modules/scheduling/pm-planner';
import type { DayAvailability } from '../src/modules/scheduling/quota.service';

/**
 * Choosing when a PM visit is proposed.
 *
 * This is the part of PM planning worth defending. Finding machines that are
 * due is a query; deciding that a hundred of them coming due in the same week
 * must not all land on the same Tuesday is a judgement, and it is the reason
 * the feature exists at all — a planner that piles every visit onto the first
 * open day has simply moved the scheduling problem, not solved it.
 *
 * Pure functions, no database.
 */

function day(date: string, over: Partial<DayAvailability> = {}): DayAvailability {
  return {
    date,
    status: 'OPEN',
    available: true,
    remainingJobs: 8,
    remainingUnits: 20,
    remainingMinutes: 480,
    ...over,
  };
}

/** A fortnight of wide-open days from 10 August. */
const openFortnight = Array.from({ length: 14 }, (_, i) =>
  day(`2026-08-${String(10 + i).padStart(2, '0')}`),
);

describe('picking the day for one visit', () => {
  it('proposes the day the machine is actually due', () => {
    const choice = pickPmDate({ dueOn: '2026-08-15', units: 2, minutes: 60 }, openFortnight, new Map());

    expect(choice?.date).toBe('2026-08-15');
    expect(choice?.offsetDays).toBe(0);
  });

  it('takes the nearest day when the due date is closed', () => {
    const availability = openFortnight.map((d) =>
      d.date === '2026-08-15' ? day(d.date, { available: false, status: 'HOLIDAY' }) : d,
    );

    const choice = pickPmDate({ dueOn: '2026-08-15', units: 2, minutes: 60 }, availability, new Map());

    expect(Math.abs(choice!.offsetDays)).toBe(1);
  });

  it('prefers early over late at the same distance', () => {
    // Being early is a service; being late means the machine ran dirty for
    // that long. A tie must not be broken by whichever the database returned.
    const availability = openFortnight.map((d) =>
      d.date === '2026-08-15' ? day(d.date, { available: false }) : d,
    );

    expect(pickPmDate({ dueOn: '2026-08-15', units: 1, minutes: 30 }, availability, new Map())?.date)
      .toBe('2026-08-14');
  });

  it('will not squeeze a visit onto a day without room for its units', () => {
    const availability = [day('2026-08-15', { remainingUnits: 3 }), day('2026-08-16')];

    // A 12-unit factory PM does not fit in three remaining units, even though
    // the day reports itself available for a smaller job.
    const choice = pickPmDate({ dueOn: '2026-08-15', units: 12, minutes: 360 }, availability, new Map());
    expect(choice?.date).toBe('2026-08-16');
  });

  it('respects the crew-minutes axis as well', () => {
    const availability = [day('2026-08-15', { remainingMinutes: 60 }), day('2026-08-16')];

    const choice = pickPmDate({ dueOn: '2026-08-15', units: 1, minutes: 360 }, availability, new Map());
    expect(choice?.date).toBe('2026-08-16');
  });

  it('treats an unlimited axis as unlimited, not as zero', () => {
    const availability = [day('2026-08-15', { remainingUnits: null, remainingMinutes: null })];

    expect(pickPmDate({ dueOn: '2026-08-15', units: 40, minutes: 3600 }, availability, new Map()))
      .not.toBeNull();
  });

  it('skips a day the planner has already filled with its own proposals', () => {
    const placed = new Map([['2026-08-15', MAX_PM_PROPOSALS_PER_DAY]]);

    const choice = pickPmDate({ dueOn: '2026-08-15', units: 1, minutes: 30 }, openFortnight, placed);
    expect(choice?.date).not.toBe('2026-08-15');
  });

  it('stays inside the window rather than proposing something absurd', () => {
    // Only a day two months out is open. Proposing a PM two months late is
    // not a plan, and the office needs to see it as unplaced instead.
    const availability = [day('2026-10-20')];

    expect(pickPmDate({ dueOn: '2026-08-15', units: 1, minutes: 30 }, availability, new Map()))
      .toBeNull();
  });

  it('returns nothing rather than overselling when the window is full', () => {
    const shut = openFortnight.map((d) => day(d.date, { available: false, status: 'FULL' }));

    expect(pickPmDate({ dueOn: '2026-08-15', units: 1, minutes: 30 }, shut, new Map())).toBeNull();
  });
});

describe('planning a batch', () => {
  it('spreads visits instead of piling them on the first open day', () => {
    // The whole point of the feature. Ten machines due the same day, on a
    // calendar that is completely open.
    const requests = Array.from({ length: 10 }, () => ({
      dueOn: '2026-08-15',
      units: 1,
      minutes: 30,
    }));

    const results = planPmBatch(requests, openFortnight);
    const perDay = new Map<string, number>();
    for (const { choice } of results) {
      expect(choice).not.toBeNull();
      perDay.set(choice!.date, (perDay.get(choice!.date) ?? 0) + 1);
    }

    expect([...perDay.values()].every((n) => n <= MAX_PM_PROPOSALS_PER_DAY)).toBe(true);
    expect(perDay.size).toBeGreaterThanOrEqual(4);
  });

  it('gives the most overdue machine the first pick', () => {
    const results = planPmBatch(
      [
        { dueOn: '2026-08-20', units: 1, minutes: 30, id: 'later' },
        { dueOn: '2026-08-12', units: 1, minutes: 30, id: 'overdue' },
      ],
      openFortnight,
    );

    // Sorted by due date, so the row order the database happened to return
    // does not decide who waits.
    expect(results[0]!.request.id).toBe('overdue');
    expect(results[0]!.choice?.date).toBe('2026-08-12');
  });

  it('counts proposals made earlier in the same run', () => {
    const requests = Array.from({ length: MAX_PM_PROPOSALS_PER_DAY + 1 }, () => ({
      dueOn: '2026-08-15',
      units: 1,
      minutes: 30,
    }));

    const dates = planPmBatch(requests, openFortnight).map((r) => r.choice!.date);
    expect(dates.filter((d) => d === '2026-08-15')).toHaveLength(MAX_PM_PROPOSALS_PER_DAY);
  });

  it('counts proposals already sitting in the database from an earlier run', () => {
    // The cron runs daily. Yesterday's proposals are still unconfirmed and
    // still occupy the technicians' day.
    const alreadyPlaced = new Map([['2026-08-15', MAX_PM_PROPOSALS_PER_DAY]]);

    const [result] = planPmBatch(
      [{ dueOn: '2026-08-15', units: 1, minutes: 30 }],
      openFortnight,
      alreadyPlaced,
    );
    expect(result!.choice?.date).not.toBe('2026-08-15');
  });

  it('reports what it could not place instead of forcing it', () => {
    const shut = openFortnight.map((d) => day(d.date, { available: false, status: 'FULL' }));

    const [result] = planPmBatch([{ dueOn: '2026-08-15', units: 1, minutes: 30 }], shut);
    // The office decides what to do with it. The planner does not get to
    // oversell a day because it ran out of options.
    expect(result!.choice).toBeNull();
  });

  it('does not mutate the caller\'s tally', () => {
    const alreadyPlaced = new Map([['2026-08-15', 1]]);
    planPmBatch([{ dueOn: '2026-08-15', units: 1, minutes: 30 }], openFortnight, alreadyPlaced);

    expect(alreadyPlaced.get('2026-08-15')).toBe(1);
  });
});

describe('when the next visit falls due', () => {
  it('counts from the visit that happened, not from when it was due', () => {
    // A PM done a month late must not drag the rest of the year forward.
    const done = new Date('2026-09-15T00:00:00Z');
    expect(nextPmDueAfter(done, 2).toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('handles the tiers the price list actually sells', () => {
    const done = new Date('2026-01-31T00:00:00Z');

    expect(nextPmDueAfter(done, 2).toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(nextPmDueAfter(done, 3).toISOString().slice(0, 10)).toBe('2026-05-31');
    // 31 April does not exist. Rolling into 1 May instead of clamping to the
    // 30th walks a quarterly schedule a day further off its month every time.
    expect(nextPmDueAfter(done, 4).toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('clamps into February rather than jumping into March', () => {
    const done = new Date('2026-12-31T00:00:00Z');
    expect(nextPmDueAfter(done, 6).toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('keeps the schedule on the same day when that day exists', () => {
    // The clamp must not pull ordinary dates backwards.
    const done = new Date('2026-03-15T00:00:00Z');
    expect(nextPmDueAfter(done, 4).toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  it('falls back to twice a year on a nonsense frequency', () => {
    // Rather than dividing by zero and scheduling the next visit forever away.
    const done = new Date('2026-01-15T00:00:00Z');
    for (const bad of [0, -1, Number.NaN]) {
      expect(nextPmDueAfter(done, bad).toISOString().slice(0, 10)).toBe('2026-07-15');
    }
  });
});
