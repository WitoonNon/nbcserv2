import 'server-only';
import { prisma, Prisma } from '@/lib/db';
import type { ServiceCategory } from '@/generated/prisma';

/**
 * The five reports the quotation asks for — Phase 3.2.
 *
 * ## Two rules that shape every query here
 *
 * **Aggregate in Postgres, not in JavaScript.** The database is in Singapore.
 * Pulling a year of jobs across that link to count them would be slow enough
 * that the office stops opening the screen, and a report nobody opens is not
 * a report.
 *
 * **A range is always explicit.** Every function takes `from` and `to` rather
 * than defaulting to "recently". A revenue figure whose period is implied is
 * a figure two people will read differently in the same meeting.
 *
 * Money is stored in Decimal and summed in Postgres, then converted to a
 * Number only at the edge — the same reason payroll works in satang.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

/** Inclusive of the whole final day: `to` is a date, and jobs happen all day. */
function endOfDay(to: Date): Date {
  return new Date(to.getTime() + 86_400_000 - 1);
}

// ---------------------------------------------------------------------------
// 1. Revenue
// ---------------------------------------------------------------------------

export interface RevenueRow {
  key: string;
  labelTh: string;
  jobs: number;
  amount: number;
}

/**
 * What was charged, grouped by job category and by zone.
 *
 * Counted from JobCharge rather than from the catalogue price, because those
 * differ every time somebody applies a discount or a credit — and the question
 * the owner is asking is what came in, not what the list price says.
 *
 * `amountSigned` is used deliberately: a credit note is negative, and summing
 * the unsigned amount would report refunded work as revenue.
 */
export async function revenueByCategory(range: DateRange): Promise<RevenueRow[]> {
  const rows = await prisma.$queryRaw<
    { category: ServiceCategory; jobs: bigint; amount: Prisma.Decimal | null }[]
  >(Prisma.sql`
    SELECT j."category",
           COUNT(DISTINCT j."id")        AS jobs,
           COALESCE(SUM(c."amountSigned"), 0) AS amount
      FROM "job_charges" c
      JOIN "jobs" j ON j."id" = c."jobId"
     WHERE c."createdAt" >= ${range.from} AND c."createdAt" <= ${endOfDay(range.to)}
     GROUP BY j."category"
     ORDER BY amount DESC
  `);

  return rows.map((r) => ({
    key: r.category,
    labelTh: CATEGORY_LABEL[r.category] ?? r.category,
    jobs: Number(r.jobs),
    amount: Number(r.amount ?? 0),
  }));
}

export async function revenueByZone(range: DateRange): Promise<RevenueRow[]> {
  const rows = await prisma.$queryRaw<
    { id: string | null; name: string | null; jobs: bigint; amount: Prisma.Decimal | null }[]
  >(Prisma.sql`
    SELECT z."id", z."nameTh" AS name,
           COUNT(DISTINCT j."id")        AS jobs,
           COALESCE(SUM(c."amountSigned"), 0) AS amount
      FROM "job_charges" c
      JOIN "jobs" j  ON j."id" = c."jobId"
      LEFT JOIN "zones" z ON z."id" = j."zoneId"
     WHERE c."createdAt" >= ${range.from} AND c."createdAt" <= ${endOfDay(range.to)}
     GROUP BY z."id", z."nameTh"
     ORDER BY amount DESC
  `);

  return rows.map((r) => ({
    key: r.id ?? 'none',
    // A job with no zone is a real state, not a gap to hide — it means
    // dispatch never assigned one, which is worth seeing on its own line.
    labelTh: r.name ?? 'ไม่ได้ระบุเขต',
    jobs: Number(r.jobs),
    amount: Number(r.amount ?? 0),
  }));
}

const CATEGORY_LABEL: Record<string, string> = {
  CLEANING_PM: 'ล้าง / PM',
  REPAIR: 'ซ่อม',
  INSPECTION: 'ตรวจเช็ค',
  INSTALLATION: 'ติดตั้ง',
};

// ---------------------------------------------------------------------------
// 2. Quota utilisation
// ---------------------------------------------------------------------------

export interface QuotaUsageRow {
  zoneName: string;
  category: string;
  categoryLabelTh: string;
  days: number;
  fullDays: number;
  capacityJobs: number;
  usedJobs: number;
  /** 0–100. Null when no capacity was configured, which is not 0% but unknown. */
  utilisation: number | null;
}

/**
 * How much of the configured capacity was actually taken.
 *
 * This is the report that answers "is the quota set right" — the client's own
 * words. Two numbers matter and they say different things: utilisation is
 * whether the ceiling is too high, and `fullDays` is whether it is too low.
 * A bucket at 40% with six sold-out days has a ceiling that is wrong in both
 * directions on different days of the week.
 */
export async function quotaUtilisation(range: DateRange): Promise<QuotaUsageRow[]> {
  const rows = await prisma.$queryRaw<
    {
      name: string;
      category: ServiceCategory;
      days: bigint;
      full_days: bigint;
      capacity: bigint | null;
      used: bigint | null;
    }[]
  >(Prisma.sql`
    SELECT z."nameTh" AS name,
           q."category",
           COUNT(*)                                            AS days,
           COUNT(*) FILTER (WHERE q."status" = 'FULL')         AS full_days,
           SUM(q."capacityJobs")                               AS capacity,
           SUM(q."usedJobs")                                   AS used
      FROM "quota_days" q
      JOIN "zones" z ON z."id" = q."zoneId"
     WHERE q."quotaDate" >= ${range.from} AND q."quotaDate" <= ${range.to}
       -- Holidays and manually closed days are not part of the queue at all;
       -- counting them would drag utilisation down for days nobody could book.
       AND q."status" IN ('OPEN', 'FULL')
     GROUP BY z."nameTh", q."category"
     ORDER BY z."nameTh", q."category"
  `);

  return rows.map((r) => {
    const capacity = Number(r.capacity ?? 0);
    const used = Number(r.used ?? 0);
    return {
      zoneName: r.name,
      category: r.category,
      categoryLabelTh: CATEGORY_LABEL[r.category] ?? r.category,
      days: Number(r.days),
      fullDays: Number(r.full_days),
      capacityJobs: capacity,
      usedJobs: used,
      utilisation: capacity > 0 ? Math.round((used / capacity) * 1000) / 10 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Crew performance
// ---------------------------------------------------------------------------

export interface CrewRow {
  crewName: string;
  jobs: number;
  closed: number;
  /** Median would be better; average is what one SQL pass gives honestly. */
  avgMinutes: number | null;
  reopened: number;
}

/**
 * What each crew got through.
 *
 * `reopened` counts jobs that went back to IN_PROGRESS after reaching
 * COMPLETED — the closest this schema gets to "งานที่ถูกตีกลับ". It is a
 * rough proxy and is labelled as one on the screen: a job reopened because
 * the customer added scope is not a job done badly, and the number alone
 * cannot tell the two apart.
 */
export async function crewPerformance(range: DateRange): Promise<CrewRow[]> {
  const rows = await prisma.$queryRaw<
    {
      name: string;
      jobs: bigint;
      closed: bigint;
      avg_minutes: number | null;
      reopened: bigint;
    }[]
  >(Prisma.sql`
    SELECT cr."name",
           COUNT(DISTINCT j."id")                                          AS jobs,
           COUNT(DISTINCT j."id") FILTER (WHERE j."status" = 'CLOSED')     AS closed,
           AVG(j."estimatedMinutes")                                       AS avg_minutes,
           COUNT(DISTINCT j."id") FILTER (
             WHERE EXISTS (
               SELECT 1 FROM "job_status_events" e
                WHERE e."jobId" = j."id"
                  AND e."toStatus" = 'IN_PROGRESS'
                  AND e."fromStatus" = 'COMPLETED'
             )
           )                                                               AS reopened
      FROM "job_assignments" a
      JOIN "crews" cr ON cr."id" = a."crewId"
      JOIN "jobs" j   ON j."id"  = a."jobId"
     WHERE j."scheduledDate" >= ${range.from} AND j."scheduledDate" <= ${range.to}
       AND a."unassignedAt" IS NULL
     GROUP BY cr."name"
     ORDER BY jobs DESC
  `);

  return rows.map((r) => ({
    crewName: r.name,
    jobs: Number(r.jobs),
    closed: Number(r.closed),
    avgMinutes: r.avg_minutes === null ? null : Math.round(Number(r.avg_minutes)),
    reopened: Number(r.reopened),
  }));
}

// ---------------------------------------------------------------------------
// 4. Parts used
// ---------------------------------------------------------------------------

export interface PartRow {
  name: string;
  qty: number;
  amount: number;
  jobs: number;
}

/**
 * Which parts get fitted most, to feed the stock list.
 *
 * ⚠️ This returns nothing until technicians actually record parts on work
 * orders — `job_parts` was empty when this was written. An empty table here
 * is a data-entry gap, not a quiet month, and the screen says which.
 *
 * Grouped on the snapshot name rather than the catalogue id on purpose: a
 * part fitted before it was added to the catalogue still has a name, and
 * dropping those rows would under-report exactly the parts worth adding.
 */
export async function partsUsed(range: DateRange, limit = 20): Promise<PartRow[]> {
  const rows = await prisma.$queryRaw<
    { name: string; qty: Prisma.Decimal | null; amount: Prisma.Decimal | null; jobs: bigint }[]
  >(Prisma.sql`
    SELECT p."partNameSnapshot"                     AS name,
           SUM(p."qty")                             AS qty,
           SUM(p."qty" * p."unitPrice")             AS amount,
           COUNT(DISTINCT w."jobId")                AS jobs
      FROM "job_parts" p
      JOIN "work_orders" w ON w."id" = p."workOrderId"
     WHERE p."createdAt" >= ${range.from} AND p."createdAt" <= ${endOfDay(range.to)}
     GROUP BY p."partNameSnapshot"
     ORDER BY qty DESC
     LIMIT ${limit}
  `);

  return rows.map((r) => ({
    name: r.name,
    qty: Number(r.qty ?? 0),
    amount: Number(r.amount ?? 0),
    jobs: Number(r.jobs),
  }));
}

// ---------------------------------------------------------------------------
// 5. Repeat callers
// ---------------------------------------------------------------------------

export interface RepeatRow {
  customerName: string;
  siteName: string | null;
  jobs: number;
  lastJobOn: Date;
}

/**
 * Sites called back to more than once — the client's "ซ่อมไม่จบ" signal.
 *
 * Counted per SITE and not per customer: a chain with twenty branches is not
 * a repeat problem, and rolling them together would bury the one branch that
 * genuinely is. REPAIR only, because a site on a quarterly PM contract is
 * supposed to be visited repeatedly.
 */
export async function repeatCallers(
  range: DateRange,
  minJobs = 2,
  limit = 25,
): Promise<RepeatRow[]> {
  const rows = await prisma.$queryRaw<
    { customer: string; site: string | null; jobs: bigint; last_on: Date }[]
  >(Prisma.sql`
    SELECT c."displayName" AS customer,
           s."name"        AS site,
           COUNT(*)        AS jobs,
           MAX(j."scheduledDate") AS last_on
      FROM "jobs" j
      JOIN "customers" c      ON c."id" = j."customerId"
      LEFT JOIN "customer_sites" s ON s."id" = j."siteId"
     WHERE j."category" = 'REPAIR'
       AND j."status" <> 'CANCELLED'
       AND j."scheduledDate" >= ${range.from} AND j."scheduledDate" <= ${range.to}
     GROUP BY c."displayName", s."name"
    HAVING COUNT(*) >= ${minJobs}
     ORDER BY jobs DESC, last_on DESC
     LIMIT ${limit}
  `);

  return rows.map((r) => ({
    customerName: r.customer,
    siteName: r.site,
    jobs: Number(r.jobs),
    lastJobOn: r.last_on,
  }));
}

// ---------------------------------------------------------------------------
// Everything at once
// ---------------------------------------------------------------------------

export interface ReportBundle {
  range: DateRange;
  revenueByCategory: RevenueRow[];
  revenueByZone: RevenueRow[];
  quota: QuotaUsageRow[];
  crews: CrewRow[];
  parts: PartRow[];
  repeats: RepeatRow[];
  /** Reports that threw, so the page can leave a gap instead of dying. */
  failed: string[];
}

/**
 * `allSettled`, not `all`: one broken report must leave a gap on the page
 * rather than take the other five with it. The office opens this screen for
 * whichever number it came for, and that number is rarely the broken one.
 */
export async function loadReports(range: DateRange): Promise<ReportBundle> {
  const named = [
    ['revenueByCategory', () => revenueByCategory(range)],
    ['revenueByZone', () => revenueByZone(range)],
    ['quota', () => quotaUtilisation(range)],
    ['crews', () => crewPerformance(range)],
    ['parts', () => partsUsed(range)],
    ['repeats', () => repeatCallers(range)],
  ] as const;

  const settled = await Promise.allSettled(named.map(([, run]) => run()));
  const out = {
    range,
    revenueByCategory: [],
    revenueByZone: [],
    quota: [],
    crews: [],
    parts: [],
    repeats: [],
    failed: [] as string[],
  } as ReportBundle;

  settled.forEach((result, i) => {
    const key = named[i]![0];
    if (result.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = result.value;
    } else {
      out.failed.push(key);
    }
  });

  return out;
}
