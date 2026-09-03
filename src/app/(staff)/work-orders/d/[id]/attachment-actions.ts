'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { hideAttachment, MediaError, unhideAttachment } from '@/modules/media/attachment.service';

/**
 * Hiding a photograph the customer has already signed for — Phase 3.6.
 *
 * Behind `workorder.approve` rather than `workorder.read`: this changes what a
 * document shows, and the client asked for it as an admin capability, not an
 * everyday one.
 *
 * ## What this does NOT do
 *
 * It does not remove the file, and it does not alter the signed payload. A
 * document printed before the photo was hidden still contains it, and that is
 * the point — somebody holding that paper has to be able to find out what
 * happened rather than be told the photo never existed.
 */

export interface AttachmentState {
  error?: string;
  ok?: string;
}

function friendly(e: unknown): AttachmentState {
  if (e instanceof MediaError || e instanceof ForbiddenError) return { error: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: message };
}

export async function hideAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const attachmentId = String(formData.get('attachmentId') ?? '');
  const workOrderId = String(formData.get('workOrderId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!attachmentId) return { error: 'ไม่พบไฟล์แนบ' };

  try {
    const actor = await assertPermission('workorder.approve');
    await hideAttachment({ attachmentId, actor: { id: actor.id, name: actor.name }, reason });

    if (workOrderId) revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'ซ่อนแล้ว — ไฟล์ยังอยู่และตรวจสอบย้อนหลังได้' };
  } catch (e) {
    return friendly(e);
  }
}

export async function unhideAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const attachmentId = String(formData.get('attachmentId') ?? '');
  const workOrderId = String(formData.get('workOrderId') ?? '');
  if (!attachmentId) return { error: 'ไม่พบไฟล์แนบ' };

  try {
    const actor = await assertPermission('workorder.approve');
    await unhideAttachment({ attachmentId, actor: { id: actor.id, name: actor.name } });

    if (workOrderId) revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'เอากลับมาแสดงแล้ว' };
  } catch (e) {
    return friendly(e);
  }
}
