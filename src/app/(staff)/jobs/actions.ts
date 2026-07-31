'use server';

import { redirect } from 'next/navigation';
import type { CreatedVia, JobSize, ServiceCategory } from '@/generated/prisma';
import { createJobFromIntake } from '@/modules/jobs/job.service';

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
    const result = await createJobFromIntake({
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
    const message = e instanceof Error ? e.message : String(e);
    // The common Phase-0 case: no database yet. Say so plainly.
    if (/closed the connection|ECONNREFUSED|does not exist|P1001/i.test(message)) {
      return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ฟอร์มนี้จะบันทึกได้ทันทีเมื่อตั้งค่า DATABASE_URL และรัน migrate + seed' };
    }
    return { error: `บันทึกไม่สำเร็จ: ${message}` };
  }

  redirect(`/jobs/${jobId}`);
}
