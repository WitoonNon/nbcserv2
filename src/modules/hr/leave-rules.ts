import type { EmploymentType } from '@/generated/prisma';

/**
 * How much leave is paid, and how much is not.
 *
 * Pure, so the rule can be read and tested without a database — and because
 * the numbers in it came from the client rather than from the law, which
 * makes them the kind of thing somebody will need to check later.
 *
 * ## The client's policy is below the statutory minimum
 *
 * Raised with them and confirmed on 26 ส.ค.: they want 15 paid sick days
 * where ม.57 sets 30, and 0 paid personal days where ม.34 / ม.57/1 sets 3.
 * They also want paid sick leave limited to monthly staff, which the law does
 * not distinguish.
 *
 * That decision is theirs to make and this module implements it — but it is
 * held in AppConfig rather than in code precisely so it can be changed the
 * day somebody reconsiders, and the shortfall is named here so the next
 * person does not assume these figures are the legal ones.
 */

export type LeaveType =
  /** ลาป่วย — ม.32 */
  | 'SICK'
  /** ลากิจ — ม.34 */
  | 'PERSONAL'
  /** ลาพักร้อน — ม.30 */
  | 'ANNUAL'
  /** ลาโดยไม่รับค่าจ้าง */
  | 'UNPAID';

export const LEAVE_LABEL_TH: Record<LeaveType, string> = {
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  ANNUAL: 'ลาพักร้อน',
  UNPAID: 'ลาไม่รับค่าจ้าง',
};

/** What พ.ร.บ.คุ้มครองแรงงาน requires, for comparison — not what is applied. */
export const STATUTORY_MINIMUM_PAID_DAYS: Partial<Record<LeaveType, number>> = {
  SICK: 30,
  PERSONAL: 3,
  ANNUAL: 6,
};

export interface LeavePolicy {
  /** ลาป่วย จ่ายกี่วันต่อปี */
  sickPaidDaysPerYear: number;
  /** จ่ายเฉพาะพนักงานรายเดือนหรือไม่ */
  sickMonthlyStaffOnly: boolean;
  /** ลากิจ จ่ายกี่วันต่อปี */
  personalPaidDaysPerYear: number;
  /** ลาพักร้อน จ่ายกี่วันต่อปี */
  annualPaidDaysPerYear: number;
}

/** Matches prisma/seed/01-platform.ts — the client's answers of 26 ส.ค. */
export const LEAVE_POLICY_DEFAULTS: LeavePolicy = {
  sickPaidDaysPerYear: 15,
  sickMonthlyStaffOnly: true,
  personalPaidDaysPerYear: 0,
  annualPaidDaysPerYear: 6,
};

/** Where the applied policy falls short of the law, for the settings screen. */
export function policyShortfalls(policy: LeavePolicy): {
  type: LeaveType;
  applied: number;
  statutory: number;
}[] {
  const applied: Partial<Record<LeaveType, number>> = {
    SICK: policy.sickPaidDaysPerYear,
    PERSONAL: policy.personalPaidDaysPerYear,
    ANNUAL: policy.annualPaidDaysPerYear,
  };

  return (Object.keys(STATUTORY_MINIMUM_PAID_DAYS) as LeaveType[])
    .map((type) => ({
      type,
      applied: applied[type] ?? 0,
      statutory: STATUTORY_MINIMUM_PAID_DAYS[type] ?? 0,
    }))
    .filter((row) => row.applied < row.statutory);
}

/** Paid days a year for this type and this kind of contract. */
export function entitlementDays(
  policy: LeavePolicy,
  type: LeaveType,
  employmentType: EmploymentType,
): number {
  switch (type) {
    case 'SICK':
      // The client's restriction, not the law's.
      if (policy.sickMonthlyStaffOnly && employmentType !== 'MONTHLY') return 0;
      return policy.sickPaidDaysPerYear;
    case 'PERSONAL':
      return policy.personalPaidDaysPerYear;
    case 'ANNUAL':
      return policy.annualPaidDaysPerYear;
    case 'UNPAID':
      return 0;
  }
}

export interface LeaveSplitInput {
  policy: LeavePolicy;
  type: LeaveType;
  employmentType: EmploymentType;
  /** Paid days of this type already taken this year. */
  paidDaysUsed: number;
  requestedDays: number;
}

export interface LeaveSplit {
  paidDays: number;
  unpaidDays: number;
  entitlementDays: number;
  remainingAfter: number;
  /** True when part of the request falls outside the paid entitlement. */
  partlyUnpaid: boolean;
}

/**
 * Split a request into the part that is paid and the part that is not.
 *
 * A request that runs past the entitlement is NOT refused — people are ill for
 * longer than their allowance, and refusing the leave does not make them well.
 * It is split, so the employee can see before they commit which days they will
 * not be paid for.
 */
export function splitLeave(input: LeaveSplitInput): LeaveSplit {
  const { policy, type, employmentType, requestedDays } = input;

  if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
    return {
      paidDays: 0,
      unpaidDays: 0,
      entitlementDays: 0,
      remainingAfter: 0,
      partlyUnpaid: false,
    };
  }

  const entitlement = entitlementDays(policy, type, employmentType);
  const used = Math.max(0, input.paidDaysUsed);
  const remainingBefore = Math.max(0, entitlement - used);

  const paidDays = Math.min(requestedDays, remainingBefore);
  const unpaidDays = requestedDays - paidDays;

  return {
    paidDays,
    unpaidDays,
    entitlementDays: entitlement,
    remainingAfter: remainingBefore - paidDays,
    partlyUnpaid: unpaidDays > 0,
  };
}

/**
 * Whole days between two dates, inclusive of both.
 *
 * Calendar days, not working days: the client has not supplied a working
 * calendar for leave, and inventing one would quietly change how much leave
 * a request costs somebody. Recorded as an open question rather than guessed.
 */
export function leaveDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}
