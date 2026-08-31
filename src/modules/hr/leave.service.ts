import { prisma } from '@/lib/db';
import type { LeaveType } from '@/generated/prisma';
import {
  entitlementDays,
  LEAVE_POLICY_DEFAULTS,
  leaveDaysBetween,
  splitLeave,
  type LeavePolicy,
} from './leave-rules';

/**
 * Asking for leave, and deciding on it.
 *
 * The paid/unpaid split is calculated at APPROVAL and frozen onto the row.
 * Two requests decided on the same afternoon must not both be paid out of the
 * last remaining day — whoever is approved first takes it, and the second is
 * split against what is actually left.
 */

export class LeaveError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'LeaveError';
  }
}

export const LEAVE_KEYS = {
  sickDays: 'leave.sick.paidDaysPerYear',
  sickMonthlyOnly: 'leave.sick.monthlyStaffOnly',
  personalDays: 'leave.personal.paidDaysPerYear',
  annualDays: 'leave.annual.paidDaysPerYear',
} as const;

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

/** The client's policy, from AppConfig so it changes without a deploy. */
export async function getLeavePolicy(): Promise<LeavePolicy> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: Object.values(LEAVE_KEYS) } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  return {
    sickPaidDaysPerYear: asNumber(
      byKey.get(LEAVE_KEYS.sickDays),
      LEAVE_POLICY_DEFAULTS.sickPaidDaysPerYear,
    ),
    sickMonthlyStaffOnly: asBool(
      byKey.get(LEAVE_KEYS.sickMonthlyOnly),
      LEAVE_POLICY_DEFAULTS.sickMonthlyStaffOnly,
    ),
    personalPaidDaysPerYear: asNumber(
      byKey.get(LEAVE_KEYS.personalDays),
      LEAVE_POLICY_DEFAULTS.personalPaidDaysPerYear,
    ),
    annualPaidDaysPerYear: asNumber(
      byKey.get(LEAVE_KEYS.annualDays),
      LEAVE_POLICY_DEFAULTS.annualPaidDaysPerYear,
    ),
  };
}

function dateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new LeaveError('รูปแบบวันที่ไม่ถูกต้อง');
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Paid days of this type already granted in the calendar year of `on`. */
export async function paidDaysUsed(
  employeeId: string,
  type: LeaveType,
  on: Date,
): Promise<number> {
  const yearStart = new Date(Date.UTC(on.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(on.getUTCFullYear(), 11, 31));

  const rows = await prisma.leaveRequest.aggregate({
    where: {
      employeeId,
      type,
      status: 'APPROVED',
      fromDate: { gte: yearStart, lte: yearEnd },
    },
    _sum: { paidDays: true },
  });
  return Number(rows._sum.paidDays ?? 0);
}

export interface RequestLeaveInput {
  employeeId: string;
  type: LeaveType;
  /** 'YYYY-MM-DD' */
  fromDate: string;
  toDate: string;
  reason: string;
}

/**
 * Raise a request.
 *
 * The split shown here is a PREVIEW — it is recalculated at approval, because
 * somebody else's request may be approved in between and take the last paid
 * day.
 */
export async function requestLeave(input: RequestLeaveInput) {
  const from = dateOnly(input.fromDate);
  const to = dateOnly(input.toDate);
  const reason = input.reason.trim();

  if (to < from) throw new LeaveError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  if (!reason) throw new LeaveError('ต้องระบุเหตุผลที่ลา');

  const totalDays = leaveDaysBetween(from, to);
  if (totalDays <= 0) throw new LeaveError('ช่วงวันที่ไม่ถูกต้อง');
  if (totalDays > 90) throw new LeaveError('ขอลาเกิน 90 วันในคำขอเดียวไม่ได้');

  return prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      type: input.type,
      fromDate: from,
      toDate: to,
      reason,
      totalDays,
    },
    select: { id: true, totalDays: true, status: true },
  });
}

/** What this request would be worth if approved right now. */
export async function previewSplit(requestId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      type: true,
      fromDate: true,
      totalDays: true,
      employeeId: true,
      employee: { select: { employmentType: true } },
    },
  });
  if (!request) throw new LeaveError('ไม่พบคำขอลา', 404);

  const policy = await getLeavePolicy();
  return splitLeave({
    policy,
    type: request.type,
    employmentType: request.employee.employmentType,
    paidDaysUsed: await paidDaysUsed(request.employeeId, request.type, request.fromDate),
    requestedDays: Number(request.totalDays),
  });
}

/**
 * Approve, splitting paid from unpaid against what is left today.
 *
 * The split and the read of what has been used happen in one transaction, so
 * two approvals racing for the last paid day cannot both win it.
 */
export async function approveLeave(params: {
  requestId: string;
  deciderId: string;
  note?: string | null;
}) {
  const policy = await getLeavePolicy();

  return prisma.$transaction(
    async (tx) => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: params.requestId },
        select: {
          id: true,
          status: true,
          type: true,
          fromDate: true,
          totalDays: true,
          employeeId: true,
          employee: { select: { employmentType: true } },
        },
      });
      if (!request) throw new LeaveError('ไม่พบคำขอลา', 404);
      if (request.status !== 'PENDING') throw new LeaveError('คำขอนี้ตัดสินไปแล้ว', 409);

      const year = request.fromDate.getUTCFullYear();
      const used = await tx.leaveRequest.aggregate({
        where: {
          employeeId: request.employeeId,
          type: request.type,
          status: 'APPROVED',
          fromDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31)),
          },
        },
        _sum: { paidDays: true },
      });

      const split = splitLeave({
        policy,
        type: request.type,
        employmentType: request.employee.employmentType,
        paidDaysUsed: Number(used._sum.paidDays ?? 0),
        requestedDays: Number(request.totalDays),
      });

      await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          paidDays: split.paidDays,
          unpaidDays: split.unpaidDays,
          decidedById: params.deciderId,
          decidedAt: new Date(),
          decisionNote: params.note?.trim() || null,
        },
      });

      return split;
    },
    { timeout: 15_000 },
  );
}

export async function rejectLeave(params: {
  requestId: string;
  deciderId: string;
  note: string;
}) {
  const note = params.note.trim();
  if (!note) throw new LeaveError('ต้องระบุเหตุผลที่ไม่อนุมัติ');

  const request = await prisma.leaveRequest.findUnique({
    where: { id: params.requestId },
    select: { status: true },
  });
  if (!request) throw new LeaveError('ไม่พบคำขอลา', 404);
  if (request.status !== 'PENDING') throw new LeaveError('คำขอนี้ตัดสินไปแล้ว', 409);

  await prisma.leaveRequest.update({
    where: { id: params.requestId },
    data: {
      status: 'REJECTED',
      decidedById: params.deciderId,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });
}

/**
 * Withdraw a leave request you made yourself, before anyone has decided.
 *
 * Mirrors cancelOvertime(), including the ownership check: `employeeId` comes
 * from the session, never from the form, so the id in a submitted request is
 * only ever the thing being cancelled — never whose it is.
 *
 * Cancelled, not deleted: a request that was made and withdrawn is part of
 * the record of what happened.
 */
export async function cancelLeave(params: { requestId: string; employeeId: string }) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: params.requestId },
    select: { employeeId: true, status: true },
  });
  if (!request) throw new LeaveError('ไม่พบคำขอลา', 404);
  if (request.employeeId !== params.employeeId) {
    throw new LeaveError('ยกเลิกคำขอของคนอื่นไม่ได้', 403);
  }
  if (request.status !== 'PENDING') {
    throw new LeaveError('คำขอนี้ตัดสินไปแล้ว ยกเลิกเองไม่ได้', 409);
  }

  await prisma.leaveRequest.update({
    where: { id: params.requestId },
    data: { status: 'CANCELLED' },
  });
}

/** One employee's own leave requests, newest first, every status. */
export async function myLeaveRequests(employeeId: string, limit = 30) {
  return prisma.leaveRequest.findMany({
    where: { employeeId },
    orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      type: true,
      fromDate: true,
      toDate: true,
      reason: true,
      status: true,
      totalDays: true,
      paidDays: true,
      unpaidDays: true,
      decisionNote: true,
      decidedAt: true,
    },
  });
}

export interface LeaveBalance {
  type: LeaveType;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
}

/**
 * What this employee has left, per type, for the calendar year of `on`.
 *
 * Shown before they ask rather than after they are told. Somebody deciding
 * whether to take an unpaid day should be able to see that it will be unpaid
 * while they still have the choice — the split at approval is not the moment
 * to find out.
 *
 * Counts APPROVED requests only, which means a pending request is not held
 * against the balance. That is deliberate and it is the honest reading: an
 * undecided request has consumed nothing yet, and reserving against it would
 * show a smaller balance than the employee actually has.
 */
export async function leaveBalances(employeeId: string, on = new Date()): Promise<LeaveBalance[]> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { employmentType: true },
  });
  if (!employee) throw new LeaveError('ไม่พบทะเบียนพนักงาน', 404);

  const policy = await getLeavePolicy();
  const types: LeaveType[] = ['SICK', 'PERSONAL', 'ANNUAL'];

  return Promise.all(
    types.map(async (type) => {
      const entitlement = entitlementDays(policy, type, employee.employmentType);
      const used = await paidDaysUsed(employeeId, type, on);
      return {
        type,
        entitlementDays: entitlement,
        usedDays: used,
        remainingDays: Math.max(0, entitlement - used),
      };
    }),
  );
}

export async function pendingLeave(limit = 100, employeeIds: string[] | null = null) {
  return prisma.leaveRequest.findMany({
    where: { status: 'PENDING', ...(employeeIds === null ? {} : { employeeId: { in: employeeIds } }) },
    orderBy: { fromDate: 'asc' },
    take: limit,
    include: {
      employee: { select: { employeeCode: true, firstNameTh: true, lastNameTh: true } },
    },
  });
}

/** Approved leave overlapping a payroll period. */
export async function approvedLeaveInPeriod(from: Date, to: Date) {
  return prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      // Overlaps the period rather than sits inside it: leave that spans a
      // month boundary belongs partly to each.
      fromDate: { lte: to },
      toDate: { gte: from },
    },
    orderBy: { fromDate: 'asc' },
  });
}
