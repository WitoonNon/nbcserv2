import { TX_OPTIONS, prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import type { QuotaDayStatus, ServiceCategory } from '@/generated/prisma';

/**
 * Quota engine (requirement #1).
 *
 * Design notes
 * ------------
 * 1. Capacity is expressed on THREE axes — jobs, units and technician-minutes.
 *    NBC publishes per-unit service times of 30/40/60/90 minutes, so a day
 *    capped at "10 jobs" is meaningless: ten 90-minute concealed-unit jobs is
 *    a completely different day from ten 30-minute wall-unit jobs.
 *    A NULL capacity means "unlimited on this axis".
 *
 * 2. `book()` takes a row-level lock (SELECT ... FOR UPDATE) on exactly one
 *    QuotaDay bucket. Two customers racing for the last slot serialise on that
 *    row and exactly one wins. A CHECK constraint in the migration is the
 *    second line of defence so a bug can never silently oversell.
 *
 * 3. There is ONE bucket per (date, zone, category) — capacity is deliberately
 *    NOT split by job size. The same crews serve small and large jobs, so a
 *    per-size split would let a day look available for one size while every
 *    technician is already committed. Magnitude is carried by units/minutes.
 *
 * 3. Live (unexpired) holds count against capacity, so a slot cannot be sold
 *    from under a customer who is mid-way through the booking form.
 *
 * @client-confirm C1, C2, C3, C5, C9
 */

export const QUOTA_HORIZON_DAYS = 90;
export const HOLD_TTL_MINUTES = 10;

export type QuotaAxis = 'jobs' | 'units' | 'minutes';

export class QuotaExceededError extends Error {
  constructor(
    readonly axis: QuotaAxis,
    readonly quotaDate: string,
  ) {
    super(`Quota exceeded on "${axis}" for ${quotaDate}`);
    this.name = 'QuotaExceededError';
  }
}

/**
 * FULL and CLOSED are deliberately distinct.
 *
 * "เต็มแล้ว" (the day sold out) and "ปิดรับงาน" (an admin closed the day) look
 * the same to the database but mean completely different things to a customer:
 * one should be offered the next open date, the other is simply not on sale.
 */
export type UnavailableReason = 'NO_BUCKET' | 'FULL' | 'CLOSED' | 'HOLIDAY';

export class QuotaUnavailableError extends Error {
  constructor(readonly reason: UnavailableReason) {
    super(`Slot unavailable: ${reason}`);
    this.name = 'QuotaUnavailableError';
  }
}

/** True when the caller lost a race for capacity, however it was reported. */
export function isCapacityRefusal(e: unknown): boolean {
  return (
    e instanceof QuotaExceededError ||
    (e instanceof QuotaUnavailableError && e.reason === 'FULL')
  );
}

/** Normalise to UTC midnight so @db.Date round-trips without timezone drift. */
export function dateOnly(input: Date | string): Date {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Raw-query row shape. Tables are snake_case (@@map) but columns keep Prisma's
 * camelCase default, so identifiers stay double-quoted in the SQL below and
 * come back camelCase from the driver.
 */
interface BucketRow {
  id: string;
  quotaDate: Date;
  capacityJobs: number | null;
  capacityUnits: number | null;
  capacityMinutes: number | null;
  usedJobs: number;
  usedUnits: number;
  usedMinutes: number;
  status: QuotaDayStatus;
  heldUnits: bigint | number;
  heldMinutes: bigint | number;
}

export interface SlotRequest {
  date: Date;
  zoneId: string;
  category: ServiceCategory;
  units: number;
  minutes: number;
}

// ---------------------------------------------------------------------------
// Materialisation — rules -> daily buckets
// ---------------------------------------------------------------------------

/**
 * Build QuotaDay rows for a date window: one bucket per
 * (date x zone x category). A combination with no matching rule is closed
 * rather than unlimited — an unconfigured category must not silently accept
 * unbounded bookings.
 *
 * Existing rows are updated in place so consumed counters are never disturbed.
 */
export async function materialiseQuota(from: Date, to: Date): Promise<number> {
  const zones = await prisma.zone.findMany({ where: { isActive: true } });
  const rules = await prisma.quotaRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'desc' },
  });
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: dateOnly(from), lte: dateOnly(to) }, isWorkingDay: false },
  });
  const holidaySet = new Set(holidays.map((h) => dateOnly(h.date).toISOString()));

  const categories: ServiceCategory[] = ['INSPECTION_REPAIR', 'CLEANING_PM', 'REPAIR', 'INSTALLATION'];

  let written = 0;
  for (let d = dateOnly(from); d <= dateOnly(to); d = new Date(d.getTime() + 86_400_000)) {
    const isHoliday = holidaySet.has(d.toISOString());
    const weekdayBit = 1 << d.getUTCDay();

    for (const zone of zones) {
      for (const category of categories) {
        const rule = rules.find(
          (r) =>
            r.category === category &&
            (r.zoneId === null || r.zoneId === zone.id) &&
            dateOnly(r.effectiveFrom) <= d &&
            (r.effectiveTo === null || dateOnly(r.effectiveTo) >= d) &&
            (r.weekdayMask & weekdayBit) !== 0,
        );

        const status: QuotaDayStatus = isHoliday ? 'HOLIDAY' : !rule ? 'MANUALLY_CLOSED' : 'OPEN';

        await prisma.quotaDay.upsert({
          where: {
            quotaDate_zoneId_category: { quotaDate: d, zoneId: zone.id, category },
          },
          create: {
            quotaDate: d,
            zoneId: zone.id,
            category,
            capacityJobs: rule?.maxJobs ?? null,
            capacityUnits: rule?.maxUnits ?? null,
            capacityMinutes: rule?.maxTechnicianMinutes ?? null,
            status,
          },
          // Never touch used* counters on re-materialisation. Only a bucket
          // that has not been manually closed inherits the new status.
          update: {
            capacityJobs: rule?.maxJobs ?? null,
            capacityUnits: rule?.maxUnits ?? null,
            capacityMinutes: rule?.maxTechnicianMinutes ?? null,
            ...(isHoliday ? { status: 'HOLIDAY' as const } : {}),
          },
        });
        written += 1;
      }
    }
  }
  return written;
}

// ---------------------------------------------------------------------------
// Availability — what the customer calendar renders
// ---------------------------------------------------------------------------

export interface DayAvailability {
  date: string;
  status: QuotaDayStatus;
  available: boolean;
  remainingJobs: number | null;
  remainingUnits: number | null;
  remainingMinutes: number | null;
}

export async function getAvailability(params: {
  from: Date;
  to: Date;
  zoneId: string;
  category: ServiceCategory;
  requiredUnits?: number;
  requiredMinutes?: number;
}): Promise<DayAvailability[]> {
  const { from, to, zoneId, category } = params;
  const requiredUnits = params.requiredUnits ?? 1;
  const requiredMinutes = params.requiredMinutes ?? 0;

  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT q."id",
           q."quotaDate",
           q."capacityJobs", q."capacityUnits", q."capacityMinutes",
           q."usedJobs", q."usedUnits", q."usedMinutes",
           q."status",
           COALESCE(h."units", 0)   AS "heldUnits",
           COALESCE(h."minutes", 0) AS "heldMinutes"
      FROM "quota_days" q
      LEFT JOIN (
        SELECT "quotaDayId", SUM("units") AS "units", SUM("minutes") AS "minutes"
          FROM "quota_holds"
         WHERE "expiresAt" > NOW()
         GROUP BY "quotaDayId"
      ) h ON h."quotaDayId" = q."id"
     WHERE q."quotaDate" BETWEEN ${dateOnly(from)}::date AND ${dateOnly(to)}::date
       AND q."zoneId"   = ${zoneId}
       AND q."category" = ${category}::"ServiceCategory"
     ORDER BY q."quotaDate" ASC
  `;

  return rows.map((row) => {
    const remainingJobs = row.capacityJobs === null ? null : row.capacityJobs - row.usedJobs;
    const remainingUnits =
      row.capacityUnits === null ? null : row.capacityUnits - row.usedUnits - Number(row.heldUnits);
    const remainingMinutes =
      row.capacityMinutes === null
        ? null
        : row.capacityMinutes - row.usedMinutes - Number(row.heldMinutes);

    const fits =
      (remainingJobs === null || remainingJobs >= 1) &&
      (remainingUnits === null || remainingUnits >= requiredUnits) &&
      (remainingMinutes === null || remainingMinutes >= requiredMinutes);

    return {
      date: dateOnly(row.quotaDate).toISOString().slice(0, 10),
      status: row.status,
      available: row.status === 'OPEN' && fits,
      remainingJobs,
      remainingUnits,
      remainingMinutes,
    };
  });
}

// ---------------------------------------------------------------------------
// Hold — soft lock while the customer completes the form
// ---------------------------------------------------------------------------

export async function holdSlot(
  req: SlotRequest,
  sessionKey: string,
  ttlMinutes = HOLD_TTL_MINUTES,
): Promise<{ holdId: string; expiresAt: Date }> {
  const bucket = await prisma.quotaDay.findUnique({
    where: {
      quotaDate_zoneId_category: {
        quotaDate: dateOnly(req.date),
        zoneId: req.zoneId,
        category: req.category,
      },
    },
  });
  if (!bucket) throw new QuotaUnavailableError('NO_BUCKET');
  if (bucket.status === 'HOLIDAY') throw new QuotaUnavailableError('HOLIDAY');
  if (bucket.status === 'FULL') throw new QuotaUnavailableError('FULL');
  if (bucket.status !== 'OPEN') throw new QuotaUnavailableError('CLOSED');

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const hold = await prisma.quotaHold.create({
    data: {
      quotaDayId: bucket.id,
      sessionKey,
      units: req.units,
      minutes: req.minutes,
      expiresAt,
    },
  });
  return { holdId: hold.id, expiresAt };
}

export async function releaseHold(sessionKey: string): Promise<void> {
  await prisma.quotaHold.deleteMany({ where: { sessionKey } });
}

export async function sweepExpiredHolds(): Promise<number> {
  const res = await prisma.quotaHold.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}

// ---------------------------------------------------------------------------
// Book — the transactional consume. THIS is the correctness-critical path.
// ---------------------------------------------------------------------------

export interface BookResult {
  quotaDayId: string;
  usedJobs: number;
  usedUnits: number;
  usedMinutes: number;
  becameFull: boolean;
}

/**
 * Consume one slot. Must be called inside the same transaction that creates
 * the Job, so a failure to create the job never leaks consumed capacity.
 *
 * @param sessionKey when supplied, that session's holds on this bucket are
 *                   consumed (deleted) rather than counted against capacity.
 */
export async function bookSlot(req: SlotRequest, sessionKey?: string): Promise<BookResult> {
  return prisma.$transaction((tx) => bookSlotWithin(tx, req, sessionKey), TX_OPTIONS);
}

/**
 * Contention here is the normal case, not the exception: everyone racing for
 * the last slot on a popular day serialises on one row.
 *
 * `maxWait` is how long a caller may queue for a free connection before Prisma
 * gives up. The 2s default is shorter than the queue it creates — twenty
 * simultaneous bookings against a pool of ten means half of them wait on a
 * connection before they can even try, and they were failing with a transaction
 * error rather than an honest "the day is full". A customer must never be told
 * the system is broken when the truthful answer is that someone else got the
 * slot.
 */

/**
 * The consume itself, for callers that already own a transaction.
 *
 * Booking must commit atomically with whatever it is booking FOR — a job row
 * that fails to insert after capacity was consumed would leak a slot that no
 * customer holds. Prisma cannot nest `$transaction`, so composition happens
 * here rather than by calling bookSlot() from inside another transaction.
 */
export async function bookSlotWithin(
  tx: Prisma.TransactionClient,
  req: SlotRequest,
  sessionKey?: string,
): Promise<BookResult> {
  // 1. Lock exactly one bucket row. Contenders for this date+category+size
  //    serialise here; everyone else is unaffected.
  const rows = await tx.$queryRaw<BucketRow[]>`
    SELECT q."id",
           q."quotaDate",
           q."capacityJobs", q."capacityUnits", q."capacityMinutes",
           q."usedJobs", q."usedUnits", q."usedMinutes",
           q."status",
           0::bigint AS "heldUnits", 0::bigint AS "heldMinutes"
      FROM "quota_days" q
     WHERE q."quotaDate" = ${dateOnly(req.date)}::date
       AND q."zoneId"    = ${req.zoneId}
       AND q."category"  = ${req.category}::"ServiceCategory"
     FOR UPDATE
  `;

  const bucket = rows[0];
  if (!bucket) throw new QuotaUnavailableError('NO_BUCKET');
  if (bucket.status === 'HOLIDAY') throw new QuotaUnavailableError('HOLIDAY');
  // Losing the race to a booking that filled the day is a capacity refusal,
  // not an administrative closure — the customer should be offered another date.
  if (bucket.status === 'FULL') throw new QuotaUnavailableError('FULL');
  if (bucket.status !== 'OPEN') throw new QuotaUnavailableError('CLOSED');

  // 2. Count live holds belonging to *other* sessions.
  //
  // Built with `Prisma.sql` and passed as an ARGUMENT, not written as a tagged
  // template on $queryRaw. The tagged form turns every `${}` into a bind
  // parameter — including a nested Prisma.sql fragment, which came out as
  // `... AND "expiresAt" > NOW() $2` and failed with a Postgres syntax error.
  //
  // It fired only when a sessionKey was supplied, which is exactly and only
  // the real booking path: no test passed one, so every customer booking
  // through the website failed while the suite stayed green.
  const heldRows = await tx.$queryRaw<
    { jobs: bigint | null; units: bigint | null; minutes: bigint | null }[]
  >(
    Prisma.sql`
      SELECT COUNT(*) AS "jobs", SUM("units") AS "units", SUM("minutes") AS "minutes"
        FROM "quota_holds"
       WHERE "quotaDayId" = ${bucket.id}
         AND "expiresAt" > NOW()
         ${sessionKey ? Prisma.sql`AND "sessionKey" <> ${sessionKey}` : Prisma.empty}
    `,
  );
  // A hold is one job as well as its units and minutes. Counting it on the
  // other two axes but not this one meant that on a day limited by JOB count —
  // which is how the client asked for capacity to be expressed — a hold held
  // nothing at all: a second customer could take the last slot out from under
  // somebody who was still typing their address, which is the exact situation
  // holds exist to prevent.
  const heldJobs = Number(heldRows[0]?.jobs ?? 0);
  const heldUnits = Number(heldRows[0]?.units ?? 0);
  const heldMinutes = Number(heldRows[0]?.minutes ?? 0);

  // 3. Check every configured axis.
  const dateLabel = dateOnly(req.date).toISOString().slice(0, 10);
  if (bucket.capacityJobs !== null && bucket.usedJobs + heldJobs + 1 > bucket.capacityJobs) {
    throw new QuotaExceededError('jobs', dateLabel);
  }
  if (
    bucket.capacityUnits !== null &&
    bucket.usedUnits + heldUnits + req.units > bucket.capacityUnits
  ) {
    throw new QuotaExceededError('units', dateLabel);
  }
  if (
    bucket.capacityMinutes !== null &&
    bucket.usedMinutes + heldMinutes + req.minutes > bucket.capacityMinutes
  ) {
    throw new QuotaExceededError('minutes', dateLabel);
  }

  // 4. Consume, and close the day if any axis is now exhausted.
  const usedJobs = bucket.usedJobs + 1;
  const usedUnits = bucket.usedUnits + req.units;
  const usedMinutes = bucket.usedMinutes + req.minutes;
  const becameFull =
    (bucket.capacityJobs !== null && usedJobs >= bucket.capacityJobs) ||
    (bucket.capacityUnits !== null && usedUnits >= bucket.capacityUnits) ||
    (bucket.capacityMinutes !== null && usedMinutes >= bucket.capacityMinutes);

  await tx.quotaDay.update({
    where: { id: bucket.id },
    data: {
      usedJobs,
      usedUnits,
      usedMinutes,
      ...(becameFull ? { status: 'FULL' as const } : {}),
    },
  });

  // 5. The customer's own hold has now been converted into a real booking.
  if (sessionKey) {
    await tx.quotaHold.deleteMany({ where: { quotaDayId: bucket.id, sessionKey } });
  }

  return { quotaDayId: bucket.id, usedJobs, usedUnits, usedMinutes, becameFull };
}

/** Return capacity to the pool on cancellation or reschedule. */
export async function releaseSlot(quotaDayId: string, units: number, minutes: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ usedJobs: number; usedUnits: number; usedMinutes: number }[]>`
      SELECT "usedJobs", "usedUnits", "usedMinutes"
        FROM "quota_days" WHERE "id" = ${quotaDayId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return;
    await tx.quotaDay.update({
      where: { id: quotaDayId },
      data: {
        usedJobs: Math.max(0, row.usedJobs - 1),
        usedUnits: Math.max(0, row.usedUnits - units),
        usedMinutes: Math.max(0, row.usedMinutes - minutes),
        status: 'OPEN',
      },
    });
  }, TX_OPTIONS);
}
