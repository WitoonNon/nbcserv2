'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import {
  calculatePeriod,
  closePeriod,
  openPeriod,
  PayrollError,
} from '@/modules/hr/payroll.service';

export interface PayrollState {
  error?: string;
  ok?: string;
}

function friendly(e: unknown): PayrollState {
  if (e instanceof PayrollError || e instanceof ForbiddenError) return { error: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: message };
}

/** Buddhist-era month code (2569-09) to the calendar month it covers. */
function monthRange(code: string): { from: Date; to: Date } {
  const [beYear, month] = code.split('-').map(Number);
  const year = beYear! - 543;
  return {
    from: new Date(Date.UTC(year, month! - 1, 1)),
    // Day 0 of the next month is the last day of this one — no leap-year
    // table, and February is right without special-casing.
    to: new Date(Date.UTC(year, month!, 0)),
  };
}

export async function openPeriodAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const code = String(formData.get('code') ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(code)) {
    return { error: 'รหัสงวดต้องอยู่ในรูปแบบ ปี(พ.ศ.)-เดือน เช่น 2569-09' };
  }

  try {
    await assertPermission('payroll.run');
    const { from, to } = monthRange(code);
    await openPeriod({ code, from, to });

    revalidatePath('/payroll');
    return { ok: `เปิดงวด ${code} แล้ว` };
  } catch (e) {
    return friendly(e);
  }
}

export async function calculateAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const periodId = String(formData.get('periodId') ?? '');
  if (!periodId) return { error: 'ไม่พบงวด' };

  try {
    await assertPermission('payroll.run');
    const summary = await calculatePeriod(periodId);

    revalidatePath('/payroll');
    const blocked = summary.blocked.length;
    return {
      ok: blocked
        ? `คำนวณแล้ว ${summary.calculated} คน · ยังคำนวณไม่ได้ ${blocked} คน`
        : `คำนวณแล้ว ${summary.calculated} คน`,
    };
  } catch (e) {
    return friendly(e);
  }
}

/**
 * Close, and lock.
 *
 * `acceptBlocked` is an explicit tick on the form rather than a default,
 * because closing a period that silently excludes somebody is how a person
 * goes a month without pay.
 */
export async function closePeriodAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const periodId = String(formData.get('periodId') ?? '');
  if (!periodId) return { error: 'ไม่พบงวด' };

  try {
    const actor = await assertPermission('payroll.run');
    await closePeriod({
      periodId,
      closedById: actor.id,
      acceptBlocked: formData.get('acceptBlocked') === 'on',
    });

    revalidatePath('/payroll');
    return { ok: 'ปิดงวดแล้ว — ตัวเลขล็อกและออกสลิปได้' };
  } catch (e) {
    return friendly(e);
  }
}
