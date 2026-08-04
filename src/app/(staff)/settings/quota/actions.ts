'use server';

import { revalidatePath } from 'next/cache';
import type { ServiceCategory } from '@/generated/prisma';
import {
  createQuotaRule,
  deactivateQuotaRule,
  updateQuotaRule,
  QuotaRuleError,
  type QuotaRuleInput,
} from '@/modules/scheduling/schedule.service';
import { materialiseQuota, QUOTA_HORIZON_DAYS, dateOnly } from '@/modules/scheduling/quota.service';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface QuotaState {
  error?: string;
  ok?: string;
}

function friendlyError(e: unknown): QuotaState {
  if (e instanceof ForbiddenError) return { error: e.message };
  if (e instanceof QuotaRuleError) return { error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: msg };
}

/** Blank, "-" and whitespace all mean "no ceiling on this axis". */
function optionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Seven checkboxes named day0..day6 collapse into the bitmask the rule stores. */
function readWeekdayMask(formData: FormData): number {
  let mask = 0;
  for (let i = 0; i < 7; i += 1) {
    if (formData.get(`day${i}`) === 'on') mask |= 1 << i;
  }
  return mask;
}

function readRuleInput(formData: FormData): QuotaRuleInput {
  const zoneId = String(formData.get('zoneId') ?? '').trim();
  const effectiveToRaw = String(formData.get('effectiveTo') ?? '').trim();
  const effectiveFromRaw = String(formData.get('effectiveFrom') ?? '').trim();

  return {
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? 'CLEANING_PM') as ServiceCategory,
    // An empty zone means the rule covers every zone — that is what a NULL
    // zoneId means to materialiseQuota(), not "no zone".
    zoneId: zoneId || null,
    weekdayMask: readWeekdayMask(formData),
    maxJobs: optionalInt(formData, 'maxJobs'),
    maxUnits: optionalInt(formData, 'maxUnits'),
    maxTechnicianMinutes: optionalInt(formData, 'maxTechnicianMinutes'),
    effectiveFrom: effectiveFromRaw ? new Date(`${effectiveFromRaw}T00:00:00Z`) : dateOnly(new Date()),
    effectiveTo: effectiveToRaw ? new Date(`${effectiveToRaw}T00:00:00Z`) : null,
    priority: Number(formData.get('priority') ?? 0) || 0,
  };
}

export async function saveQuotaRuleAction(
  _prev: QuotaState,
  formData: FormData,
): Promise<QuotaState> {
  try {
    await assertPermission('admin.config');
    const id = String(formData.get('id') ?? '').trim();
    const input = readRuleInput(formData);

    if (id) {
      await updateQuotaRule(id, input);
    } else {
      await createQuotaRule(input);
    }

    revalidatePath('/settings/quota');
    return {
      ok: id
        ? 'แก้ไขกฎแล้ว — กด "คำนวณปฏิทินใหม่" เพื่อให้มีผลกับปฏิทิน'
        : 'เพิ่มกฎแล้ว — กด "คำนวณปฏิทินใหม่" เพื่อให้มีผลกับปฏิทิน',
    };
  } catch (e) {
    return friendlyError(e);
  }
}

export async function deleteQuotaRuleAction(
  _prev: QuotaState,
  formData: FormData,
): Promise<QuotaState> {
  try {
    await assertPermission('admin.config');
    const id = String(formData.get('id') ?? '').trim();
    if (!id) return { error: 'ไม่พบกฎที่ต้องการยกเลิก' };

    await deactivateQuotaRule(id);
    revalidatePath('/settings/quota');
    return { ok: 'ยกเลิกกฎแล้ว — กด "คำนวณปฏิทินใหม่" เพื่อให้มีผลกับปฏิทิน' };
  } catch (e) {
    return friendlyError(e);
  }
}

/**
 * Rebuild the rolling horizon from the current rules.
 *
 * materialiseQuota() updates capacities in place and never touches the used*
 * counters, so running this on a live calendar cannot lose a booking.
 */
export async function rematerialiseAction(
  _prev: QuotaState,
  _formData: FormData,
): Promise<QuotaState> {
  try {
    await assertPermission('admin.config');

    const from = dateOnly(new Date());
    const to = new Date(from.getTime() + QUOTA_HORIZON_DAYS * 86_400_000);
    const written = await materialiseQuota(from, to);

    revalidatePath('/settings/quota');
    revalidatePath('/schedule');
    revalidatePath('/booking');
    return {
      ok: `คำนวณปฏิทินใหม่แล้ว ${written} ช่อง ครอบคลุม ${QUOTA_HORIZON_DAYS} วันข้างหน้า — งานที่จองไว้แล้วไม่ถูกแตะ`,
    };
  } catch (e) {
    return friendlyError(e);
  }
}
