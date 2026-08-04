'use server';

import { redirect } from 'next/navigation';
import type { CreatedVia, JobSize, ServiceCategory } from '@/generated/prisma';
import { createJobFromIntake } from '@/modules/jobs/job.service';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';

export interface IntakeFormState {
  error?: string;
}

export async function intakeAction(
  _prev: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const customerName = String(formData.get('customerName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  if (!customerName || !phone) {
    return { error: 'กรุณากรอกชื่อลูกค้าและเบอร์โทร' };
  }

  const requestedDateRaw = String(formData.get('requestedDate') ?? '');

  let jobId: string;
  try {
    const actor = await assertPermission('job.create');
    const result = await createJobFromIntake({
      createdById: actor.id,
      customerName,
      phone,
      address: String(formData.get('address') ?? '').trim() || undefined,
      category: String(formData.get('category') ?? 'INSPECTION_REPAIR') as ServiceCategory,
      jobSize: String(formData.get('jobSize') ?? 'S') as JobSize,
      unitCount: Number(formData.get('unitCount') ?? 1) || 1,
      requestedDate: requestedDateRaw ? new Date(requestedDateRaw) : null,
      problemDescription: String(formData.get('problemDescription') ?? '').trim() || undefined,
      createdVia: String(formData.get('createdVia') ?? 'PHONE') as CreatedVia,
    });
    jobId = result.jobId;
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    const message = e instanceof Error ? e.message : String(e);

    if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(message)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ฟอร์มนี้จะบันทึกได้ทันทีเมื่อตั้งค่า DATABASE_URL และรัน migrate + seed' };
    }
    // Raw Prisma text is meaningless to an office user; say what to do instead.
    if (/Unique constraint failed/i.test(message)) {
      return {
        error:
          'บันทึกไม่สำเร็จ เนื่องจากรหัสเอกสารซ้ำกับที่มีอยู่แล้ว กรุณาลองอีกครั้ง หากยังไม่ได้แจ้งผู้ดูแลระบบ',
      };
    }
    return { error: `บันทึกไม่สำเร็จ: ${message}` };
  }

  redirect(`/jobs/${jobId}`);
}
