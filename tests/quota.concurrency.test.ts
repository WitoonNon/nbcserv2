import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  bookSlot,
  dateOnly,
  isCapacityRefusal,
  QuotaExceededError,
  releaseSlot,
} from '../src/modules/scheduling/quota.service';

/**
 * The test that matters most in this system.
 *
 * Overselling the last slot of a day is the failure mode that would embarrass
 * this product in production, and it is untestable against a mocked database:
 * it depends on real row-level locking. This runs against real Postgres.
 *
 * Requires DATABASE_URL to point at a database with the schema applied.
 */

const TEST_ZONE = 'TEST-ZONE-CONCURRENCY';
const TEST_DATE = dateOnly(new Date('2030-06-15T00:00:00Z'));

let zoneId: string;

async function resetBucket(
  capacityJobs: number | null,
  capacityUnits: number | null,
  capacityMinutes: number | null,
) {
  await prisma.quotaDay.upsert({
    where: {
      quotaDate_zoneId_category: {
        quotaDate: TEST_DATE,
        zoneId,
        category: 'CLEANING_PM',
      },
    },
    create: {
      quotaDate: TEST_DATE,
      zoneId,
      category: 'CLEANING_PM',
      capacityJobs,
      capacityUnits,
      capacityMinutes,
      status: 'OPEN',
    },
    update: {
      capacityJobs,
      capacityUnits,
      capacityMinutes,
      usedJobs: 0,
      usedUnits: 0,
      usedMinutes: 0,
      status: 'OPEN',
    },
  });
}

const req = (units: number, minutes: number) => ({
  date: TEST_DATE,
  zoneId,
  category: 'CLEANING_PM' as const,
  units,
  minutes,
});

beforeAll(async () => {
  const zone = await prisma.zone.upsert({
    where: { code: TEST_ZONE },
    create: { code: TEST_ZONE, nameTh: 'โซนทดสอบ', isActive: false },
    update: {},
  });
  zoneId = zone.id;
});

afterAll(async () => {
  // `where: { zoneId: undefined }` is not "match nothing" in Prisma, it is "no
  // filter at all". Without this guard a failure in beforeAll would leave
  // zoneId unset and this teardown would wipe every quota bucket in the
  // database — the live booking calendar included.
  if (zoneId) {
    await prisma.quotaDay.deleteMany({ where: { zoneId } });
    await prisma.zone.deleteMany({ where: { code: TEST_ZONE } });
  }
  await prisma.$disconnect();
});

describe('quota booking under concurrency', () => {
  beforeEach(async () => {
    await prisma.quotaHold.deleteMany({});
  });

  it('allows exactly one winner when 20 bookings race for the last job slot', async () => {
    await resetBucket(1, null, null);

    // allSettled, not all: with Promise.all the first rejection ends the test
    // while the other 19 transactions are still in flight, and their commits
    // then leak into whatever test runs next.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => bookSlot(req(1, 30))),
    );

    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected' && isCapacityRefusal(r.reason));
    const unexpected = results.filter(
      (r) => r.status === 'rejected' && !isCapacityRefusal(r.reason),
    );

    expect(unexpected).toHaveLength(0);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(19);

    const bucket = await prisma.quotaDay.findFirstOrThrow({ where: { zoneId, quotaDate: TEST_DATE } });
    expect(bucket.usedJobs).toBe(1);
    expect(bucket.status).toBe('FULL');
  });

  it('reports a sold-out day as FULL, not as an administrative closure', async () => {
    await resetBucket(1, null, null);
    await bookSlot(req(1, 30));

    // The customer should be told the day is full and offered another date —
    // not told that bookings are closed.
    await expect(bookSlot(req(1, 30))).rejects.toMatchObject({
      name: 'QuotaUnavailableError',
      reason: 'FULL',
    });
  });

  it('caps on crew-minutes even when the job count still has room', async () => {
    // 10 jobs allowed, but only 120 minutes — a 90-minute concealed unit and a
    // 30-minute wall unit fill the day after two jobs.
    await resetBucket(10, null, 120);

    const a = await bookSlot(req(1, 90));
    expect(a.usedMinutes).toBe(90);

    const b = await bookSlot(req(1, 30));
    expect(b.usedMinutes).toBe(120);
    expect(b.becameFull).toBe(true);

    await expect(bookSlot(req(1, 30))).rejects.toSatisfy(isCapacityRefusal);
  });

  it('caps on units — a 40-unit factory PM must not slip past a job-count cap', async () => {
    await resetBucket(10, 40, null);
    await bookSlot(req(40, 1200));

    // 40 units exhausts the unit axis even though 9 job slots remain.
    await expect(bookSlot(req(1, 30))).rejects.toSatisfy(isCapacityRefusal);
  });

  it('refuses a unit overrun on a day that is still open', async () => {
    // 40-unit cap, but book only 35 so the day stays OPEN — this proves the
    // per-axis check fires on its own, not merely as a side effect of the
    // bucket having been flipped to FULL.
    await resetBucket(10, 40, null);
    await bookSlot(req(35, 900));

    const bucket = await prisma.quotaDay.findFirstOrThrow({ where: { zoneId, quotaDate: TEST_DATE } });
    expect(bucket.status).toBe('OPEN');

    await expect(bookSlot(req(10, 300))).rejects.toThrow(QuotaExceededError);
  });

  it('does not split capacity by job size — one pool per category per day', async () => {
    // Regression guard. Buckets used to be created per S/M/L/XL, which
    // quadrupled a "max 8 jobs per day" rule into 32. There must be exactly
    // one bucket for this date + zone + category.
    await resetBucket(8, null, null);
    const buckets = await prisma.quotaDay.findMany({
      where: { zoneId, quotaDate: TEST_DATE, category: 'CLEANING_PM' },
    });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.capacityJobs).toBe(8);
  });

  it('returns capacity to the pool on release', async () => {
    await resetBucket(2, 10, 240);

    const booked = await bookSlot(req(3, 90));
    expect(booked.usedUnits).toBe(3);

    await releaseSlot(booked.quotaDayId, 3, 90);

    const bucket = await prisma.quotaDay.findUniqueOrThrow({ where: { id: booked.quotaDayId } });
    expect(bucket.usedJobs).toBe(0);
    expect(bucket.usedUnits).toBe(0);
    expect(bucket.usedMinutes).toBe(0);
    expect(bucket.status).toBe('OPEN');
  });
});
