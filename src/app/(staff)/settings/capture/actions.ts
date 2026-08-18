'use server';

import { revalidatePath } from 'next/cache';
import { setCapturePolicy } from '@/modules/platform/capture-policy';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface CaptureState {
  error?: string;
  ok?: string;
}

export async function saveCaptureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  try {
    await assertPermission('admin.config');
    const recordLocation = formData.get('recordLocation') === 'on';

    await setCapturePolicy({
      recordTakenAt: formData.get('recordTakenAt') === 'on',
      recordLocation,
    });

    revalidatePath('/settings/capture');
    revalidatePath('/settings/assumptions');
    return {
      ok: recordLocation
        ? 'บันทึกแล้ว — ระบบจะเก็บพิกัดของรูปถ่ายตั้งแต่นี้ไป (รูปเก่าไม่เปลี่ยน)'
        : 'บันทึกแล้ว — ระบบจะไม่เก็บพิกัดของรูปถ่ายอีก (รูปเก่าที่เก็บไว้แล้วยังอยู่)',
    };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(msg)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    }
    return { error: msg };
  }
}
