import { describe, it, expect } from 'vitest';
import {
  entitlementDays,
  LEAVE_POLICY_DEFAULTS,
  leaveDaysBetween,
  policyShortfalls,
  splitLeave,
  STATUTORY_MINIMUM_PAID_DAYS,
} from '../src/modules/hr/leave-rules';

/**
 * How much leave is paid.
 *
 * The figures come from the client rather than the law, which is exactly why
 * they are pinned here: somebody will read 15 paid sick days one day and
 * assume it is the statutory number. It is not, and one of these tests says so
 * out loud.
 *
 * Pure functions, no database.
 */

const POLICY = LEAVE_POLICY_DEFAULTS;

describe('what the client asked for, against what the law requires', () => {
  it('is below the statutory minimum, and reports where', () => {
    // Raised with the client and confirmed on 26 ส.ค. — their decision to
    // make. Held in config so it can change the day they reconsider, and
    // named here so nobody mistakes it for the legal figure.
    const shortfalls = policyShortfalls(POLICY);
    const byType = Object.fromEntries(shortfalls.map((s) => [s.type, s]));

    expect(byType.SICK).toEqual({ type: 'SICK', applied: 15, statutory: 30 });
    expect(byType.PERSONAL).toEqual({ type: 'PERSONAL', applied: 0, statutory: 3 });
  });

  it('reports nothing once a policy meets the law', () => {
    expect(
      policyShortfalls({
        sickPaidDaysPerYear: STATUTORY_MINIMUM_PAID_DAYS.SICK!,
        sickMonthlyStaffOnly: false,
        personalPaidDaysPerYear: STATUTORY_MINIMUM_PAID_DAYS.PERSONAL!,
        annualPaidDaysPerYear: STATUTORY_MINIMUM_PAID_DAYS.ANNUAL!,
      }),
    ).toEqual([]);
  });
});

describe('entitlement', () => {
  it('gives monthly staff the sick days the client set', () => {
    expect(entitlementDays(POLICY, 'SICK', 'MONTHLY')).toBe(15);
  });

  it('gives daily staff none, which is the client\'s restriction not the law\'s', () => {
    // ม.57 does not distinguish between monthly and daily employees.
    expect(entitlementDays(POLICY, 'SICK', 'DAILY')).toBe(0);
  });

  it('stops restricting sick leave once the switch is turned off', () => {
    const openPolicy = { ...POLICY, sickMonthlyStaffOnly: false };
    expect(entitlementDays(openPolicy, 'SICK', 'DAILY')).toBe(15);
  });

  it('pays nothing for personal leave, as instructed', () => {
    expect(entitlementDays(POLICY, 'PERSONAL', 'MONTHLY')).toBe(0);
  });

  it('never pays for leave taken as unpaid', () => {
    expect(entitlementDays(POLICY, 'UNPAID', 'MONTHLY')).toBe(0);
  });
});

describe('splitting a request', () => {
  it('pays a request that fits inside the entitlement', () => {
    const split = splitLeave({
      policy: POLICY, type: 'SICK', employmentType: 'MONTHLY',
      paidDaysUsed: 0, requestedDays: 3,
    });

    expect(split).toMatchObject({ paidDays: 3, unpaidDays: 0, remainingAfter: 12 });
  });

  it('splits rather than refuses when the request runs past it', () => {
    // People are ill for longer than their allowance, and refusing the leave
    // does not make them well. The split lets them see, before they commit,
    // which days they will not be paid for.
    const split = splitLeave({
      policy: POLICY, type: 'SICK', employmentType: 'MONTHLY',
      paidDaysUsed: 13, requestedDays: 5,
    });

    expect(split.paidDays).toBe(2);
    expect(split.unpaidDays).toBe(3);
    expect(split.partlyUnpaid).toBe(true);
    expect(split.remainingAfter).toBe(0);
  });

  it('makes the whole request unpaid once the allowance is gone', () => {
    const split = splitLeave({
      policy: POLICY, type: 'SICK', employmentType: 'MONTHLY',
      paidDaysUsed: 15, requestedDays: 2,
    });

    expect(split.paidDays).toBe(0);
    expect(split.unpaidDays).toBe(2);
  });

  it('makes personal leave unpaid from the first day', () => {
    const split = splitLeave({
      policy: POLICY, type: 'PERSONAL', employmentType: 'MONTHLY',
      paidDaysUsed: 0, requestedDays: 1,
    });

    expect(split.paidDays).toBe(0);
    expect(split.unpaidDays).toBe(1);
  });

  it('makes a daily worker\'s sick leave unpaid under this policy', () => {
    const split = splitLeave({
      policy: POLICY, type: 'SICK', employmentType: 'DAILY',
      paidDaysUsed: 0, requestedDays: 2,
    });
    expect(split.unpaidDays).toBe(2);
  });

  it('is not confused by a used count above the entitlement', () => {
    // Data can be untidy — a correction, an import. It must not produce
    // negative remaining days or a negative unpaid split.
    const split = splitLeave({
      policy: POLICY, type: 'SICK', employmentType: 'MONTHLY',
      paidDaysUsed: 40, requestedDays: 2,
    });

    expect(split.paidDays).toBe(0);
    expect(split.unpaidDays).toBe(2);
    expect(split.remainingAfter).toBe(0);
  });

  it('returns nothing for a request of no days', () => {
    for (const requestedDays of [0, -3, Number.NaN]) {
      const split = splitLeave({
        policy: POLICY, type: 'SICK', employmentType: 'MONTHLY',
        paidDaysUsed: 0, requestedDays,
      });
      expect(split.paidDays).toBe(0);
      expect(split.unpaidDays).toBe(0);
    }
  });
});

describe('counting the days of a request', () => {
  it('counts both ends', () => {
    // Monday to Friday is five days off, not four.
    expect(
      leaveDaysBetween(new Date('2026-09-07T00:00:00Z'), new Date('2026-09-11T00:00:00Z')),
    ).toBe(5);
  });

  it('counts a single day as one', () => {
    const day = new Date('2026-09-07T00:00:00Z');
    expect(leaveDaysBetween(day, day)).toBe(1);
  });

  it('is not thrown by a time of day', () => {
    // Leave is counted in calendar days; the hours on the timestamp are noise.
    expect(
      leaveDaysBetween(new Date('2026-09-07T18:00:00Z'), new Date('2026-09-08T02:00:00Z')),
    ).toBe(2);
  });

  it('returns nothing when the dates are the wrong way round', () => {
    expect(
      leaveDaysBetween(new Date('2026-09-11T00:00:00Z'), new Date('2026-09-07T00:00:00Z')),
    ).toBe(0);
  });

  it('counts calendar days, not working days', () => {
    // A working calendar was never supplied. Inventing one would quietly
    // change what a request costs somebody, so a weekend counts.
    expect(
      leaveDaysBetween(new Date('2026-09-04T00:00:00Z'), new Date('2026-09-07T00:00:00Z')),
    ).toBe(4);
  });
});
