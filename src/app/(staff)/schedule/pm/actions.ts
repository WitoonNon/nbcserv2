'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import {
  confirmPmProposal,
  dismissPmProposal,
  PmPlanningError,
} from '@/modules/scheduling/pm.service';
import { isCapacityRefusal } from '@/modules/scheduling/quota.service';
import { notifyJobSafely } from '@/modules/notifications/notify.service';
import { formatThaiDate } from '@/lib/date/buddhist';

/**
 * Answering the system's PM proposals.
 *
 * Confirming is the only place a proposal becomes a real booking, and it is
 * also the only place the customer is told anything — the proposal itself
 * sends nothing, because a date nobody has agreed to is not news.
 */

export interface ProposalState {
  error?: string;
  ok?: string;
}

function friendly(e: unknown): ProposalState {
  if (e instanceof PmPlanningError || e instanceof ForbiddenError) return { error: e.message };

  // The day filling up between the proposal and the confirmation is the
  // correct behaviour, not a fault: a paying customer booked it first. Say so
  // in those words rather than showing a capacity exception.
  if (isCapacityRefusal(e)) {
    return {
      error: 'วันนี้เต็มไปแล้ว — มีคนจองก่อน · เลื่อนวันในหน้ารายละเอียดงานแล้วยืนยันใหม่',
    };
  }

  const message = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: message };
}

function done(state: ProposalState): ProposalState {
  revalidatePath('/schedule/pm');
  revalidatePath('/jobs');
  return state;
}

export async function confirmProposalAction(
  _prev: ProposalState,
  formData: FormData,
): Promise<ProposalState> {
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) return { error: 'ไม่พบข้อเสนอ' };

  try {
    const actor = await assertPermission('quota.override');
    const result = await confirmPmProposal({ jobId, actorId: actor.id });

    // After the booking has committed, never inside it. A LINE outage must
    // not roll back a slot the customer now holds — notifyJobSafely swallows
    // its own failures for exactly this reason.
    await notifyJobSafely({
      jobId,
      templateCode: 'PM_DUE',
      vars: { scheduledDate: formatThaiDate(result.scheduledDate, 'long') },
    });

    return done({
      ok: result.becameFull
        ? `ยืนยัน ${result.jobNo} แล้ว — วันนี้เต็มพอดี`
        : `ยืนยัน ${result.jobNo} แล้ว · แจ้งลูกค้าแล้ว`,
    });
  } catch (e) {
    return friendly(e);
  }
}

export async function dismissProposalAction(
  _prev: ProposalState,
  formData: FormData,
): Promise<ProposalState> {
  const jobId = String(formData.get('jobId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!jobId) return { error: 'ไม่พบข้อเสนอ' };

  try {
    const actor = await assertPermission('quota.override');
    await dismissPmProposal({ jobId, actorId: actor.id, reason });
    return done({ ok: 'ปัดข้อเสนอแล้ว' });
  } catch (e) {
    return friendly(e);
  }
}

/**
 * Confirm several at once.
 *
 * Each one is independent: a day that filled up must not stop the other
 * fifteen from being booked, so failures are counted and reported rather than
 * thrown. This is the button the office will actually use — a morning's
 * proposals are usually all fine.
 */
export async function confirmManyAction(
  _prev: ProposalState,
  formData: FormData,
): Promise<ProposalState> {
  const ids = formData.getAll('jobIds').map(String).filter(Boolean);
  if (ids.length === 0) return { error: 'ยังไม่ได้เลือกข้อเสนอ' };

  try {
    const actor = await assertPermission('quota.override');

    let confirmed = 0;
    const failed: string[] = [];

    for (const jobId of ids) {
      try {
        const result = await confirmPmProposal({ jobId, actorId: actor.id });
        confirmed += 1;
        await notifyJobSafely({
          jobId,
          templateCode: 'PM_DUE',
          vars: { scheduledDate: formatThaiDate(result.scheduledDate, 'long') },
        });
      } catch (e) {
        failed.push(isCapacityRefusal(e) ? 'วันเต็ม' : 'ผิดพลาด');
      }
    }

    if (confirmed === 0) return { error: `ยืนยันไม่สำเร็จทั้ง ${ids.length} รายการ` };
    return done({
      ok:
        failed.length === 0
          ? `ยืนยัน ${confirmed} รายการแล้ว · แจ้งลูกค้าแล้ว`
          : `ยืนยัน ${confirmed} รายการ · อีก ${failed.length} ไม่สำเร็จ (${failed.join(', ')})`,
    });
  } catch (e) {
    return friendly(e);
  }
}
