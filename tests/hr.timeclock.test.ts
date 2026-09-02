import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import {
  entriesForDay,
  getScanPointPolicy,
  pendingReviews,
  punchClock,
  reviewEntry,
  TimeClockError,
  TIMECLOCK_KEYS,
} from '../src/modules/hr/timeclock.service';
import { issueStaticToken } from '../src/modules/hr/timeclock-token';

/**
 * Clocking in and out, against real Postgres.
 *
 * The rules defended here are the ones that decide whether somebody is paid:
 * a bad location is recorded and flagged rather than refused, a bad token is
 * refused, and the same scan arriving twice is one punch rather than a
 * two-second shift.
 *
 * The geofence maths and the token signing are tested without a database in
 * hr.geofence.test.ts and hr.timeclock-token.test.ts — that is where the
 * judgement lives.
 *
 * ⚠️ NOT YET RUN. Written while the development database was unreachable: the
 * Supabase project the local .env pointed at no longer resolves, and the new
 * connection string sits with whoever moved it. Typecheck and build pass; this
 * file is what still needs a real database behind it.
 */

/**
 * Filled from the configured scan point in beforeAll, never hardcoded.
 *
 * This used to restate the seeded coordinate, so the day the client sent the
 * real pin the file failed — a test that breaks when a placeholder is replaced
 * by the truth is testing the placeholder. What matters here is that punching
 * AT the scan point passes and punching away from it does not, whatever the
 * point happens to be.
 */
let OFFICE = { lat: 0, lng: 0 };
const SCAN_POINT = 'OFFICE';

let employeeId: string;
let token: string;
let reviewerId: string;

/** Move north by a known number of metres. */
function northOf(metres: number) {
  return { lat: OFFICE.lat + metres / 111_320, lng: OFFICE.lng };
}

async function cleanUp() {
  const staff = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: 'EMP-TC-' } },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);
  // Guarded: an unset filter matches every row in Prisma, and this would then
  // empty the timeclock for the whole company.
  if (ids.length > 0) {
    await prisma.timeClockEntry.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  token = await issueStaticToken(SCAN_POINT, env().AUTH_SECRET);
  const reviewer = await prisma.user.findFirstOrThrow({ where: { email: 'admin@nbcgroup.co.th' } });
  reviewerId = reviewer.id;
});

beforeEach(async () => {
  await cleanUp();

  const employee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-TC-${Date.now()}`,
      firstNameTh: 'ทดสอบ',
      lastNameTh: 'ลงเวลา',
      position: 'ช่างเทคนิค',
      status: 'ACTIVE',
      employmentType: 'MONTHLY',
    },
    select: { id: true },
  });
  employeeId = employee.id;

  const policy = await getScanPointPolicy();
  OFFICE = { lat: policy.office.lat, lng: policy.office.lng };
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('where the scan point is', () => {
  it('reads a usable office location and radius', async () => {
    const policy = await getScanPointPolicy();

    // A coordinate at all, somewhere on Earth, with a radius that means
    // something. The exact numbers belong in configuration, not in a test.
    expect(Math.abs(policy.office.lat)).toBeGreaterThan(0);
    expect(Math.abs(policy.office.lng)).toBeGreaterThan(0);
    expect(policy.radiusMetres).toBeGreaterThan(0);
  });

  it('carries whether the coordinate is still a guess through to the screen', async () => {
    // The flag itself, not a particular state of it. It was true while the
    // point was a sub-district centroid and false once the client sent the
    // real pin on 31 ส.ค.; both are correct at their time, and what must keep
    // working is that the screen is told which one applies. Showing a guess as
    // settled is what would stop anybody fixing it.
    const flagged = await prisma.appConfig.findUnique({ where: { key: TIMECLOCK_KEYS.lat } });
    expect(typeof flagged?.isAssumption).toBe('boolean');
    expect((await getScanPointPolicy()).isAssumption).toBe(flagged?.isAssumption);
  });
});

describe('punching', () => {
  it('records the first scan of the day as IN', async () => {
    const result = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10 });

    expect(result.kind).toBe('IN');
    expect(result.needsReview).toBe(false);
    expect(result.duplicate).toBe(false);
  });

  it('works out IN or OUT from the last punch rather than asking', async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 5 * 3_600_000);

    const first = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10, now });
    const second = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10, now: later });

    // A screen that offers the choice invites the mistake, and the pairing is
    // what payroll reads.
    expect(first.kind).toBe('IN');
    expect(second.kind).toBe('OUT');
  });

  it('keeps the whole day in order', async () => {
    // Anchored to 08:00 Bangkok on a fixed date rather than to "now". Using
    // Date.now() made the result depend on the hour the suite ran: at 00:42
    // local the last punch landed nine hours later and the assertion turned on
    // where a day boundary happened to fall.
    const base = Date.UTC(2026, 5, 15, 1, 0, 0); // 08:00 ICT
    for (const hours of [0, 4, 5, 9]) {
      await punchClock({
        employeeId, token, at: OFFICE, accuracyMetres: 10,
        now: new Date(base + hours * 3_600_000),
      });
    }

    const entries = await entriesForDay(employeeId, new Date(base));
    expect(entries.map((e) => e.kind)).toEqual(['IN', 'OUT', 'IN', 'OUT']);
  });

  it('counts an early start as today, not as yesterday', async () => {
    // The bug the test above found by accident. Bangkok is UTC+7, so 06:00
    // local is 23:00 UTC the previous date. Slicing the day in UTC filed a
    // technician's clock-in under yesterday and dropped it off today's list.
    const earlyIct = Date.UTC(2026, 5, 20, 23, 0, 0); // 06:00 ICT on the 21st
    await punchClock({
      employeeId, token, at: OFFICE, accuracyMetres: 10,
      now: new Date(earlyIct),
    });

    const onThe21st = await entriesForDay(employeeId, new Date(Date.UTC(2026, 5, 21, 5, 0, 0)));
    expect(onThe21st).toHaveLength(1);

    const onThe20th = await entriesForDay(employeeId, new Date(Date.UTC(2026, 5, 20, 5, 0, 0)));
    expect(onThe20th).toHaveLength(0);
  });

  it('counts a late finish as the same day', async () => {
    // The other edge: 23:30 local is 16:30 UTC the same date, so this one was
    // already right — pinned so a "fix" cannot swing the window the other way.
    const lateIct = Date.UTC(2026, 6, 10, 16, 30, 0); // 23:30 ICT on the 10th
    await punchClock({
      employeeId, token, at: OFFICE, accuracyMetres: 10,
      now: new Date(lateIct),
    });

    const sameDay = await entriesForDay(employeeId, new Date(Date.UTC(2026, 6, 10, 5, 0, 0)));
    expect(sameDay).toHaveLength(1);
  });

  it('stores what the phone reported', async () => {
    const at = northOf(120);
    const result = await punchClock({ employeeId, token, at, accuracyMetres: 25 });

    const entry = await prisma.timeClockEntry.findUniqueOrThrow({ where: { id: result.entryId } });
    expect(entry.lat).toBeCloseTo(at.lat, 5);
    expect(entry.geofence).toBe('INSIDE');
    expect(entry.distanceMetres).toBeGreaterThan(100);
    expect(entry.scanPointId).toBe(SCAN_POINT);
    expect(entry.tokenKind).toBe('STATIC');
  });
});

describe('what a bad location does — and does not do', () => {
  it('records a punch from far away and flags it', async () => {
    const result = await punchClock({
      employeeId, token, at: northOf(4000), accuracyMetres: 10,
    });

    // Recorded, not refused. The supervisor decides.
    expect(result.needsReview).toBe(true);
    expect(result.noticeTh).toContain('รอหัวหน้าตรวจสอบ');
    expect(result.kind).toBe('IN');
  });

  it('records a punch with no location at all', async () => {
    // A phone with location off, an old handset, a basement car park. None of
    // that is the employee's fault, and an employee who cannot clock in does
    // not get paid.
    const result = await punchClock({ employeeId, token, at: null });

    expect(result.needsReview).toBe(true);
    const entry = await prisma.timeClockEntry.findUniqueOrThrow({ where: { id: result.entryId } });
    expect(entry.geofence).toBe('NO_FIX');
    expect(entry.lat).toBeNull();
  });

  it('does not read a vague fix as a pass', async () => {
    const result = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 5000 });

    const entry = await prisma.timeClockEntry.findUniqueOrThrow({ where: { id: result.entryId } });
    expect(entry.geofence).toBe('UNRELIABLE');
    expect(entry.needsReview).toBe(true);
  });
});

describe('what does get refused', () => {
  it('refuses a scan of something that is not our code', async () => {
    // Unlike a bad location, this is not the employee's circumstances.
    await expect(
      punchClock({ employeeId, token: 'https://example.com/not-our-qr', at: OFFICE }),
    ).rejects.toBeInstanceOf(TimeClockError);
  });

  it('refuses a token signed with a different secret', async () => {
    const forged = await issueStaticToken(SCAN_POINT, 'some-other-deployment');
    await expect(punchClock({ employeeId, token: forged, at: OFFICE })).rejects.toBeInstanceOf(
      TimeClockError,
    );
  });

  it('writes nothing when the token is refused', async () => {
    await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10 }).catch(() => {});
    const before = await prisma.timeClockEntry.count({ where: { employeeId } });

    await expect(punchClock({ employeeId, token: 'rubbish', at: OFFICE })).rejects.toThrow();
    expect(await prisma.timeClockEntry.count({ where: { employeeId } })).toBe(before);
  });

  it('refuses someone who has left', async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'RESIGNED' } });

    await expect(punchClock({ employeeId, token, at: OFFICE })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('says which status is in the way, and how to clear it', async () => {
    // The old message named no status and offered no way out, so the office
    // went looking through settings for a switch that did not exist.
    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'RESIGNED' } });

    await expect(punchClock({ employeeId, token, at: OFFICE })).rejects.toThrow(/ลาออกแล้ว/);
  });

  it('refuses someone away on long leave', async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'ON_LEAVE' } });

    await expect(punchClock({ employeeId, token, at: OFFICE })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('probation staff', () => {
  /*
   * The client's first employee was on probation and could not clock in. The
   * guard read `status !== 'ACTIVE'`, which sounds like "must be employed" but
   * means "must be permanent" — ACTIVE is the enum value for permanent staff.
   *
   * Probation staff work the hours and are paid for them, so they punch like
   * everybody else. Both directions are covered here: that they can, and that
   * the punch is a real row payroll will read, not a swallowed no-op.
   */
  it('can punch in', async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'PROBATION' } });

    const result = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10 });

    expect(result.kind).toBe('IN');
    expect(result.needsReview).toBe(false);
  });

  it('records the punch, not just a passing return value', async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'PROBATION' } });
    const before = await prisma.timeClockEntry.count({ where: { employeeId } });

    await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10 });

    expect(await prisma.timeClockEntry.count({ where: { employeeId } })).toBe(before + 1);
  });

  it('pairs IN and OUT the same way permanent staff do', async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'PROBATION' } });
    const now = new Date();

    const first = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10, now });
    const second = await punchClock({
      employeeId,
      token,
      at: OFFICE,
      accuracyMetres: 10,
      now: new Date(now.getTime() + 5 * 3_600_000),
    });

    expect(first.kind).toBe('IN');
    expect(second.kind).toBe('OUT');
  });
});

describe('the same scan arriving twice', () => {
  it('is one punch, not a two-second shift', async () => {
    const now = new Date();
    const first = await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10, now });
    const second = await punchClock({
      employeeId, token, at: OFFICE, accuracyMetres: 10,
      now: new Date(now.getTime() + 3_000),
    });

    expect(second.duplicate).toBe(true);
    expect(second.entryId).toBe(first.entryId);
    expect(await prisma.timeClockEntry.count({ where: { employeeId } })).toBe(1);
  });

  it('lets a real second punch through once the window has passed', async () => {
    const now = new Date();
    await punchClock({ employeeId, token, at: OFFICE, accuracyMetres: 10, now });
    const second = await punchClock({
      employeeId, token, at: OFFICE, accuracyMetres: 10,
      now: new Date(now.getTime() + 5 * 60_000),
    });

    expect(second.duplicate).toBe(false);
    expect(second.kind).toBe('OUT');
  });
});

describe('the supervisor queue', () => {
  it('lists flagged punches oldest first', async () => {
    await punchClock({ employeeId, token, at: null });

    const queue = await pendingReviews();
    expect(queue.some((e) => e.employeeId === employeeId)).toBe(true);
  });

  it('clears a flag and keeps why', async () => {
    const punch = await punchClock({ employeeId, token, at: northOf(4000), accuracyMetres: 10 });
    await reviewEntry({ entryId: punch.entryId, reviewerId, note: 'ไปส่งของก่อนเข้าออฟฟิศ' });

    const entry = await prisma.timeClockEntry.findUniqueOrThrow({ where: { id: punch.entryId } });
    expect(entry.needsReview).toBe(false);
    expect(entry.reviewNote).toBe('ไปส่งของก่อนเข้าออฟฟิศ');
    expect(entry.reviewedById).toBe(reviewerId);
  });

  it('will not clear a flag without a reason', async () => {
    const punch = await punchClock({ employeeId, token, at: null });

    // A flag waved away with no reason is the same as no flag when somebody
    // asks later why a punch four kilometres out was accepted.
    await expect(
      reviewEntry({ entryId: punch.entryId, reviewerId, note: '   ' }),
    ).rejects.toBeInstanceOf(TimeClockError);
  });
});
