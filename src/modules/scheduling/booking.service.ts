import { prisma } from '@/lib/db';
import type { AcType, ServiceCategory } from '@/generated/prisma';
import { resolvePrice } from '@/modules/catalog/pricing.service';
import { resolveFeePolicy } from '@/modules/billing/fee.service';
import { getAvailability, dateOnly, type DayAvailability } from './quota.service';

/**
 * Everything the customer booking page needs to know before it lets someone
 * pick a date (Phase 1).
 *
 * The page must show the same numbers the booking transaction will later
 * enforce. If the calendar estimated 30 minutes per unit and bookSlot() charged
 * 90, a day shown as available would refuse at the last step — so the estimate
 * used to render availability is the same one written to the job.
 */

/** @client-confirm C6 — minimum lead time assumed 3 days. */
export const MIN_LEAD_DAYS = 3;
export const BOOKING_WINDOW_DAYS = 45;

export interface BookingEstimate {
  unitCount: number;
  minutesPerUnit: number;
  totalMinutes: number;
  unitPrice: number | null;
  estimatedTotal: number | null;
  serviceName: string | null;
}

/**
 * Duration and indicative price for the units the customer says they have.
 *
 * Falls back to 60 minutes when the catalogue has no match: refusing to quote
 * would block the booking entirely, and a middle-of-the-road estimate keeps
 * capacity honest until the office confirms the real unit type on site.
 */
export async function estimateBooking(params: {
  category: ServiceCategory;
  acType?: AcType | null;
  unitCount: number;
}): Promise<BookingEstimate> {
  const unitCount = Math.max(1, Math.trunc(params.unitCount));

  const price = await resolvePrice({
    category: params.category,
    acType: params.acType ?? null,
    tier: 'STANDARD',
  });

  const minutesPerUnit = price?.standardDurationMin ?? 60;

  return {
    unitCount,
    minutesPerUnit,
    totalMinutes: minutesPerUnit * unitCount,
    unitPrice: price?.unitPrice ?? null,
    estimatedTotal: price ? price.unitPrice * unitCount : null,
    serviceName: price?.nameTh ?? null,
  };
}

export interface FeePreview {
  amount: number;
  waived: boolean;
  waivedReason: string | null;
  creditedOnProceed: boolean;
  note: string;
}

/**
 * What the customer must agree to before the slot is committed.
 *
 * The client promised "the system can require the customer to accept the
 * call-out fee before booking continues", so this runs BEFORE any capacity is
 * consumed — not as a surprise on the confirmation screen.
 */
export async function previewInspectionFee(params: {
  category: ServiceCategory;
  zoneId: string;
  phone?: string;
}): Promise<FeePreview | null> {
  // A returning customer under contract gets the published free diagnostic, so
  // the quote has to know who is asking before it can promise a price.
  let isContractCustomer = false;
  if (params.phone) {
    const customer = await prisma.customer.findFirst({
      where: { phone: params.phone },
      select: { id: true },
    });
    if (customer) {
      const contract = await prisma.contract.findFirst({
        where: { customerId: customer.id, status: 'ACTIVE' },
        select: { id: true },
      });
      isContractCustomer = Boolean(contract);
    }
  }

  const policy = await resolveFeePolicy({
    jobId: '',
    category: params.category,
    zoneId: params.zoneId,
    isContractCustomer,
  });
  if (!policy) return null;

  if (isContractCustomer && policy.waiveForContractCustomer) {
    return {
      amount: 0,
      waived: true,
      waivedReason: 'ลูกค้าในสัญญา — ตรวจเช็คฟรีตามสัญญาบริการ',
      creditedOnProceed: policy.creditOnProceed,
      note: 'ระบบจะไม่บันทึกค่าตรวจเช็คสำหรับงานนี้',
    };
  }

  const amount = Number(policy.amount);
  return {
    amount,
    waived: false,
    waivedReason: null,
    creditedOnProceed: policy.creditOnProceed,
    note: policy.creditOnProceed
      ? 'หากตกลงซ่อมต่อ ค่าตรวจเช็คนี้จะถูกหักคืนเป็นส่วนลดในบิล'
      : 'ค่าตรวจเช็คนี้เรียกเก็บแยกจากค่าซ่อม',
  };
}

export interface BookingCalendar {
  zoneId: string;
  zoneName: string;
  days: DayAvailability[];
  estimate: BookingEstimate;
}

/** The calendar for one category + unit count, sized to what the job will cost. */
export async function getBookingCalendar(params: {
  category: ServiceCategory;
  acType?: AcType | null;
  unitCount: number;
  zoneId?: string;
}): Promise<BookingCalendar | null> {
  const zone = params.zoneId
    ? await prisma.zone.findUnique({ where: { id: params.zoneId } })
    : await prisma.zone.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } });
  if (!zone) return null;

  const estimate = await estimateBooking(params);

  const from = dateOnly(new Date(Date.now() + MIN_LEAD_DAYS * 86_400_000));
  const to = dateOnly(new Date(Date.now() + BOOKING_WINDOW_DAYS * 86_400_000));

  const days = await getAvailability({
    from,
    to,
    zoneId: zone.id,
    category: params.category,
    requiredUnits: estimate.unitCount,
    requiredMinutes: estimate.totalMinutes,
  });

  return { zoneId: zone.id, zoneName: zone.nameTh, days, estimate };
}
