'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { AcType, ServiceCategory } from '@/generated/prisma';
import {
  getBookingCalendar,
  previewInspectionFee,
  type BookingCalendar,
  type FeePreview,
} from '@/modules/scheduling/booking.service';
import {
  holdSlot,
  releaseHold,
  isCapacityRefusal,
  QuotaUnavailableError,
} from '@/modules/scheduling/quota.service';
import { createJobFromBooking } from '@/modules/jobs/job.service';
import { LINK_JOB_COOKIE, LINK_JOB_COOKIE_MAX_AGE } from '@/lib/notify/link-cookie';

const HOLD_COOKIE = 'nbc_booking_session';

/**
 * A hold has to survive the customer filling in their details, which means it
 * needs an identity that outlives a single request but is not a login. A random
 * key in an httpOnly cookie is exactly that — it cannot be read by script, and
 * it is worthless to anyone who steals it beyond releasing their own hold.
 */
async function bookingSessionKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(HOLD_COOKIE)?.value;
  if (existing) return existing;

  const key = randomUUID();
  jar.set(HOLD_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60,
    path: '/',
  });
  return key;
}

export interface CalendarResult {
  calendar: BookingCalendar | null;
  fee: FeePreview | null;
  error?: string;
}

/** Re-read availability whenever the customer changes what they are booking. */
export async function loadCalendarAction(params: {
  category: ServiceCategory;
  acType: AcType | null;
  unitCount: number;
  phone?: string;
}): Promise<CalendarResult> {
  try {
    const calendar = await getBookingCalendar(params);
    if (!calendar) return { calendar: null, fee: null, error: 'ยังไม่ได้ตั้งค่าเขตพื้นที่ให้บริการ' };

    const fee = await previewInspectionFee({
      category: params.category,
      zoneId: calendar.zoneId,
      phone: params.phone,
    });

    return { calendar, fee };
  } catch (e) {
    return { calendar: null, fee: null, error: friendlyMessage(e) };
  }
}

export interface HoldResult {
  ok: boolean;
  expiresAt?: string;
  error?: string;
}

/**
 * Soft-lock the chosen date for ten minutes so the slot cannot be sold out from
 * under someone who is still typing their address.
 */
export async function holdSlotAction(params: {
  date: string;
  zoneId: string;
  category: ServiceCategory;
  units: number;
  minutes: number;
}): Promise<HoldResult> {
  try {
    const sessionKey = await bookingSessionKey();
    // Only one date can be held at a time; changing your mind must not silently
    // stack holds and eat the day's capacity.
    await releaseHold(sessionKey);

    const { expiresAt } = await holdSlot(
      {
        date: new Date(`${params.date}T00:00:00Z`),
        zoneId: params.zoneId,
        category: params.category,
        units: params.units,
        minutes: params.minutes,
      },
      sessionKey,
    );

    return { ok: true, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    return { ok: false, error: friendlyMessage(e) };
  }
}

export async function releaseHoldAction(): Promise<void> {
  try {
    const jar = await cookies();
    const key = jar.get(HOLD_COOKIE)?.value;
    if (key) await releaseHold(key);
  } catch {
    // Releasing a hold is best-effort: it expires on its own within ten
    // minutes, so a failure here must never block the customer.
  }
}

export interface ConfirmState {
  error?: string;
  jobNo?: string;
  scheduledDate?: string;
  /** True once the browser holds the cookie that lets it link a LINE account. */
  canLinkLine?: boolean;
}

export async function confirmBookingAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const customerName = String(formData.get('customerName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const problemDescription = String(formData.get('problemDescription') ?? '').trim();

  const category = String(formData.get('category') ?? '') as ServiceCategory;
  const acTypeRaw = String(formData.get('acType') ?? '').trim();
  const zoneId = String(formData.get('zoneId') ?? '');
  const date = String(formData.get('date') ?? '');
  const unitCount = Number(formData.get('unitCount') ?? 1);
  const minutes = Number(formData.get('minutes') ?? 0);
  const feeAccepted = formData.get('feeAccepted') === 'on';

  if (!customerName) return { error: 'กรุณากรอกชื่อผู้ติดต่อ' };
  if (!/^0\d{8,9}$/.test(phone.replace(/[-\s]/g, ''))) {
    return { error: 'เบอร์โทรไม่ถูกต้อง — กรอกเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0' };
  }
  if (!address) return { error: 'กรุณากรอกที่อยู่หน้างาน' };
  if (!date || !zoneId || !category) return { error: 'กรุณาเลือกประเภทงานและวันที่' };
  if (!Number.isFinite(unitCount) || unitCount < 1) return { error: 'จำนวนเครื่องไม่ถูกต้อง' };

  // The fee gate the client asked for: no acceptance, no slot.
  if (!feeAccepted) {
    return { error: 'กรุณายอมรับเงื่อนไขค่าเข้าตรวจเช็คก่อนยืนยันการจอง' };
  }

  try {
    const sessionKey = await bookingSessionKey();
    const result = await createJobFromBooking({
      customerName,
      phone: phone.replace(/[-\s]/g, ''),
      email: email || null,
      address,
      category,
      acType: acTypeRaw ? (acTypeRaw as AcType) : null,
      unitCount: Math.trunc(unitCount),
      scheduledDate: new Date(`${date}T00:00:00Z`),
      zoneId,
      minutes: Math.trunc(minutes),
      problemDescription: problemDescription || undefined,
      sessionKey,
    });

    revalidatePath('/booking');
    revalidatePath('/schedule');

    // Which job this browser may attach a LINE account to. httpOnly, so the
    // id never reaches script, and short-lived — the offer belongs to the
    // person still looking at their confirmation, not to whoever uses the
    // phone next.
    //
    // The job id lives here rather than in the link URL on purpose: a job id
    // in a query string would let anyone who learned one subscribe to a
    // stranger's notifications, which announce when a technician is on the
    // way to their home.
    (await cookies()).set(LINK_JOB_COOKIE, result.jobId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: LINK_JOB_COOKIE_MAX_AGE,
      path: '/',
    });

    return { jobNo: result.jobNo, scheduledDate: date, canLinkLine: true };
  } catch (e) {
    return { error: friendlyMessage(e) };
  }
}

function friendlyMessage(e: unknown): string {
  // Losing a race for the last slot is normal, not an error the customer caused.
  if (isCapacityRefusal(e)) {
    return 'ขออภัย วันที่เลือกเพิ่งเต็มพอดี กรุณาเลือกวันอื่นครับ';
  }
  if (e instanceof QuotaUnavailableError) {
    if (e.reason === 'HOLIDAY') return 'วันที่เลือกเป็นวันหยุด กรุณาเลือกวันอื่น';
    if (e.reason === 'CLOSED') return 'วันที่เลือกปิดรับงาน กรุณาเลือกวันอื่น';
    return 'ยังไม่เปิดรับงานในวันที่เลือก กรุณาเลือกวันอื่น';
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
    return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
  }
  return msg;
}
