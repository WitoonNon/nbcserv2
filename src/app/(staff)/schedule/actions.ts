'use server';

import { revalidatePath } from 'next/cache';
import type { ServiceCategory } from '@/generated/prisma';
import { setDayCapacity, setDayStatus, QuotaRuleError } from '@/modules/scheduling/schedule.service';
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
    return friendlyError(e);
  }
}

function friendlyError(e: unknown): ScheduleState {
  if (e instanceof ForbiddenError) return { error: e.message };
  if (e instanceof QuotaRuleError) return { error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: msg };
}

function optionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Adjust one day's ceiling — "this Saturday we only have two crews".
 *
 * Deliberately separate from editing the rule: this changes today, the rule
 * changes every matching day from now on, and confusing the two is how a
 * one-off closure quietly becomes permanent policy.
 */
export async function setDayCapacityAction(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const date = String(formData.get('date') ?? '');
  const zoneId = String(formData.get('zoneId') ?? '');
  const category = String(formData.get('category') ?? '') as ServiceCategory;
  const reason = String(formData.get('reason') ?? '').trim();

  if (!date || !zoneId || !category) return { error: 'ข้อมูลไม่ครบ' };
  if (!reason) return { error: 'กรุณาระบุเหตุผล — ระบบจะบันทึกไว้ในประวัติการแก้ไขโควตา' };

  const capacityJobs = optionalInt(formData, 'capacityJobs');
  const capacityUnits = optionalInt(formData, 'capacityUnits');
  const capacityMinutes = optionalInt(formData, 'capacityMinutes');

  if (capacityJobs === null && capacityUnits === null && capacityMinutes === null) {
    return { error: 'ต้องกำหนดอย่างน้อย 1 แกน — ไม่งั้นวันนี้จะรับงานไม่จำกัด' };
  }
  for (const v of [capacityJobs, capacityUnits, capacityMinutes]) {
    if (v !== null && v < 0) return { error: 'ค่าโควตาต้องไม่ติดลบ' };
  }

  try {
    const actor = await assertPermission('quota.override');
    const { nowFull } = await setDayCapacity({
      date: new Date(`${date}T00:00:00Z`),
      zoneId,
      category,
      capacityJobs,
      capacityUnits,
      capacityMinutes,
      reason,
      actorId: actor.id,
    });

    revalidatePath('/schedule');
    revalidatePath('/booking');
    return {
      ok: nowFull
        ? `ปรับโควตาวันที่ ${date} แล้ว — งานที่จองไว้เต็มเพดานใหม่ วันนี้จึงปิดรับเพิ่ม (งานเดิมไม่ถูกยกเลิก)`
        : `ปรับโควตาวันที่ ${date} แล้ว`,
    };
  } catch (e) {
    return friendlyError(e);
  }
}
