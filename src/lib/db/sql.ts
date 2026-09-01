import { Prisma } from '@/generated/prisma';
import { prisma } from './index';

// Deliberately NOT `import 'server-only'`, unlike most modules under src/lib.
//
// `server-only` is resolved by the Next bundler, not installed as a package, so
// anything importing it cannot be loaded by `tsx` — which is what runs the
// seed. This module sits under lib/db next to the client itself, and that layer
// is used by seeds and maintenance scripts on purpose; db/index.ts omits it for
// the same reason. Adding it here broke `prisma db seed`, because the seed
// imports quota.service for materialiseQuota and that now reaches this file.

/**
 * Raw SQL, made safe to reach for.
 *
 * Prisma answers most questions well, and there is no ambition here to replace
 * it. But some questions are the database's to answer — grouping a year of
 * jobs into months in Bangkok time, summing capacity across zones, taking a
 * row lock — and expressing those through an ORM means dragging rows across
 * the network to do in JavaScript what Postgres would do in place.
 *
 * So raw SQL is a first-class tool here, not an escape hatch. This module
 * exists because using it directly has three traps, and every one of them has
 * already cost this project something.
 *
 * ---------------------------------------------------------------------------
 * 1. Assembling optional conditions
 * ---------------------------------------------------------------------------
 * Building a WHERE clause from conditions that may or may not apply is where
 * raw SQL usually goes wrong: a `null` that should have vanished becomes the
 * text "null" in the statement, an empty `IN ()` is a syntax error, and an
 * empty AND-list leaves a dangling `WHERE`. `all`, `any` and `inList` handle
 * those three, and their empty cases are pinned by tests.
 *
 * A note on a claim that used to be here, in case it resurfaces: an earlier
 * comment in quota.service.ts blamed a booking outage on nested `Prisma.sql`
 * fragments being bound as parameters when `$queryRaw` is used as a tagged
 * template. That outage was real and the fix held, but the mechanism as
 * recorded does NOT reproduce on @prisma/client 7.9.1 — nested fragments,
 * `Prisma.empty` and `Prisma.raw` all compose correctly in both the tagged and
 * the argument form, and there are tests below pinning that. Either it was
 * fixed upstream or the original diagnosis was wrong. `query()` takes a
 * `Prisma.Sql` value rather than being a template tag because that makes
 * `opts` possible, not because the other form is broken.
 *
 * ---------------------------------------------------------------------------
 * 2. BigInt, which crashes a page rather than being merely wrong
 * ---------------------------------------------------------------------------
 * `COUNT(*)` and `SUM(...)` come back from node-postgres as `bigint`. That is
 * not just inconvenient to do arithmetic on: `JSON.stringify` THROWS on a
 * bigint, so a raw row passed from a server component to a client one takes
 * the whole page down with "Do not know how to serialize a BigInt". Every call
 * site so far has remembered to write `Number(r.count)`. One forgetting is a
 * white screen, so it is done here instead.
 *
 * ---------------------------------------------------------------------------
 * 3. Nobody can see a slow raw query
 * ---------------------------------------------------------------------------
 * A slow Prisma query shows up in its logs. A raw one is invisible. Each query
 * here is timed and named, and anything over the threshold is reported.
 */

/** Re-exported so a call site imports one thing. */
export const sql = Prisma.sql;
export const empty = Prisma.empty;
export const join = Prisma.join;
export const raw = Prisma.raw;
export type Sql = Prisma.Sql;

/** Anything with $queryRaw — the client, or a transaction. */
type Runner = Pick<typeof prisma, '$queryRaw'> | Prisma.TransactionClient;

/**
 * Queries slower than this are reported. Chosen against the measured baseline:
 * the application talks to Postgres in the same region and ordinary reads land
 * well under 100ms, so 250ms means something has changed rather than "the
 * database is far away".
 */
const SLOW_MS = 250;

export class RawSqlError extends Error {}

/**
 * BigInt → number, everywhere in the result.
 *
 * Refuses rather than rounds when a value will not survive the conversion.
 * A count that came back as 2^53 is a broken query, and silently handing back
 * a wrong number is worse than stopping — this is the one case where losing
 * precision quietly would be indistinguishable from working.
 */
function coerce<T>(rows: T[]): T[] {
  return rows.map((row) => {
    if (row === null || typeof row !== 'object') return row;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (typeof v === 'bigint') {
        if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(-Number.MAX_SAFE_INTEGER)) {
          throw new RawSqlError(`column "${k}" does not fit in a JS number: ${v}`);
        }
        out[k] = Number(v);
      } else {
        out[k] = v;
      }
    }
    return out as T;
  });
}

export interface QueryOptions {
  /** Shown in slow-query reports. Name it after the question, not the table. */
  name?: string;
  /** Run inside a transaction instead of on the pooled client. */
  tx?: Prisma.TransactionClient;
  /** Override the slow-query threshold for a query known to be heavy. */
  slowMs?: number;
}

/**
 * Run a raw query.
 *
 *     const rows = await query<{ month: Date; jobs: number }>(
 *       sql`SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS jobs
 *             FROM "jobs" WHERE "status" <> 'CANCELLED' GROUP BY 1`,
 *       { name: 'jobsByMonth' },
 *     );
 *
 * Interpolations inside `sql` are bind parameters — they are never string
 * concatenation, so a value coming from a URL cannot alter the statement. The
 * one exception is `raw()`, which splices text directly and must therefore
 * never touch anything a user supplied.
 */
export async function query<T>(statement: Sql, opts: QueryOptions = {}): Promise<T[]> {
  const runner: Runner = opts.tx ?? prisma;
  const started = performance.now();

  let rows: T[];
  try {ไ
    rows = await runner.$queryRaw<T[]>(statement);
  } catch (e) {
    // The statement text is safe to log; the bind values are not, and Prisma
    // keeps them out of the message.
    console.error(`[sql${opts.name ? ' ' + opts.name : ''}] failed:`, e);
    throw e;
  }

  const ms = performance.now() - started;
  if (ms > (opts.slowMs ?? SLOW_MS)) {
    console.warn(
      `[sql${opts.name ? ' ' + opts.name : ''}] ${ms.toFixed(0)}ms, ${rows.length} rows — slower than ${opts.slowMs ?? SLOW_MS}ms`,
    );
  }

  return coerce(rows);
}

/** One row, or null. Rejects if the query returns more than one. */
export async function queryOne<T>(statement: Sql, opts: QueryOptions = {}): Promise<T | null> {
  const rows = await query<T>(statement, opts);
  if (rows.length > 1) {
    throw new RawSqlError(
      `${opts.name ?? 'query'} expected at most one row, got ${rows.length}`,
    );
  }
  return rows[0] ?? null;
}

/**
 * A single number — a count, a sum, a max.
 *
 * `SUM` over no rows is SQL NULL, not zero, and the difference is the classic
 * way a total silently becomes NaN downstream. The fallback is applied here.
 */
export async function queryValue(
  statement: Sql,
  opts: QueryOptions & { fallback?: number } = {},
): Promise<number> {
  const row = await queryOne<Record<string, unknown>>(statement, opts);
  if (!row) return opts.fallback ?? 0;

  const first = Object.values(row)[0];
  if (first === null || first === undefined) return opts.fallback ?? 0;
  if (typeof first === 'number') return first;

  const n = Number(first);
  if (!Number.isFinite(n)) {
    throw new RawSqlError(`${opts.name ?? 'query'} did not return a number: ${String(first)}`);
  }
  return n;
}

/**
 * `AND` several optional conditions together.
 *
 * The point is the filtering: a condition that is `null` or `undefined`
 * disappears rather than becoming the string "undefined" in the statement.
 * Returns `TRUE` when nothing is left, so it is always safe to drop into a
 * WHERE clause.
 *
 *     sql`SELECT * FROM "jobs" WHERE ${all([
 *       zoneId ? sql`"zoneId" = ${zoneId}` : null,
 *       from ? sql`"scheduledDate" >= ${from}` : null,
 *     ])}`
 */
export function all(parts: (Sql | null | undefined | false)[]): Sql {
  const kept = parts.filter((p): p is Sql => Boolean(p));
  if (kept.length === 0) return sql`TRUE`;
  return join(kept, ' AND ');
}

/** As `all`, but `OR`. Returns `FALSE` when empty — an empty OR matches nothing. */
export function any(parts: (Sql | null | undefined | false)[]): Sql {
  const kept = parts.filter((p): p is Sql => Boolean(p));
  if (kept.length === 0) return sql`FALSE`;
  return sql`(${join(kept, ' OR ')})`;
}

/**
 * An `IN (...)` list that behaves when the list is empty.
 *
 * `IN ()` is a syntax error in Postgres, and building the list by hand means
 * remembering to check. Empty yields `FALSE`, which is what "in none of these"
 * means.
 */
export function inList(column: Sql, values: readonly (string | number)[]): Sql {
  if (values.length === 0) return sql`FALSE`;
  return sql`${column} IN (${join(values.map((v) => sql`${v}`), ', ')})`;
}
