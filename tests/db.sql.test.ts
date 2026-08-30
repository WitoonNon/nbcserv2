import { describe, it, expect } from 'vitest';
import { prisma } from '../src/lib/db';
import { Prisma } from '../src/generated/prisma';
import {
  query,
  queryOne,
  queryValue,
  sql,
  all,
  any,
  inList,
  RawSqlError,
} from '../src/lib/db/sql';

/**
 * The raw SQL layer against real Postgres.
 *
 * Every case here is a mistake that has already been made in this codebase or
 * is one keystroke away from it: a bigint blanking a page, an empty IN list
 * that is a syntax error, a SUM over nothing becoming NaN.
 *
 * The composition cases exist because a query with an optional condition once
 * failed for every website booking while the suite stayed green — no test
 * passed the optional argument, so the branch was never executed. Both the
 * present and the absent case are covered here now, which is the part that
 * actually protects bookings regardless of what the original mechanism was.
 *
 * Requires DATABASE_URL and a seeded database.
 */

describe('composing conditions', () => {
  it('runs with an optional condition present — the case that broke bookings', async () => {
    const status = 'OPEN';
    const rows = await query<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM "quota_days"
           WHERE ${all([sql`"quotaDate" >= CURRENT_DATE`, status ? sql`"status" = ${status}::"QuotaDayStatus"` : null])}`,
      { name: 'test-optional-present' },
    );
    expect(typeof rows[0]!.n).toBe('number');
  });

  it('runs with the same condition absent', async () => {
    const status: string | null = null;
    const rows = await query<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM "quota_days"
           WHERE ${all([sql`"quotaDate" >= CURRENT_DATE`, status ? sql`"status" = ${status}` : null])}`,
      { name: 'test-optional-absent' },
    );
    expect(typeof rows[0]!.n).toBe('number');
  });

  it('composes nested fragments correctly in every form Prisma offers', async () => {
    // Pinning current behaviour rather than asserting a bug. An earlier comment
    // in this codebase held that the tagged form binds a nested fragment as a
    // parameter and breaks; on @prisma/client 7.9.1 it does not. If a future
    // upgrade reintroduces that, this test is what says so.
    const value = 'x';
    const frags = [
      Prisma.sql`AND 1 = 1`,
      Prisma.sql`AND ${value}::text = ${value}::text`,
      Prisma.empty,
      Prisma.raw('AND 2 = 2'),
    ];
    for (const frag of frags) {
      await expect(prisma.$queryRaw`SELECT 1 AS n WHERE 1 = 1 ${frag}`).resolves.toEqual([
        { n: 1 },
      ]);
      await expect(query<{ n: number }>(sql`SELECT 1 AS n WHERE 1 = 1 ${frag}`)).resolves.toEqual([
        { n: 1 },
      ]);
    }
  });

  it('falls back to TRUE when every condition is dropped', async () => {
    const rows = await query<{ n: number }>(
      sql`SELECT 1 AS n WHERE ${all([null, undefined, false])}`,
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('falls back to FALSE for an empty OR — an empty set matches nothing', async () => {
    const rows = await query<{ n: number }>(sql`SELECT 1 AS n WHERE ${any([])}`);
    expect(rows).toEqual([]);
  });

  it('keeps interpolated values as bind parameters, not statement text', async () => {
    // If this were concatenated, the quote would end the literal and the rest
    // would run as SQL. It comes back as data.
    const nasty = "'; DROP TABLE users; --";
    const rows = await query<{ v: string }>(sql`SELECT ${nasty}::text AS v`);
    expect(rows[0]!.v).toBe(nasty);

    const stillThere = await queryValue(sql`SELECT COUNT(*) FROM "users"`);
    expect(stillThere).toBeGreaterThan(0);
  });
});

describe('IN lists', () => {
  it('builds one', async () => {
    const rows = await query<{ v: number }>(
      sql`SELECT v FROM (VALUES (1), (2), (3)) AS t(v) WHERE ${inList(sql`v`, [1, 3])}`,
    );
    expect(rows.map((r) => r.v).sort()).toEqual([1, 3]);
  });

  it('does not produce the syntax error that IN () would', async () => {
    // `IN ()` is invalid SQL; an empty list has to become FALSE instead.
    const rows = await query<{ v: number }>(
      sql`SELECT v FROM (VALUES (1)) AS t(v) WHERE ${inList(sql`v`, [])}`,
    );
    expect(rows).toEqual([]);
  });
});

describe('BigInt coercion', () => {
  it('turns COUNT into a JS number', async () => {
    const rows = await query<{ n: number }>(sql`SELECT COUNT(*) AS n FROM "users"`);
    expect(typeof rows[0]!.n).toBe('number');
  });

  it('makes the row survive JSON.stringify', async () => {
    // The real failure mode: a bigint reaching a client component throws
    // "Do not know how to serialize a BigInt" and blanks the page.
    const rows = await query(sql`SELECT COUNT(*) AS n FROM "users"`);
    expect(() => JSON.stringify(rows)).not.toThrow();

    // Without the coercion it would throw — proving the guard does something.
    const raw = await prisma.$queryRaw(Prisma.sql`SELECT COUNT(*) AS n FROM "users"`);
    expect(() => JSON.stringify(raw)).toThrow();
  });

  it('refuses a value too large for a JS number rather than rounding it', async () => {
    // Silently returning a wrong count is indistinguishable from working.
    await expect(query(sql`SELECT 9007199254740993::bigint AS n`)).rejects.toBeInstanceOf(
      RawSqlError,
    );
  });

  it('leaves other types alone', async () => {
    const rows = await query<{ t: string; d: Date; b: boolean }>(
      sql`SELECT 'x'::text AS t, NOW() AS d, true AS b`,
    );
    expect(rows[0]!.t).toBe('x');
    expect(rows[0]!.d).toBeInstanceOf(Date);
    expect(rows[0]!.b).toBe(true);
  });
});

describe('single values and rows', () => {
  it('returns null rather than undefined for no row', async () => {
    expect(await queryOne(sql`SELECT 1 AS n WHERE FALSE`)).toBeNull();
  });

  it('refuses more than one row', async () => {
    await expect(
      queryOne(sql`SELECT v FROM (VALUES (1), (2)) AS t(v)`, { name: 'two-rows' }),
    ).rejects.toBeInstanceOf(RawSqlError);
  });

  it('turns SUM over no rows into zero, not NaN', async () => {
    // SUM of nothing is SQL NULL. Number(null) is 0 but Number(undefined) is
    // NaN, and that difference has bitten this codebase before.
    const total = await queryValue(sql`SELECT SUM("usedJobs") FROM "quota_days" WHERE FALSE`);
    expect(total).toBe(0);
  });

  it('honours an explicit fallback', async () => {
    const v = await queryValue(sql`SELECT MAX("usedJobs") FROM "quota_days" WHERE FALSE`, {
      fallback: -1,
    });
    expect(v).toBe(-1);
  });
});

describe('transactions', () => {
  it('runs inside one when given a tx', async () => {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await query<{ n: number }>(sql`SELECT 1 AS n`, { tx, name: 'in-tx' });
      return rows[0]!.n;
    });
    expect(result).toBe(1);
  });
});
