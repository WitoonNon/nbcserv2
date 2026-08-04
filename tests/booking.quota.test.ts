import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import { dateOnly, isCapacityRefusal } from '../src/modules/scheduling/quota.service';
import { createJobFromBooking, createJobFromIntake } from '../src/modules/jobs/job.service';

/**
 * Web booking must consume quota.
 *
 * createJobFromIntake() deliberately does NOT touch quota — a dispatcher
 * schedules phone-in work against capacity later. Self-service booking has no
 * such second pair of eyes, so if it ever reuses the intake path the calendar
 * keeps showing a day as free while jobs pile onto it. That is the exact bug
 * this file exists to catch, and it cannot be caught with a mock: it depends on
 * the real row lock inside the booking transaction.
 *
 * Requires DATABASE_URL to point at a database with the schema applied.
 */

const TEST_ZONE = 'TEST-ZONE-BOOKING';
const TEST_DATE = dateOnly(new Date('2030-07-20T00:00:00Z'));
const PHONE = '0899999001';

let zoneId: string;

async function resetBucket(capacityJobs: number | null, capacityMinutes: number | null) {
  await prisma.quotaDay.upsert({
    where: {
      quotaDate_zoneId_category: { quotaDate: TEST_DATE, zoneId, category: 'CLEANING_PM' },
    },
    create: {
      quotaDate: TEST_DATE,
      zoneId,
      category: 'CLEANING_PM',
      capacityJobs,
      capacityUnits: null,
      capacityMinutes,
      status: 'OPEN',
    },
    update: {
      capacityJobs,
      capacityUnits: null,
      capacityMinutes,
      usedJobs: 0,
      usedUnits: 0,
      usedMinutes: 0,
      status: 'OPEN',
    },
  });
}

async function clearTestJobs() {
  const customers = await prisma.customer.findMany({
    where: { phone: PHONE },
    select: { id: true },
  });
  const customerIds = customers.map((c) => c.id);
  if (customerIds.length === 0) return;

  const jobs = await prisma.job.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true },
  });
  const jobIds = jobs.map((j) => j.id);

  await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.jobCharge.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.customerSite.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
}

const booking = (unitCount: number, minutes: number) => ({
  customerName: 'ลูกค้าทดสอบ',
  phone: PHONE,
  address: '105/26 หมู่ 2 บางบัวทอง',
  category: 'CLEANING_PM' as const,
  acType: 'WALL' as const,
  unitCount,
  scheduledDate: TEST_DATE,
  zoneId,
  minutes,
});

beforeAll(async () => {
  const zone = await prisma.zone.upsert({
    where: { code: TEST_ZONE },
    create: { code: TEST_ZONE, nameTh: 'โซนทดสอบการจอง', isActive: false },
    update: {},
  });
  zoneId = zone.id;
});

afterAll(async () => {
  await clearTestJobs();
  // Guard the Prisma footgun: `where: { zoneId: undefined }` is not "match
  // nothing", it is "no filter at all" — so if beforeAll failed and zoneId was
  // never assigned, this line would delete every quota bucket in the database,
  // including the live calendar. Teardown must never be able to do that.
  if (zoneId) {
    await prisma.quotaDay.deleteMany({ where: { zoneId } });
    await prisma.zone.deleteMany({ where: { code: TEST_ZONE } });
  }
  await prisma.$disconnect();
});

describe('customer booking consumes quota', () => {
  beforeEach(async () => {
    await clearTestJobs();
    await prisma.quotaHold.deleteMany({});
  });

  it('creates the job and consumes the slot in one transaction', async () => {
    await resetBucket(5, 480);

    const result = await createJobFromBooking(booking(2, 60));

    expect(result.jobNo).toBeTruthy();

    const bucket = await prisma.quotaDay.findFirstOrThrow({
      where: { zoneId, quotaDate: TEST_DATE },
    });
    expect(bucket.usedJobs).toBe(1);
    expect(bucket.usedUnits).toBe(2);
    expect(bucket.usedMinutes).toBe(60);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: result.jobId } });
    expect(job.status).toBe('SCHEDULED');
    expect(job.createdVia).toBe('WEB');
    // The link back to the bucket is what lets a cancellation return capacity.
    expect(job.quotaDayId).toBe(bucket.id);
  });

  it('refuses the booking and creates no job once the day is full', async () => {
    await resetBucket(1, null);

    await createJobFromBooking(booking(1, 30));
    const before = await prisma.job.count();

    await expect(createJobFromBooking(booking(1, 30))).rejects.toSatisfy(isCapacityRefusal);

    // The rejected attempt must leave nothing behind — no orphan job, no
    // half-consumed capacity.
    expect(await prisma.job.count()).toBe(before);
    const bucket = await prisma.quotaDay.findFirstOrThrow({
      where: { zoneId, quotaDate: TEST_DATE },
    });
    expect(bucket.usedJobs).toBe(1);
  });

  it('caps on crew minutes — one big job can fill a day the job count says is free', async () => {
    await resetBucket(10, 480);

    // 40 concealed units at 90 minutes is 3,600 minutes: far beyond one crew
    // day, even though it is only the first of ten permitted jobs.
    await expect(createJobFromBooking(booking(40, 3600))).rejects.toSatisfy(isCapacityRefusal);

    const bucket = await prisma.quotaDay.findFirstOrThrow({
      where: { zoneId, quotaDate: TEST_DATE },
    });
    expect(bucket.usedJobs).toBe(0);
  });

  it('serialises concurrent bookings for the last slot', async () => {
    await resetBucket(1, null);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => createJobFromBooking(booking(1, 30))),
    );

    const winners = results.filter((r) => r.status === 'fulfilled');
    const unexpected = results.filter(
      (r) => r.status === 'rejected' && !isCapacityRefusal(r.reason),
    );

    expect(unexpected).toHaveLength(0);
    expect(winners).toHaveLength(1);

    const bucket = await prisma.quotaDay.findFirstOrThrow({
      where: { zoneId, quotaDate: TEST_DATE },
    });
    expect(bucket.usedJobs).toBe(1);
    expect(bucket.status).toBe('FULL');

    // Exactly one job exists for that bucket — the count and the ledger agree.
    expect(await prisma.job.count({ where: { quotaDayId: bucket.id } })).toBe(1);
  });

  it('phone intake still does NOT consume quota', async () => {
    await resetBucket(5, 480);

    await createJobFromIntake({
      customerName: 'ลูกค้าทดสอบ',
      phone: PHONE,
      address: '105/26 หมู่ 2 บางบัวทอง',
      category: 'CLEANING_PM',
      jobSize: 'S',
      unitCount: 2,
      requestedDate: TEST_DATE,
      createdVia: 'PHONE',
    });

    const bucket = await prisma.quotaDay.findFirstOrThrow({
      where: { zoneId, quotaDate: TEST_DATE },
    });
    expect(bucket.usedJobs).toBe(0);
    expect(bucket.usedMinutes).toBe(0);
  });
});
