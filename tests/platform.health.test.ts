import { describe, it, expect } from 'vitest';
import {
  assumptionCheck,
  backupCheck,
  holidayCoverageCheck,
  overallLevel,
  quotaRunwayCheck,
  type HealthCheck,
} from '../src/modules/platform/health-rules';

/**
 * The thresholds that decide whether anybody gets woken up.
 *
 * The rule being defended throughout: DOWN means customers cannot be served
 * NOW, WARN means they will stop being served on a date you can read. Only
 * DOWN sets a failing status code, because a monitor that pages for a stale
 * backup gets muted — and a muted monitor says nothing on the day the
 * database dies either.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('the worst check wins', () => {
  const mk = (level: HealthCheck['level']): HealthCheck => ({
    key: 'k',
    labelTh: 'l',
    level,
    detailTh: 'd',
  });

  it('is OK only when everything is', () => {
    expect(overallLevel([mk('OK'), mk('OK')])).toBe('OK');
  });

  it('lets one WARN colour the whole report', () => {
    expect(overallLevel([mk('OK'), mk('WARN')])).toBe('WARN');
  });

  it('lets one DOWN outrank any number of WARNs', () => {
    expect(overallLevel([mk('WARN'), mk('DOWN'), mk('WARN')])).toBe('DOWN');
  });

  it('treats an empty report as OK rather than inventing a fault', () => {
    expect(overallLevel([])).toBe('OK');
  });
});

describe('quota runway', () => {
  it('is fine at the full 90-day horizon', () => {
    expect(quotaRunwayCheck(90).level).toBe('OK');
  });

  it('warns while there is still time to fix the cron', () => {
    expect(quotaRunwayCheck(20).level).toBe('WARN');
  });

  it('is DOWN inside a week — bookings are about to start failing', () => {
    expect(quotaRunwayCheck(5).level).toBe('DOWN');
  });

  it('treats no calendar at all as DOWN, not as zero days', () => {
    // Nobody can book anything. That is an outage, whatever the cause.
    const check = quotaRunwayCheck(null);
    expect(check.level).toBe('DOWN');
    expect(check.detailTh).toContain('จองไม่ได้');
  });
});

describe('holiday coverage', () => {
  it('is satisfied when holidays reach past the last bookable day', () => {
    expect(
      holidayCoverageCheck({
        lastHolidayOn: day('2026-12-31'),
        bookableUntil: day('2026-11-30'),
        today: day('2026-09-01'),
      }).level,
    ).toBe('OK');
  });

  it('warns when bookings run past the last holiday on record', () => {
    // The failure this exists for: January is bookable, no 2027 holidays are
    // entered, and 1 January is dispatched as an ordinary working day.
    const check = holidayCoverageCheck({
      lastHolidayOn: day('2026-12-31'),
      bookableUntil: day('2027-02-28'),
      today: day('2026-12-01'),
    });
    expect(check.level).toBe('WARN');
    expect(check.detailTh).toContain('ขาดอยู่');
  });

  it('never reports DOWN — a person has to enter these, so paging is useless', () => {
    const check = holidayCoverageCheck({
      lastHolidayOn: null,
      bookableUntil: day('2027-02-28'),
      today: day('2026-12-01'),
    });
    expect(check.level).toBe('WARN');
  });
});

describe('backup freshness', () => {
  it('accepts a backup taken today', () => {
    expect(backupCheck(4).level).toBe('OK');
  });

  it('warns once a nightly backup has plainly been skipped', () => {
    expect(backupCheck(40).level).toBe('WARN');
  });

  it('is DOWN after a week — that is no backup at all', () => {
    expect(backupCheck(24 * 8).level).toBe('DOWN');
  });

  it('warns rather than fails when none has ever been taken', () => {
    // A fresh deployment has no backup yet and is not broken. Saying DOWN
    // here would make the very first health check red for a normal state.
    const check = backupCheck(null);
    expect(check.level).toBe('WARN');
    expect(check.detailTh).toContain('npm run backup');
  });
});

describe('outstanding assumptions', () => {
  it('is OK when everything has been confirmed', () => {
    expect(assumptionCheck([]).level).toBe('OK');
  });

  it('names the first few rather than only counting them', () => {
    const check = assumptionCheck(['office.location.lat', 'office.location.lng']);
    expect(check.level).toBe('WARN');
    expect(check.detailTh).toContain('office.location.lat');
  });

  it('truncates a long list instead of filling the screen', () => {
    const check = assumptionCheck(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(check.detailTh).toContain('…');
  });
});
