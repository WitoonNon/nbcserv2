import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import type { TimeClockKind } from '@/generated/prisma';
import { checkGeofence, type Coordinates } from './geofence';
import { verifyToken } from './timeclock-token';

/**
 * Clocking in and out (งานเพิ่ม 10,000 — ลงเวลาเข้า-ออก).
 *
 * The rules the client agreed, and the reasoning that has to survive edits:
 *
 * 1. **The QR code is not the anti-fraud measure; the location is.** A printed
 *    code is photographed and posted to a group chat in the first week. The
 *    token proves the scan came from a code we issued and says which point —
 *    nothing more is claimed for it.
 *
 * 2. **A bad location never refuses a punch.** It is recorded and flagged. An
 *    employee whose phone will not report a position still worked the day.
 *
 * 3. **A bad token DOES refuse.** That is not the employee's circumstances,
 *    it is a scan of something that is not our code.
 *
 * 4. **Server time is the authority.** Elsewhere in this system a client
 *    timestamp is trusted because offline it is the only record of the real
 *    moment; here it decides what somebody is paid, so a clock the employee
 *    controls does not get a vote.
 */

export class TimeClockError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'TimeClockError';
  }
}

export const TIMECLOCK_KEYS = {
  lat: 'office.location.lat',
  lng: 'office.location.lng',
  radius: 'office.location.radiusMetres',
} as const;

/**
 * Where the scan point is and how close counts.
 *
 * Read from AppConfig rather than a table: there is one office, the values are
 * already seeded and already on /settings/assumptions, and a second source of
 * truth for a coordinate that still has to be corrected by hand would mean
 * correcting it twice. A second scan point is a schema change on the day there
 * is one, not before.
 */
export interface ScanPointPolicy {
  office: Coordinates;
  radiusMetres: number;
  /** True while the seeded guess has not been replaced with a real reading. */
  isAssumption: boolean;
}

/**
 * The seeded fallback, matching prisma/seed/01-platform.ts.
 *
 * ⚠️ A guess from the centre of ต.ละหาร, not a reading taken at the scan
 * point, and 300 m is wide enough to cover the error. This value decides who
 * gets paid: it needs somebody standing where the code will hang, and the
 * radius then dropping to 50–100 m.
 */
const FALLBACK: ScanPointPolicy = {
  office: { lat: 13.968264, lng: 100.404581 },
  radiusMetres: 300,
  isAssumption: true,
};

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // AppConfig.value is Json; a value edited by hand arrives as a string.
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getScanPointPolicy(): Promise<ScanPointPolicy> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: [TIMECLOCK_KEYS.lat, TIMECLOCK_KEYS.lng, TIMECLOCK_KEYS.radius] } },
    select: { key: true, value: true, isAssumption: true },
  });
  if (rows.length === 0) return FALLBACK;

  const byKey = new Map(rows.map((r) => [r.key, r]));

  return {
    office: {
      lat: asNumber(byKey.get(TIMECLOCK_KEYS.lat)?.value, FALLBACK.office.lat),
      lng: asNumber(byKey.get(TIMECLOCK_KEYS.lng)?.value, FALLBACK.office.lng),
    },
    radiusMetres: asNumber(byKey.get(TIMECLOCK_KEYS.radius)?.value, FALLBACK.radiusMetres),
    // Any of the three still being a guess makes the whole check a guess.
    isAssumption: rows.some((r) => r.isAssumption),
  };
}

/**
 * A double tap, a flaky connection, a code scanned twice in confusion.
 *
 * Two punches this close together are one action. Recording both would show a
 * person working a two-second shift and leave the day's pairing broken.
 */
const DUPLICATE_WINDOW_MS = 60_000;

export interface PunchInput {
  employeeId: string;
  /** The scanned QR payload. */
  token: string;
  at?: Coordinates | null;
  accuracyMetres?: number | null;
  deviceInfo?: string | null;
  /** Server time by default; injectable for tests. */
  now?: Date;
}

export interface PunchResult {
  entryId: string;
  kind: TimeClockKind;
  occurredAt: string;
  needsReview: boolean;
  /** Shown to the employee, so a flag is never silent. */
  noticeTh: string | null;
  /** True when this scan matched one already recorded moments ago. */
  duplicate: boolean;
}

/**
 * Record a punch.
 *
 * Whether it is IN or OUT is worked out from the person's own last entry
 * rather than asked for. A screen that offers the choice invites the mistake,
 * and the pairing is what payroll reads.
 */
export async function punchClock(input: PunchInput): Promise<PunchResult> {
  const now = input.now ?? new Date();

  const token = await verifyToken(input.token, env().AUTH_SECRET, now);
  if (!token.ok) {
    // The one refusal. Not the employee's circumstances — a scan of something
    // that is not our code.
    throw new TimeClockError(token.reasonTh, 400);
  }

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, status: true },
  });
  if (!employee) throw new TimeClockError('ไม่พบข้อมูลพนักงาน', 404);
  if (employee.status !== 'ACTIVE') {
    throw new TimeClockError('บัญชีพนักงานนี้ไม่ได้อยู่ในสถานะทำงาน', 409);
  }

  const last = await prisma.timeClockEntry.findFirst({
    where: { employeeId: employee.id },
    orderBy: { occurredAt: 'desc' },
    select: { id: true, kind: true, occurredAt: true, needsReview: true },
  });

  // Same action arriving twice: return the entry already written rather than
  // adding a second one.
  if (last && now.getTime() - last.occurredAt.getTime() < DUPLICATE_WINDOW_MS) {
    return {
      entryId: last.id,
      kind: last.kind,
      occurredAt: last.occurredAt.toISOString(),
      needsReview: last.needsReview,
      noticeTh: 'บันทึกเวลาไปแล้วเมื่อครู่นี้',
      duplicate: true,
    };
  }

  const kind: TimeClockKind = last?.kind === 'IN' ? 'OUT' : 'IN';

  const policy = await getScanPointPolicy();
  const fence = checkGeofence({
    at: input.at ?? null,
    accuracyMetres: input.accuracyMetres,
    office: policy.office,
    radiusMetres: policy.radiusMetres,
  });

  const entry = await prisma.timeClockEntry.create({
    data: {
      employeeId: employee.id,
      kind,
      occurredAt: now,
      scanPointId: token.scanPointId,
      tokenKind: token.kind,
      lat: input.at?.lat ?? null,
      lng: input.at?.lng ?? null,
      accuracyMetres: input.accuracyMetres ?? null,
      geofence: fence.verdict,
      distanceMetres: fence.distanceMetres,
      needsReview: fence.needsReview,
      deviceInfo: input.deviceInfo ?? null,
    },
    select: { id: true, occurredAt: true },
  });

  return {
    entryId: entry.id,
    kind,
    occurredAt: entry.occurredAt.toISOString(),
    needsReview: fence.needsReview,
    noticeTh: fence.reasonTh,
    duplicate: false,
  };
}

/** One person's punches for a day, oldest first. */
export async function entriesForDay(employeeId: string, day: Date) {
  const start = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
  const end = new Date(start.getTime() + 86_400_000);

  return prisma.timeClockEntry.findMany({
    where: { employeeId, occurredAt: { gte: start, lt: end } },
    orderBy: { occurredAt: 'asc' },
  });
}

/** Punches a supervisor still has to look at, oldest first. */
export async function pendingReviews(limit = 50) {
  return prisma.timeClockEntry.findMany({
    where: { needsReview: true, reviewedAt: null },
    orderBy: { occurredAt: 'asc' },
    take: limit,
    include: {
      employee: { select: { employeeCode: true, firstNameTh: true, lastNameTh: true } },
    },
  });
}

/**
 * Clear a flag.
 *
 * Only a supervisor can, and the note is kept: a flag that was waved away
 * without a reason is the same as no flag at all when somebody asks later why
 * a punch three kilometres from the office was accepted.
 */
export async function reviewEntry(params: {
  entryId: string;
  reviewerId: string;
  note: string;
}): Promise<void> {
  const note = params.note.trim();
  if (!note) throw new TimeClockError('ต้องระบุเหตุผลที่อนุมัติ');

  await prisma.timeClockEntry.update({
    where: { id: params.entryId },
    data: {
      needsReview: false,
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
    },
  });
}
