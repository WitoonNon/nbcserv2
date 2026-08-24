'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { setJobAssets, AssetLinkError } from '@/modules/assets/asset.service';

export interface JobAssetState {
  error?: string;
  saved?: boolean;
}

/**
 * Record which machines a job is about.
 *
 * Behind `job.update` rather than a dispatch permission: this is a statement
 * about what the work covers, and it ends up in the register that decides
 * whether a unit gets repaired again.
 */
export async function setJobAssetsAction(
  _prev: JobAssetState,
  formData: FormData,
): Promise<JobAssetState> {
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) return { error: 'ไม่ได้ระบุงาน' };

  try {
    await assertPermission('job.update');
    await setJobAssets({ jobId, assetIds: formData.getAll('assetId').map(String) });
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath('/assets');
    return { saved: true };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof AssetLinkError) return { error: e.message };
    return { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' };
  }
}
