'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { updateConfigValue, ConfigError } from '@/modules/platform/config.service';

export interface ConfigFormState {
  key?: string;
  error?: string;
  saved?: boolean;
  unchanged?: boolean;
}

/**
 * Behind `admin.config`, the same permission that opens the screen.
 *
 * These rows decide money and access — the inspection fee, the paid leave
 * allowance, the radius that says whether somebody was at work — so the write
 * is gated on the server rather than by hiding a button.
 */
export async function updateConfigAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  const key = String(formData.get('key') ?? '');
  const raw = String(formData.get('value') ?? '');
  if (!key) return { error: 'ไม่ได้ระบุค่าที่จะแก้' };

  try {
    const user = await assertPermission('admin.config');
    const result = await updateConfigValue({ key, raw, actorId: user.id });
    revalidatePath('/settings/assumptions');
    return { key, saved: !result.unchanged, unchanged: result.unchanged };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof ConfigError) {
      return { key, error: e.message };
    }
    console.error('[config] update failed', e);
    return { key, error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' };
  }
}
