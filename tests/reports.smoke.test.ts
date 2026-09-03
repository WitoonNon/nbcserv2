import { describe, it, expect } from 'vitest';
import { loadReports } from '../src/modules/reports/reports.service';

/**
 * Every report actually runs against Postgres — Phase 3.2.
 *
 * These are raw SQL, so TypeScript proves nothing about them: a wrong column
 * name typechecks perfectly and fails at the moment somebody opens the screen.
 * This suite exists to make that failure happen here instead.
 *
 * It asserts shape rather than figures. The demo data has twelve jobs in it,
 * and a test that expected a revenue total would be testing the seed.
 */
describe('every report runs', () => {
  const range = {
    from: new Date(Date.UTC(2026, 0, 1)),
    to: new Date(Date.UTC(2026, 11, 31)),
  };

  it('returns all six without a single failure', async () => {
    const bundle = await loadReports(range);
    // `failed` names the reports that threw. Empty is the assertion — a
    // broken query would otherwise show as an empty table on the page and
    // read as "no data this month".
    expect(bundle.failed).toEqual([]);
  });

  it('gives arrays back, never undefined', async () => {
    const b = await loadReports(range);
    for (const key of ['revenueByCategory', 'revenueByZone', 'quota', 'crews', 'parts', 'repeats'] as const) {
      expect(Array.isArray(b[key]), key).toBe(true);
    }
  });

  it('reports quota utilisation as a percentage or as unknown, never as a wrong zero', async () => {
    const { quota } = await loadReports(range);
    for (const row of quota) {
      // null means no capacity was configured. Rendering that as 0% would
      // read as "nobody booked", which is a different and wrong statement.
      if (row.utilisation !== null) {
        expect(row.utilisation).toBeGreaterThanOrEqual(0);
      }
      expect(row.fullDays).toBeLessThanOrEqual(row.days);
    }
  });

  it('survives a range with nothing in it', async () => {
    const bundle = await loadReports({
      from: new Date(Date.UTC(2000, 0, 1)),
      to: new Date(Date.UTC(2000, 0, 31)),
    });
    expect(bundle.failed).toEqual([]);
    expect(bundle.revenueByCategory).toEqual([]);
  });
});
