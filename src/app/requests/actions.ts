'use server';

import { revalidatePath } from 'next/cache';
import type { LeaveType, OvertimeKind } from '@/generated/prisma';
import {
  cancelOvertime,
  OvertimeError,
  requestOvertime,
} from '@/modules/hr/overtime.service';
import { cancelLeave, LeaveError, requestLeave } from '@/modules/hr/leave.service';
import { SELECTABLE_OVERTIME_KINDS } from '@/modules/hr/payroll-rules';
import { currentEmployee } from '@/modules/hr/self-service';

/**
 * What an employee can do about their own overtime and leave.
 *
 * Every action here resolves the employee from the session and passes THAT id
 * to the service. No action reads an employee id from the form, so there is
 * nothing in a submitted request that says whose record is being touched —
 * which is the whole reason these are separate from the office's actions in
 * (staff)/timesheet/request-actions.ts rather than shared with a role check.
 *
 * The office's screen decides; this one only asks and withdraws.
 */

export interface RequestState {
  error?: string;
  ok?: string;
}

function friendly(e: unknown): RequestState {
  if (e instanceof OvertimeError || e instanceof LeaveError) return { error: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/closed the connection|ECONNREFUSED|P1001/i.test(message)) {
    return { error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
  }
  return { error: message };
}

/**
 * The gate every action below goes through.
 *
 * A resigned employee is refused: the register keeps their record so they can
 * still be paid what they are owed, but the account should not be raising new
 * requests against a job they have left.
 */
async function actingEmployee() {
  const employee = await currentEmployee();
  if (!employee) {
    throw new OvertimeError('บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน — แจ้งฝ่ายบุคคล', 403);
  }
  if (!employee.isActive) {
    throw new OvertimeError('บัญชีพนักงานนี้ไม่ได้อยู่ในสถานะทำงาน', 403);
  }
  return employee;
}

// Mirrors the form. Kept in step with SELECTABLE_OVERTIME_KINDS rather than
// listing the enum, because a select element is a suggestion — the value that
// arrives here comes from the network, not from the dropdown.
const OVERTIME_KINDS: OvertimeKind[] = SELECTABLE_OVERTIME_KINDS;

const LEAVE_TYPES: LeaveType[] = ['SICK', 'PERSONAL', 'ANNUAL', 'UNPAID'];

export async function submitOvertimeAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  try {
    const employee = await actingEmployee();

    const kind = String(formData.get('kind') ?? '');
    // Validated against the enum rather than cast: the value arrives from a
    // <select> a determined person can edit, and Prisma would reject it far
    // less helpfully than this does.
    if (!OVERTIME_KINDS.includes(kind as OvertimeKind)) {
      return { error: 'ประเภทโอทีไม่ถูกต้อง' };
    }

    const rawHours = String(formData.get('hours') ?? '').trim();
    const hours = Number(rawHours);
    if (!rawHours || !Number.isFinite(hours)) return { error: 'กรอกจำนวนชั่วโมงเป็นตัวเลข' };

    await requestOvertime({
      employeeId: employee.id,
      workDate: String(formData.get('workDate') ?? ''),
      kind: kind as OvertimeKind,
      hours,
      reason: String(formData.get('reason') ?? ''),
    });

    revalidatePath('/requests');
    // The office's queue counts pending requests, so it is stale the moment
    // this succeeds.
    revalidatePath('/timesheet');
    return { ok: 'ส่งคำขอโอทีแล้ว รอหัวหน้าพิจารณา' };
  } catch (e) {
    return friendly(e);
  }
}

export async function submitLeaveAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  try {
    const employee = await actingEmployee();

    const type = String(formData.get('type') ?? '');
    if (!LEAVE_TYPES.includes(type as LeaveType)) return { error: 'ประเภทการลาไม่ถูกต้อง' };

    const fromDate = String(formData.get('fromDate') ?? '');
    // One-day leave is the common case and asking for the same date twice is
    // a way to get it wrong, so an empty end date means the day it starts.
    const toDate = String(formData.get('toDate') ?? '').trim() || fromDate;

    const created = await requestLeave({
      employeeId: employee.id,
      type: type as LeaveType,
      fromDate,
      toDate,
      reason: String(formData.get('reason') ?? ''),
    });

    revalidatePath('/requests');
    revalidatePath('/timesheet');
    return {
      ok: `ส่งคำขอลา ${Number(created.totalDays)} วันแล้ว รอหัวหน้าพิจารณา`,
    };
  } catch (e) {
    return friendly(e);
  }
}

export async function cancelOvertimeAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const requestId = String(formData.get('requestId') ?? '');
  if (!requestId) return { error: 'ไม่พบคำขอ' };

  try {
    const employee = await actingEmployee();
    await cancelOvertime({ requestId, employeeId: employee.id });
    revalidatePath('/requests');
    revalidatePath('/timesheet');
    return { ok: 'ยกเลิกคำขอแล้ว' };
  } catch (e) {
    return friendly(e);
  }
}

export async function cancelLeaveAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const requestId = String(formData.get('requestId') ?? '');
  if (!requestId) return { error: 'ไม่พบคำขอ' };

  try {
    const employee = await actingEmployee();
    await cancelLeave({ requestId, employeeId: employee.id });
    revalidatePath('/requests');
    revalidatePath('/timesheet');
    return { ok: 'ยกเลิกคำขอแล้ว' };
  } catch (e) {
    return friendly(e);
  }
}
