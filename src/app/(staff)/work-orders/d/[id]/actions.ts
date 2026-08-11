'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { FormCode } from '@/generated/prisma';
import { headers } from 'next/headers';
import type { SignerRole } from '@/generated/prisma';
import {
  approveWorkOrder,
  createWorkOrder,
  returnWorkOrder,
  saveWorkOrderDraft,
  signWorkOrder,
  submitWorkOrder,
  WorkOrderError,
} from '@/modules/workorders/workorder.service';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface WorkOrderState {
  error?: string;
  ok?: string;
  /** Field key -> message, so the renderer can mark the offending inputs. */
  fieldErrors?: Record<string, string>;
  savedAt?: string;
}

function friendlyError(e: unknown): WorkOrderState {
  if (e instanceof ForbiddenError) return { error: e.message };
  if (e instanceof WorkOrderError) return { error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: msg };
}

/** The payload arrives as JSON because it is a nested, schema-driven object. */
function readPayload(formData: FormData): Record<string, unknown> {
  const raw = String(formData.get('payload') ?? '{}');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Open (or resume) a work order for a job, then go straight to it.
 *
 * Called from the job page. Resuming rather than always creating is what stops
 * a double tap on a slow connection from burning a document number.
 */
export async function openWorkOrderAction(formData: FormData): Promise<void> {
  const jobId = String(formData.get('jobId') ?? '');
  const code = String(formData.get('code') ?? '') as FormCode;
  if (!jobId || !code) return;

  const actor = await assertPermission('workorder.read');
  const { workOrderId } = await createWorkOrder({ jobId, code, actorId: actor.id });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/work-orders/d/${workOrderId}`);
}

export async function saveDraftAction(
  _prev: WorkOrderState,
  formData: FormData,
): Promise<WorkOrderState> {
  const workOrderId = String(formData.get('workOrderId') ?? '');
  if (!workOrderId) return { error: 'ไม่พบใบงาน' };

  try {
    const actor = await assertPermission('workorder.read');
    const { updatedAt } = await saveWorkOrderDraft({
      workOrderId,
      payload: readPayload(formData),
      actorId: actor.id,
    });

    revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'บันทึกร่างแล้ว', savedAt: updatedAt };
  } catch (e) {
    return friendlyError(e);
  }
}

export async function submitAction(
  _prev: WorkOrderState,
  formData: FormData,
): Promise<WorkOrderState> {
  const workOrderId = String(formData.get('workOrderId') ?? '');
  if (!workOrderId) return { error: 'ไม่พบใบงาน' };

  try {
    const actor = await assertPermission('workorder.submit');
    const result = await submitWorkOrder({
      workOrderId,
      payload: readPayload(formData),
      actorId: actor.id,
    });

    if (!result.ok) {
      // The payload was still saved — only the status transition was refused.
      return {
        error: 'ยังกรอกไม่ครบ — ดูช่องที่ทำเครื่องหมายไว้ (ข้อมูลที่กรอกถูกบันทึกไว้แล้ว)',
        fieldErrors: result.fieldErrors,
      };
    }

    revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'ส่งใบงานให้หัวหน้างานตรวจแล้ว' };
  } catch (e) {
    return friendlyError(e);
  }
}

/**
 * Record a signature.
 *
 * A server action rather than an API route because the payload has to be
 * persisted and hashed together — the signature means nothing unless the
 * content it was taken over is the content that was stored.
 */
export async function signAction(
  _prev: WorkOrderState,
  formData: FormData,
): Promise<WorkOrderState> {
  const workOrderId = String(formData.get('workOrderId') ?? '');
  if (!workOrderId) return { error: 'ไม่พบใบงาน' };

  try {
    const actor = await assertPermission('workorder.read');
    const requestHeaders = await headers();

    await signWorkOrder({
      workOrderId,
      signerRole: String(formData.get('signerRole') ?? '') as SignerRole,
      signerName: String(formData.get('signerName') ?? ''),
      signerPosition: String(formData.get('signerPosition') ?? '') || null,
      storageKey: String(formData.get('storageKey') ?? ''),
      payload: readPayload(formData),
      actorId: actor.id,
      // Recorded because a dispute about a signature is a dispute about where
      // and on what it was given.
      deviceInfo: requestHeaders.get('user-agent'),
      ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'บันทึกลายเซ็นแล้ว' };
  } catch (e) {
    return friendlyError(e);
  }
}

export async function approveAction(
  _prev: WorkOrderState,
  formData: FormData,
): Promise<WorkOrderState> {
  const workOrderId = String(formData.get('workOrderId') ?? '');
  if (!workOrderId) return { error: 'ไม่พบใบงาน' };

  try {
    const actor = await assertPermission('workorder.approve');
    await approveWorkOrder({ workOrderId, actorId: actor.id });

    revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'อนุมัติใบงานแล้ว' };
  } catch (e) {
    return friendlyError(e);
  }
}

export async function returnAction(
  _prev: WorkOrderState,
  formData: FormData,
): Promise<WorkOrderState> {
  const workOrderId = String(formData.get('workOrderId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!workOrderId) return { error: 'ไม่พบใบงาน' };

  try {
    const actor = await assertPermission('workorder.approve');
    await returnWorkOrder({ workOrderId, reason, actorId: actor.id });

    revalidatePath(`/work-orders/d/${workOrderId}`);
    return { ok: 'ตีกลับใบงานแล้ว — ช่างจะเห็นเหตุผลและแก้ไขได้' };
  } catch (e) {
    return friendlyError(e);
  }
}
