'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';

/**
 * Entering the holidays nobody can compute.
 *
 * The fixed-date ones are seeded. These are the lunar dates — มาฆบูชา,
 * วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา — which move every year and are published
 * by the government rather than derived. Guessing one closes the business on
 * a working day, or opens it on a day nobody turns up, and neither failure
 * announces itself.
 */

export interface HolidayState {
  error?: string;
  ok?: string;
}

function friendly(e: unknown): HolidayState {
  if (e instanceof ForbiddenError) return { error: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/Unique constraint|P2002/i.test(message)) {
    return { error: 'มีวันหยุดของวันนี้อยู่แล้ว' };
  }
  if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: message };
}

/** 'YYYY-MM-DD' as a plain calendar date — Holiday.date is @db.Date. */
function dateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export async function addHolidayAction(
  _prev: HolidayState,
  formData: FormData,
): Promise<HolidayState> {
  const date = dateOnly(String(formData.get('date') ?? ''));
  const nameTh = String(formData.get('nameTh') ?? '').trim();

  if (!date) return { error: 'รูปแบบวันที่ไม่ถูกต้อง' };
  if (!nameTh) return { error: 'ต้องระบุชื่อวันหยุด' };

  try {
    await assertPermission('admin.config');
    await prisma.holiday.create({ data: { date, nameTh } });

    // The quota calendar is materialised from rules plus holidays, so a
    // holiday added today only takes effect on buckets written after it. Said
    // in the message rather than left to be discovered.
    revalidatePath('/settings/holidays');
    revalidatePath('/settings/system');
    return {
      ok: `เพิ่ม ${nameTh} แล้ว — วันที่สร้างปฏิทินโควตาไปแล้วต้องรัน materialise ใหม่จึงจะปิดรับงาน`,
    };
  } catch (e) {
    return friendly(e);
  }
}

export async function removeHolidayAction(
  _prev: HolidayState,
  formData: FormData,
): Promise<HolidayState> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ไม่พบวันหยุด' };

  try {
    await assertPermission('admin.config');
    await prisma.holiday.delete({ where: { id } });
    revalidatePath('/settings/holidays');
    revalidatePath('/settings/system');
    return { ok: 'ลบแล้ว' };
  } catch (e) {
    return friendly(e);
  }
}
