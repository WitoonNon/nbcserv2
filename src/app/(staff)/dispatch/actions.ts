'use server';

import { revalidatePath } from 'next/cache';
import { assignJob, SkillGateError, unassignJob } from '@/modules/dispatch/dispatch.service';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface DispatchState {
  error?: string;
  /** Set when the only thing blocking the assignment is a missing certification. */
  confirmSkillOverride?: { jobId: string; crewId: string; missing: string[] };
}

function friendly(e: unknown): string {
  if (e instanceof ForbiddenError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
    return 'ยังเชื่อมต่อฐานข้อมูลไม่ได้ — จ่ายงานได้ทันทีเมื่อตั้งค่า DATABASE_URL แล้วรัน migrate + seed';
  }
  return msg;
}

export async function assignAction(_prev: DispatchState, formData: FormData): Promise<DispatchState> {
  const jobId = String(formData.get('jobId') ?? '');
  const crewId = String(formData.get('crewId') ?? '');
  const force = formData.get('force') === '1';
  if (!jobId || !crewId) return { error: 'กรุณาเลือกงานและทีมช่าง' };

  try {
    const actor = await assertPermission('dispatch.assign');
    await assignJob({ jobId, crewId, force, actorId: actor.id });
  } catch (e) {
    if (e instanceof SkillGateError) {
      return { confirmSkillOverride: { jobId, crewId, missing: e.missing } };
    }
    return { error: friendly(e) };
  }

  revalidatePath('/dispatch');
  return {};
}

export async function unassignAction(_prev: DispatchState, formData: FormData): Promise<DispatchState> {
  const jobId = String(formData.get('jobId') ?? '');
  try {
    const actor = await assertPermission('dispatch.assign');
    await unassignJob(jobId, actor.id);
  } catch (e) {
    return { error: friendly(e) };
  }
  revalidatePath('/dispatch');
  return {};
}
