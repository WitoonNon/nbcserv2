'use server';

import { revalidatePath } from 'next/cache';
import type { JobStatus } from '@/generated/prisma';
import { advanceFieldJob, FieldWorkError } from '@/modules/jobs/field-work.service';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface FieldState {
  error?: string;
  ok?: string;
}

/**
 * Move a job to its next field status.
 *
 * The coordinates are whatever the phone offered. They are evidence of where a
 * visit started, not a requirement — a basement plant room has no GPS fix, and
 * a technician who is standing in one still has to be able to press the button.
 */
export async function advanceJobAction(
  _prev: FieldState,
  formData: FormData,
): Promise<FieldState> {
  const jobId = String(formData.get('jobId') ?? '');
  const to = String(formData.get('to') ?? '') as JobStatus;
  if (!jobId || !to) return { error: 'ข้อมูลไม่ครบ' };

  const asNumber = (name: string): number | null => {
    const raw = formData.get(name);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  try {
    const actor = await assertPermission('job.read');

    await advanceFieldJob({
      jobId,
      technicianId: actor.technicianId,
      to,
      actorId: actor.id,
      lat: asNumber('lat'),
      lng: asNumber('lng'),
      // Sent by the client so a tap made in a lift and delivered two minutes
      // later is recorded when it happened.
      occurredAt: formData.get('occurredAt')
        ? new Date(String(formData.get('occurredAt')))
        : undefined,
    });

    revalidatePath('/t/today');
    return { ok: 'บันทึกแล้ว' };
  } catch (e) {
    if (e instanceof FieldWorkError || e instanceof ForbiddenError) return { error: e.message };
    const message = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: message };
  }
}
