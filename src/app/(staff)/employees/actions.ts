'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import {
  createEmployee,
  updateEmployee,
  viewSensitive,
  EmployeeError,
  type EmployeeInput,
  type SensitiveFields,
} from '@/modules/hr/employee.service';
import { setWageFromEmployeeForm } from '@/modules/hr/wage.service';
import { prisma } from '@/lib/db';
import type { EmploymentType, EmployeeStatus } from '@/generated/prisma';

export interface EmployeeFormState {
  error?: string;
  saved?: boolean;
}

function readForm(formData: FormData): EmployeeInput {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  const wage = str('wageRate');

  return {
    employeeCode: str('employeeCode') ?? '',
    titleTh: str('titleTh'),
    firstNameTh: str('firstNameTh') ?? '',
    lastNameTh: str('lastNameTh') ?? '',
    nickname: str('nickname'),
    nationalId: str('nationalId'),
    birthDate: str('birthDate'),
    phone: str('phone'),
    email: str('email'),
    address: str('address'),
    emergencyContactName: str('emergencyContactName'),
    emergencyContactPhone: str('emergencyContactPhone'),
    emergencyContactRel: str('emergencyContactRel'),
    position: str('position') ?? '',
    department: str('department'),
    employmentType: (str('employmentType') ?? 'DAILY') as EmploymentType,
    status: (str('status') ?? 'PROBATION') as EmployeeStatus,
    wageRate: wage === null ? null : Number(wage.replace(/,/g, '')),
    hiredAt: str('hiredAt'),
    probationEndAt: str('probationEndAt'),
    resignedAt: str('resignedAt'),
    bankName: str('bankName'),
    bankAccount: str('bankAccount'),
    note: str('note'),
    userId: str('userId'),
  };
}

/**
 * Writing a personnel record needs `employee.write`, and setting a wage needs
 * `employee.sensitive` on top of it.
 *
 * Without the second check, a role allowed to correct a spelling could also
 * change what somebody is paid — and the form posts every field at once, so
 * the gate has to be on the field rather than on the screen.
 */
export async function saveEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const id = String(formData.get('id') ?? '');
  const input = readForm(formData);
  let newId: string | null = null;

  try {
    const user = await assertPermission('employee.write');

    const touchesPay =
      input.wageRate !== null || input.bankAccount !== null || input.nationalId !== null;
    if (touchesPay && !user.permissions.has('employee.sensitive')) {
      return { error: 'ไม่มีสิทธิ์แก้ไขค่าแรง เลขบัตรประชาชน หรือเลขบัญชี' };
    }

    const actor = { id: user.id, name: user.name };
    if (id) {
      await updateEmployee(id, input, actor);
    } else {
      newId = await createEmployee(input, actor);
    }

    // A wage typed here has to reach the history, not just Employee.wageRate.
    // Payroll reads the history; without this the office fills in ten salaries,
    // sees ten confirmations, and the run still reports every one of them as
    // having no wage on record.
    if (input.wageRate !== null && input.wageRate !== undefined) {
      const employeeId = id || newId!;
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { hiredAt: true },
      });
      await setWageFromEmployeeForm(
        {
          employeeId,
          wageRate: input.wageRate,
          employmentType: input.employmentType,
          hiredAt: employee?.hiredAt ?? null,
        },
        actor,
      );
    }
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof EmployeeError) return { error: e.message };
    console.error('[employees] save failed', e);
    return { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' };
  }

  // redirect() throws to unwind, so it must sit outside the try — inside, the
  // catch above would swallow it and report a save failure on a save that
  // actually worked.
  revalidatePath('/employees');
  if (id) {
    revalidatePath(`/employees/${id}`);
    return { saved: true };
  }
  redirect(`/employees/${newId}`);
}

export interface SensitiveState {
  fields?: SensitiveFields;
  error?: string;
}

/**
 * Reveal the withheld fields.
 *
 * A deliberate action rather than part of the page load, so that opening a
 * colleague's record is not the same event as reading their ID number — and so
 * the audit trail records the second one only when it really happened.
 */
export async function revealSensitiveAction(
  _prev: SensitiveState,
  formData: FormData,
): Promise<SensitiveState> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ไม่ได้ระบุพนักงาน' };

  try {
    const user = await assertPermission('employee.sensitive');
    const fields = await viewSensitive(id, { id: user.id, name: user.name });
    if (!fields) return { error: 'ไม่พบพนักงานที่ระบุ' };
    revalidatePath(`/employees/${id}`);
    return { fields };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    console.error('[employees] reveal failed', e);
    return { error: 'เปิดดูข้อมูลไม่สำเร็จ' };
  }
}
