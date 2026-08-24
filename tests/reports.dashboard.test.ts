import { describe, it, expect } from 'vitest';
import {
  jobsByMonth,
  jobStatusMix,
  upcomingLoad,
  loadDashboardCharts,
} from '../src/modules/reports/dashboard.service';

/**
 * The dashboard series against real Postgres.
 *
 * These are raw SQL, and raw SQL is where a schema and the code that reads it
 * drift apart without anything complaining at build time. The first version of
 * upcomingLoad compared QuotaDayStatus to 'CLOSED', which is not one of its
 * four members; Postgres rejected the whole statement and — because the
 * dashboard deliberately tolerates a failing series — the chart simply was not
 * on the page. Nothing was red. These tests are the thing that would have been.
 *
 * Requires DATABASE_URL and a seeded database.
 */

describe('jobs per month', () => {
  it('returns every month in the window even when nothing happened', async () => {
    const points = await jobsByMonth(12);
    const months = [...new Set(points.map((p) => p.key))];
    expect(months).toHaveLength(12);

    // Four categories per month, always — a category with no work must still
    // hold its place, or the colours shift between renders.
    expect(points).toHaveLength(12 * 4);
  });

  it('runs oldest to newest, so the axis reads left to right', async () => {
    const keys = [...new Set((await jobsByMonth(12)).map((p) => p.key))];
    expect(keys).toEqual([...keys].sort());
  });

  it('ends on the current month', async () => {
    const keys = [...new Set((await jobsByMonth(6)).map((p) => p.key))];
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(keys.at(-1)).toBe(expected);
  });

  it('labels months in the Buddhist era', async () => {
    const p = (await jobsByMonth(1))[0]!;
    // 'ส.ค. 69' — two-digit BE year, never 2026.
    expect(p.month).toMatch(/^[ก-ฮ.]+ \d{2}$/);
  });

  it('counts nothing negative', async () => {
    for (const p of await jobsByMonth(12)) expect(p.jobs).toBeGreaterThanOrEqual(0);
  });
});

describe('open job mix', () => {
  it('never includes a closed or cancelled job', async () => {
    const slices = await jobStatusMix();
    const statuses = slices.map((s) => s.status);
    for (const gone of ['CLOSED', 'CANCELLED', 'DRAFT', 'QUOTE_REJECTED', 'RESCHEDULED']) {
      expect(statuses).not.toContain(gone);
    }
  });

  it('gives every slice a Thai label and a positive count', async () => {
    for (const s of await jobStatusMix()) {
      expect(s.jobs).toBeGreaterThan(0);
      expect(s.label).not.toBe(s.status);
    }
  });

  it('is ordered largest first', async () => {
    const counts = (await jobStatusMix()).map((s) => s.jobs);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

describe('upcoming load', () => {
  // The regression: QuotaDayStatus has OPEN, FULL, MANUALLY_CLOSED, HOLIDAY —
  // and no CLOSED. Comparing against one that does not exist throws 22P02.
  it('runs against the real QuotaDayStatus enum', async () => {
    await expect(upcomingLoad(14)).resolves.toBeInstanceOf(Array);
  });

  it('stays inside the window and runs forwards', async () => {
    const days = await upcomingLoad(14);
    const keys = days.map((d) => d.key);
    expect(keys).toEqual([...keys].sort());

    const today = new Date().toISOString().slice(0, 10);
    for (const d of days) expect(d.key >= today).toBe(true);
    expect(days.length).toBeLessThanOrEqual(14);
  });

  it('reports booked as a number and capacity as a number or nothing', async () => {
    for (const d of await upcomingLoad(14)) {
      expect(Number.isFinite(d.booked)).toBe(true);
      expect(d.booked).toBeGreaterThanOrEqual(0);
      // null is meaningful: capacity that was never configured is not zero.
      expect(d.capacity === null || Number.isFinite(d.capacity)).toBe(true);
    }
  });

  it('labels the day compactly for the axis and fully for the tooltip', async () => {
    const days = await upcomingLoad(7);
    if (days.length === 0) return;
    // Fourteen of these sit side by side, so the axis label carries no month.
    expect(days[0]!.day).toMatch(/^[ก-ฮ]+\.\d{1,2}$/);
    expect(days[0]!.dayFull).toMatch(/^[ก-ฮ]+\. \d{1,2} [ก-ฮ.]+$/);
  });
});

describe('the dashboard as a whole', () => {
  it('delivers all three series', async () => {
    const charts = await loadDashboardCharts();
    expect(charts.months).not.toBeNull();
    expect(charts.statuses).not.toBeNull();
    // The one that used to come back null.
    expect(charts.load).not.toBeNull();
  });
});
