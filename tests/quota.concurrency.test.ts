import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  bookSlot,
  dateOnly,
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

async function resetBucket(capacityJobs: number | null, capacityUnits: number | null, capacityMinutes: number | null) {
  await prisma.quotaDay.upsert({
    where: {
      quotaDate_zoneId_category_jobSize: {
        quotaDate: TEST_DATE,
        zoneId,
        category: 'CLEANING_PM',
        jobSize: 'S',
      },
    },
    create: {
      quotaDate: TEST_DATE,
      zoneId,
      category: 'CLEANING_PM',
      jobSize: 'S',
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

beforeAll(async () => {
  const zone = await prisma.zone.upsert({
    where: { code: TEST_ZONE },
    create: { code: TEST_ZONE, nameTh: 'โซนทดสอบ', isActive: false },
    update: {},
  });
  zoneId = zone.id;
});

afterAll(async () => {
  await prisma.quotaDay.deleteMany({ where: { zoneId } });
  await prisma.zone.deleteMany({ where: { code: TEST_ZONE } });
  await prisma.$disconnect();
});

describe('quota booking under concurrency', () => {
  beforeEach(async () => {
    await prisma.quotaHold.deleteMany({});
  });

  it('allows exactly one winner when 20 bookings race for the last job slot', async () => {
    await resetBucket(1, null, null);

    const attempts = Array.from({ length: 20 }, () =>
      bookSlot({
        date: TEST_DATE,
        zoneId,
        category: 'CLEANING_PM',
        jobSize: 'S',
        units: 1,
        minutes: 30,
      }).then(
        () => 'ok' as const,
        (e) => (e instanceof QuotaExceededError ? ('rejected' as const) : Promise.reject(e)),
      ),
    );

    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r === 'ok').length;

    expect(winners).toBe(1);
    expect(results.filter((r) => r === 'rejected')).toHaveLength(19);

    const bucket = await prisma.quotaDay.findFirstOrThrow({ where: { zoneId, quotaDate: TEST_DATE } });
    expect(bucket.usedJobs).toBe(1);
    expect(bucket.status).toBe('FULL');
  });

  it('caps on technician-minutes even when the job count still has room', async () => {
    // 10 jobs allowed, but only 120 minutes — a 90-minute concealed unit and a
    // 30-minute wall unit fill the day after two jobs.
    await resetBucket(10, null, 120);

    const a = await bookSlot({
      date: TEST_DATE, zoneId, category: 'CLEANING_PM', jobSize: 'S', units: 1, minutes: 90,
    });
    expect(a.usedMinutes).toBe(90);

    const b = await bookSlot({
      date: TEST_DATE, zoneId, category: 'CLEANING_PM', jobSize: 'S', units: 1, minutes: 30,
    });
    expect(b.usedMinutes).toBe(120);
    expect(b.becameFull).toBe(true);

    await expect(
      bookSlot({ date: TEST_DATE, zoneId, category: 'CLEANING_PM', jobSize: 'S', units: 1, minutes: 30 }),
    ).rejects.toThrow(QuotaExceededError);
  });

  it('caps on units — a 40-unit factory PM must not slip past a job-count cap', async () => {
    await resetBucket(10, 40, null);

    await bookSlot({
      date: TEST_DATE, zoneId, category: 'CLEANING_PM', jobSize: 'S', units: 40, minutes: 1200,
    });

    await expect(
      bookSlot({ date: TEST_DATE, zoneId, category: 'CLEANING_PM', jobSize: 'S', units: 1, minutes: 30 }),
    ).rejects.toThrow(QuotaExceededError);
  });

  it('returns capacity to the pool on release', async () => {
    await resetBucket(2, 10, 240);

    const booked = await bookSlot({
      date: TEST_DATE, zoneId, category: 'CLEANING_PM', jobSize: 'S', units: 3, minutes: 90,
    });
    expect(booked.usedUnits).toBe(3);

    await releaseSlot(booked.quotaDayId, 3, 90);

    const bucket = await prisma.quotaDay.findUniqueOrThrow({ where: { id: booked.quotaDayId } });
    expect(bucket.usedJobs).toBe(0);
    expect(bucket.usedUnits).toBe(0);
    expect(bucket.usedMinutes).toBe(0);
    expect(bucket.status).toBe('OPEN');
  });
});
