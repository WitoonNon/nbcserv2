'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import { recordWageChange, deleteLatestWageChange, WageError } from '@/modules/hr/wage.service';
import type { EmploymentType } from '@/generated/prisma';

export interface WageFormState {
  error?: string;
  saved?: boolean;
}

/**
 * Behind `employee.sensitive`, not `employee.write`.
 *
 * Correcting a spelling and setting what somebody is paid are different acts.
 * The client's answer was that salary is the owner's alone, and the gate has to
 * sit on this action rather than on the screen — a form posts whatever it likes.
 */
export async function recordWageAction(
  _prev: WageFormState,
  formData: FormData,
): Promise<WageFormState> {
  const employeeId = String(formData.get('employeeId') ?? '');
  if (!employeeId) return { error: 'ไม่ได้ระบุพนักงาน' };

  const raw = String(formData.get('wageRate') ?? '').replace(/,/g, '').trim();
  const wageRate = Number(raw);
  if (!raw || !Number.isFinite(wageRate)) return { error: 'กรุณากรอกค่าแรงเป็นตัวเลข' };

  try {
    const user = await assertPermission('employee.sensitive');
    await recordWageChange(
      {
        employeeId,
        effectiveFrom: String(formData.get('effectiveFrom') ?? ''),
        wageRate,
        employmentType: (String(formData.get('employmentType') ?? 'DAILY') as EmploymentType),
        reason: String(formData.get('reason') ?? '') || null,
      },
      { id: user.id, name: user.name },
    );
    revalidatePath(`/employees/${employeeId}`);
    return { saved: true };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof WageError) return { error: e.message };
    console.error('[wage] record failed', e);
    return { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' };
  }
}

export async function deleteWageAction(
  _prev: WageFormState,
  formData: FormData,
): Promise<WageFormState> {
  const employeeId = String(formData.get('employeeId') ?? '');
  const changeId = String(formData.get('changeId') ?? '');
  if (!employeeId || !changeId) return { error: 'ข้อมูลไม่ครบ' };

  try {
    const user = await assertPermission('employee.sensitive');
    await deleteLatestWageChange(employeeId, changeId, { id: user.id, name: user.name });
    revalidatePath(`/employees/${employeeId}`);
    return { saved: true };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof WageError) return { error: e.message };
    console.error('[wage] delete failed', e);
    return { error: 'ลบไม่สำเร็จ กรุณาลองใหม่' };
  }
}
