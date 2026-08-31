'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { reviewEntry, TimeClockError } from '@/modules/hr/timeclock.service';

export interface ReviewState {
  error?: string;
  ok?: string;
}

/**
 * Clear a flagged punch.
 *
 * The note is required by the service, not just by the form: a flag waved away
 * with no reason is the same as no flag at all when somebody asks months later
 * why a punch four kilometres from the office was accepted.
 */
export async function reviewEntryAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const entryId = String(formData.get('entryId') ?? '');
  const note = String(formData.get('note') ?? '');
  if (!entryId) return { error: 'ไม่พบรายการ' };

  try {
    const actor = await assertPermission('admin.config');
    await reviewEntry({ entryId, reviewerId: actor.id, note });

    revalidatePath('/timesheet');
    return { ok: 'อนุมัติแล้ว' };
  } catch (e) {
    if (e instanceof TimeClockError || e instanceof ForbiddenError) return { error: e.message };
    const message = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: message };
  }
}
