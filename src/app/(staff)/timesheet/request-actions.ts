'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { approveOvertime, OvertimeError, rejectOvertime } from '@/modules/hr/overtime.service';
import { approveLeave, LeaveError, rejectLeave } from '@/modules/hr/leave.service';
import { inScope, visibleEmployeeIds } from '@/modules/hr/scope';
import { prisma } from '@/lib/db';

export interface DecisionState {
  error?: string;
  ok?: string;
}

/**
 * The permission says you may decide; this says whose — ใบเสนอราคาข้อ 7.
 *
 * Checked here and not only on the page, because hiding a request from a
 * queue is presentation. A supervisor who learns another team's request id
 * must still be refused when they post it, and this is the place that does it.
 */
/** Whose request this is, so the scope can be checked before anything is written. */
async function ownerOf(kind: 'overtime' | 'leave', requestId: string): Promise<string | null> {
  const row =
    kind === 'overtime'
      ? await prisma.overtimeRequest.findUnique({
          where: { id: requestId },
          select: { employeeId: true },
        })
      : await prisma.leaveRequest.findUnique({
          where: { id: requestId },
          select: { employeeId: true },
        });
  return row?.employeeId ?? null;
}

async function assertMayDecide(employeeId: string) {
  const actor = await assertPermission('hr.approve');
  const scope = await visibleEmployeeIds(actor);
  if (!inScope(scope, employeeId)) {
    throw new ForbiddenError('ตัดสินคำขอของทีมอื่นไม่ได้');
  }
  return actor;
}

function friendly(e: unknown): DecisionState {
  if (e instanceof OvertimeError || e instanceof LeaveError || e instanceof ForbiddenError) {
    return { error: e.message };
  }
  const message = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: message };
}

/**
 * Decide one overtime request.
 *
 * The multiplier can be raised above the statutory minimum but the service
 * will not let it fall below — so a number typed into this form is a ceiling
 * on generosity, never a floor on the law.
 */
export async function decideOvertimeAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '');
  if (!requestId) return { error: 'ไม่พบคำขอ' };

  try {
    const owner = await ownerOf('overtime', requestId);
    if (!owner) return { error: 'ไม่พบคำขอ' };
    const actor = await assertMayDecide(owner);

    if (decision === 'reject') {
      await rejectOvertime({ requestId, deciderId: actor.id, note });
      revalidatePath('/timesheet');
      return { ok: 'ไม่อนุมัติแล้ว' };
    }

    const raw = String(formData.get('multiplier') ?? '');
    const multiplier = raw ? Number(raw) : null;
    const result = await approveOvertime({
      requestId,
      deciderId: actor.id,
      multiplier: Number.isFinite(multiplier) ? multiplier : null,
      note,
    });

    revalidatePath('/timesheet');
    return {
      ok: result.raisedToLegalMinimum
        ? `อนุมัติแล้ว — ปรับอัตราขึ้นเป็น ${result.multiplier} เท่าตามกฎหมาย`
        : `อนุมัติแล้ว (${result.multiplier} เท่า)`,
    };
  } catch (e) {
    return friendly(e);
  }
}

export async function decideLeaveAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '');
  if (!requestId) return { error: 'ไม่พบคำขอ' };

  try {
    const owner = await ownerOf('leave', requestId);
    if (!owner) return { error: 'ไม่พบคำขอ' };
    const actor = await assertMayDecide(owner);

    if (decision === 'reject') {
      await rejectLeave({ requestId, deciderId: actor.id, note });
      revalidatePath('/timesheet');
      return { ok: 'ไม่อนุมัติแล้ว' };
    }

    const split = await approveLeave({ requestId, deciderId: actor.id, note });
    revalidatePath('/timesheet');

    // The split is reported because it is decided at approval, not at
    // request: what the employee saw when they asked may no longer be what
    // they get if somebody else took the last paid day in between.
    return {
      ok: split.partlyUnpaid
        ? `อนุมัติแล้ว — จ่าย ${split.paidDays} วัน ไม่จ่าย ${split.unpaidDays} วัน`
        : `อนุมัติแล้ว — จ่ายทั้ง ${split.paidDays} วัน`,
    };
  } catch (e) {
    return friendly(e);
  }
}
