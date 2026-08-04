'use server';

import { revalidatePath } from 'next/cache';
import type { ServiceCategory } from '@/generated/prisma';
import { setDayStatus } from '@/modules/scheduling/schedule.service';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface ScheduleState {
  error?: string;
  ok?: string;
}

export async function toggleDayAction(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const date = String(formData.get('date') ?? '');
  const zoneId = String(formData.get('zoneId') ?? '');
  const category = String(formData.get('category') ?? '') as ServiceCategory;
  const status = String(formData.get('status') ?? '') as 'OPEN' | 'MANUALLY_CLOSED';
  const reason = String(formData.get('reason') ?? '').trim();

  if (!date || !zoneId || !category) return { error: 'ข้อมูลไม่ครบ' };
  if (!reason) return { error: 'กรุณาระบุเหตุผล — ระบบจะบันทึกไว้ในประวัติการแก้ไขโควตา' };

  try {
    // Closing a day is a capacity decision with revenue impact — it needs the
    // same permission as overriding a full day, and the actor is recorded.
    const actor = await assertPermission('quota.override');
    const n = await setDayStatus({
      date: new Date(`${date}T00:00:00Z`),
      zoneId,
      category,
      status,
      reason,
      actorId: actor.id,
    });
    revalidatePath('/schedule');
    return { ok: `${status === 'OPEN' ? 'เปิดรับงาน' : 'ปิดรับงาน'}วันที่ ${date} แล้ว (${n} ช่อง)` };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: msg };
  }
}
