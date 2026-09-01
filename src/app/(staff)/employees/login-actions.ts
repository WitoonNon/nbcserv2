'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission, ForbiddenError } from '@/lib/auth/guard';
import {
  createLoginForEmployee,
  resetEmployeePassword,
  unlinkLogin,
  EmployeeLoginError,
  ASSIGNABLE_ROLES,
  type AssignableRole,
} from '@/modules/hr/employee-login.service';

export interface LoginState {
  error?: string;
  /** Shown once and never again — see the note in the service. */
  issued?: { email: string; password: string };
  removed?: boolean;
}

/**
 * Behind `admin.users`, not `employee.write`.
 *
 * Handing somebody a way into the system is a different act from recording
 * their address, and the roles on offer exclude SUPER_ADMIN — an account
 * created from this screen must never be able to grant itself more than the
 * person creating it intended.
 */
export async function createLoginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const employeeId = String(formData.get('employeeId') ?? '');
  const email = String(formData.get('email') ?? '');
  const role = String(formData.get('role') ?? '') as AssignableRole;

  if (!employeeId) return { error: 'ไม่ได้ระบุพนักงาน' };
  if (!ASSIGNABLE_ROLES.includes(role)) return { error: 'กรุณาเลือกบทบาท' };

  try {
    await assertPermission('admin.users');
    const issued = await createLoginForEmployee({ employeeId, email, role });
    revalidatePath(`/employees/${employeeId}`);
    revalidatePath('/employees');
    return { issued };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof EmployeeLoginError) {
      return { error: e.message };
    }
    console.error('[employee-login] create failed', e);
    return { error: 'สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่' };
  }
}

export async function resetPasswordAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const employeeId = String(formData.get('employeeId') ?? '');
  if (!employeeId) return { error: 'ไม่ได้ระบุพนักงาน' };

  try {
    await assertPermission('admin.users');
    const issued = await resetEmployeePassword(employeeId);
    revalidatePath(`/employees/${employeeId}`);
    return { issued };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof EmployeeLoginError) {
      return { error: e.message };
    }
    console.error('[employee-login] reset failed', e);
    return { error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ' };
  }
}

export async function unlinkLoginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const employeeId = String(formData.get('employeeId') ?? '');
  if (!employeeId) return { error: 'ไม่ได้ระบุพนักงาน' };

  try {
    await assertPermission('admin.users');
    await unlinkLogin(employeeId);
    revalidatePath(`/employees/${employeeId}`);
    revalidatePath('/employees');
    return { removed: true };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof EmployeeLoginError) {
      return { error: e.message };
    }
    console.error('[employee-login] unlink failed', e);
    return { error: 'ยกเลิกบัญชีไม่สำเร็จ' };
  }
}
