import 'server-only';
import { prisma } from '@/lib/db';

/**
 * What a photograph is allowed to remember about where and when it was taken.
 *
 * The client asked for this to be switchable, and the two halves are
 * deliberately separate switches because they carry very different weight:
 *
 * - **Capture time** is about the work. It answers "was this photographed on
 *   the visit, or is it an old picture?" and identifies nobody.
 * - **Location** is a customer's home address as coordinates. That is personal
 *   data under PDPA, so it is OFF until someone decides otherwise — a default
 *   nobody revisits is the setting the system actually runs on.
 *
 * Stored in AppConfig rather than an env var so the office can change it
 * without a deploy, and so the choice sits on the settings screen beside
 * everything else that was a judgement call.
 */

export const CAPTURE_KEYS = {
  takenAt: 'media.capture.recordTakenAt',
  location: 'media.capture.recordLocation',
} as const;

export interface CapturePolicy {
  /** Keep the moment the photograph was taken. */
  recordTakenAt: boolean;
  /** Keep the coordinates the photograph was taken at. */
  recordLocation: boolean;
}

export const CAPTURE_DEFAULTS: CapturePolicy = {
  recordTakenAt: true,
  recordLocation: false,
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  // AppConfig.value is Json, so a value edited by hand may arrive as a string.
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export async function getCapturePolicy(): Promise<CapturePolicy> {
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: [CAPTURE_KEYS.takenAt, CAPTURE_KEYS.location] } },
      select: { key: true, value: true },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    return {
      recordTakenAt: asBool(byKey.get(CAPTURE_KEYS.takenAt), CAPTURE_DEFAULTS.recordTakenAt),
      recordLocation: asBool(byKey.get(CAPTURE_KEYS.location), CAPTURE_DEFAULTS.recordLocation),
    };
  } catch {
    // A database that cannot be read must not become a decision to collect
    // MORE than the office asked for. Falling back to the defaults keeps
    // location off.
    return CAPTURE_DEFAULTS;
  }
}

export async function setCapturePolicy(policy: CapturePolicy): Promise<void> {
  const entries: [string, boolean, string][] = [
    [CAPTURE_KEYS.takenAt, policy.recordTakenAt, 'บันทึกเวลาที่ถ่ายรูปหน้างาน'],
    [CAPTURE_KEYS.location, policy.recordLocation, 'บันทึกพิกัด GPS ของรูปหน้างาน (ข้อมูลส่วนบุคคล)'],
  ];

  for (const [key, value, description] of entries) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value, description, isAssumption: false },
      // Deliberately answered by a human now, so it stops counting as an
      // assumption awaiting confirmation.
      update: { value, isAssumption: false },
    });
  }
}
