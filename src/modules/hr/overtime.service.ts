import { prisma } from '@/lib/db';
import type { OvertimeKind } from '@/generated/prisma';
import { LEGAL_MINIMUM_MULTIPLIER } from './payroll-rules';
import { otRatesAtDate } from './wage.service';

/**
 * Asking for overtime, and deciding on it.
 *
 * The approval chain is borrowed from the work order deliberately — the office
 * already knows that shape: it is submitted, somebody approves or returns it
 * with a reason, and once decided the person who asked cannot quietly change
 * what was agreed.
 *
 * The multiplier is FROZEN at approval rather than read at payroll time. A
 * payslip reissued in two years has to show the rate that was actually paid,
 * and the configured rate will have moved by then.
 */

export class OvertimeError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'OvertimeError';
  }
}

/** More than this in one day is almost always a typo, not a shift. */
const MAX_HOURS_PER_REQUEST = 16;

export interface RequestOvertimeInput {
  employeeId: string;
  /** 'YYYY-MM-DD' */
  workDate: string;
  kind: OvertimeKind;
  hours: number;
  reason: string;
}

function dateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new OvertimeError('รูปแบบวันที่ไม่ถูกต้อง');
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export async function requestOvertime(input: RequestOvertimeInput) {
  const workDate = dateOnly(input.workDate);
  const reason = input.reason.trim();

  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    throw new OvertimeError('จำนวนชั่วโมงต้องมากกว่าศูนย์');
  }
  if (input.hours > MAX_HOURS_PER_REQUEST) {
    throw new OvertimeError(`ขอโอทีเกิน ${MAX_HOURS_PER_REQUEST} ชั่วโมงในวันเดียวไม่ได้`);
  }
  // Required, because "why" is the only thing an approver has to go on and a
  // blank reason turns approval into a rubber stamp.
  if (!reason) throw new OvertimeError('ต้องระบุเหตุผลที่ขอโอที');

  // A day in the future is a plan, not overtime worked. Tomorrow is allowed
  // for a shift already agreed; next month is a mistake.
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (workDate.getTime() > tomorrow.getTime() + 86_400_000) {
    throw new OvertimeError('ขอโอทีล่วงหน้าเกิน 1 วันไม่ได้');
  }

  return prisma.overtimeRequest.create({
    data: {
      employeeId: input.employeeId,
      workDate,
      kind: input.kind,
      hours: input.hours,
      reason,
    },
    select: { id: true, status: true, workDate: true, hours: true },
  });
}

/**
 * Approve, at a rate that may exceed the statutory floor but never fall below.
 *
 * The floor is applied here as well as in the calculator: this is the number
 * that gets frozen onto the row, and a row carrying an unlawful rate would
 * keep being unlawful every time it was read.
 */
export async function approveOvertime(params: {
  requestId: string;
  deciderId: string;
  /** Omitted means the statutory minimum for that kind. */
  multiplier?: number | null;
  note?: string | null;
}) {
  const request = await prisma.overtimeRequest.findUnique({
    where: { id: params.requestId },
    select: {
      id: true,
      status: true,
      kind: true,
      paidInPeriodId: true,
      employeeId: true,
      workDate: true,
    },
  });
  if (!request) throw new OvertimeError('ไม่พบคำขอโอที', 404);
  if (request.status !== 'PENDING') {
    throw new OvertimeError('คำขอนี้ตัดสินไปแล้ว', 409);
  }

  const floor = LEGAL_MINIMUM_MULTIPLIER[request.kind];

  // The personal rate (ใบเสนอราคาข้อ 5) is the DEFAULT, not a ceiling: it is
  // used when the approver did not type a number, and read as it stood on the
  // day the work was done rather than today. Whatever it says, the floor below
  // still applies — a personal rate cannot take somebody under the law.
  const personal = (await otRatesAtDate(request.employeeId, request.workDate))[request.kind];

  const asked = params.multiplier;
  const chosen =
    typeof asked === 'number' && Number.isFinite(asked) ? asked : (personal ?? floor);
  const multiplier = Math.max(chosen, floor);

  await prisma.overtimeRequest.update({
    where: { id: request.id },
    data: {
      status: 'APPROVED',
      approvedMultiplier: multiplier,
      decidedById: params.deciderId,
      decidedAt: new Date(),
      decisionNote: params.note?.trim() || null,
    },
  });

  return { multiplier, raisedToLegalMinimum: chosen < floor };
}

/** Refusing needs a reason — "no" on its own is not something anyone can act on. */
export async function rejectOvertime(params: {
  requestId: string;
  deciderId: string;
  note: string;
}) {
  const note = params.note.trim();
  if (!note) throw new OvertimeError('ต้องระบุเหตุผลที่ไม่อนุมัติ');

  const request = await prisma.overtimeRequest.findUnique({
    where: { id: params.requestId },
    select: { status: true },
  });
  if (!request) throw new OvertimeError('ไม่พบคำขอโอที', 404);
  if (request.status !== 'PENDING') throw new OvertimeError('คำขอนี้ตัดสินไปแล้ว', 409);

  await prisma.overtimeRequest.update({
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
 * Withdraw a request you made yourself, before anyone has decided.
 *
 * Cancelling rather than deleting: a request that was made and withdrawn is
 * part of the record of what happened.
 */
export async function cancelOvertime(params: { requestId: string; employeeId: string }) {
  const request = await prisma.overtimeRequest.findUnique({
    where: { id: params.requestId },
    select: { employeeId: true, status: true },
  });
  if (!request) throw new OvertimeError('ไม่พบคำขอโอที', 404);
  if (request.employeeId !== params.employeeId) {
    throw new OvertimeError('ยกเลิกคำขอของคนอื่นไม่ได้', 403);
  }
  if (request.status !== 'PENDING') {
    throw new OvertimeError('คำขอนี้ตัดสินไปแล้ว ยกเลิกเองไม่ได้', 409);
  }

  await prisma.overtimeRequest.update({
    where: { id: params.requestId },
    data: { status: 'CANCELLED' },
  });
}

/** Approved overtime in a period that has not yet been paid. */
export async function approvedOvertimeInPeriod(from: Date, to: Date) {
  return prisma.overtimeRequest.findMany({
    where: {
      status: 'APPROVED',
      workDate: { gte: from, lte: to },
      // Never paid twice: once a run has claimed it, it belongs to that run.
      paidInPeriodId: null,
    },
    orderBy: { workDate: 'asc' },
  });
}

/**
 * One employee's own overtime requests, newest first.
 *
 * Includes every status. A request that was refused is the answer to "what
 * happened to the one I sent" — hiding it once decided makes the screen look
 * like the request was never made.
 */
export async function myOvertimeRequests(employeeId: string, limit = 30) {
  return prisma.overtimeRequest.findMany({
    where: { employeeId },
    orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      workDate: true,
      kind: true,
      hours: true,
      reason: true,
      status: true,
      approvedMultiplier: true,
      decisionNote: true,
      decidedAt: true,
      paidInPeriodId: true,
    },
  });
}

export async function pendingOvertime(limit = 100, employeeIds: string[] | null = null) {
  return prisma.overtimeRequest.findMany({
    where: { status: 'PENDING', ...(employeeIds === null ? {} : { employeeId: { in: employeeIds } }) },
    orderBy: { workDate: 'asc' },
    take: limit,
    include: {
      employee: { select: { employeeCode: true, firstNameTh: true, lastNameTh: true } },
    },
  });
}
