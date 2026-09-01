'use client';

import { useActionState, useState } from 'react';
import { deleteEmployeeAction, type DeleteState } from '@/app/(staff)/employees/actions';

/**
 * Removing a record that should never have existed.
 *
 * There is no general delete here and there should not be: a personnel record
 * is referenced by payroll that has been run and punches that were counted, and
 * "why was this person paid" has to stay answerable. Somebody who worked here
 * is resigned, which is what the status field is for.
 *
 * But a duplicate, a test row, or a name typed against the wrong person has
 * none of that behind it, and the register only means something if it matches
 * the company. QA found this precisely: four test employees that could be
 * hidden and never removed, with hand-written SQL as the only way out.
 *
 * The button appears only when the record is genuinely free of references, and
 * the reason is shown when it is not — an explanation beats a disabled control
 * that says nothing about why.
 */
export function DeleteEmployee({
  employeeId,
  employeeName,
  canDelete,
  reasonTh,
  blockers,
}: {
  employeeId: string;
  employeeName: string;
  canDelete: boolean;
  reasonTh: string | null;
  blockers: { label: string; count: number }[];
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(
    deleteEmployeeAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  if (!canDelete) {
    return (
      <div className="card p-4">
        <h2 className="text-base mb-1">ลบพนักงาน</h2>
        <p className="text-[13px] text-[var(--color-muted)]">{reasonTh}</p>
        {blockers.length > 0 && (
          <ul className="mt-2 text-[12px] text-[var(--color-muted)] space-y-0.5">
            {blockers.map((b) => (
              <li key={b.label}>
                · {b.label} {b.count} รายการ
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h2 className="text-base mb-1">ลบพนักงาน</h2>
      <p className="text-[13px] text-[var(--color-muted)] mb-3">
        คนนี้ยังไม่มีการลงเวลา คำขอ หรือรายการเงินเดือน จึงลบถาวรได้ —
        ใช้กับรายการที่กรอกผิดหรือซ้ำเท่านั้น ถ้าเป็นพนักงานที่ลาออก
        ให้เปลี่ยนสถานะเป็น &quot;ลาออกแล้ว&quot; แทน เพื่อเก็บประวัติไว้
      </p>

      {state.error && (
        <p className="text-[13px] text-[var(--color-status-cancelled)] mb-2">{state.error}</p>
      )}

      {confirming ? (
        <form action={action} className="flex items-center gap-3 flex-wrap">
          <input type="hidden" name="id" value={employeeId} />
          <span className="text-sm">
            ลบ <b>{employeeName}</b> ถาวร?
          </span>
          <button
            disabled={pending}
            className="border border-[var(--color-status-cancelled)] text-[var(--color-status-cancelled)] rounded-[3px] px-4 py-1.5 text-sm disabled:opacity-60"
          >
            {pending ? 'กำลังลบ…' : 'ยืนยันลบ'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[12px] text-[var(--color-muted)]"
          >
            ยกเลิก
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border border-[var(--color-line)] rounded-[3px] px-4 py-1.5 text-sm text-[var(--color-status-cancelled)] hover:border-[var(--color-status-cancelled)]"
        >
          ลบพนักงานคนนี้
        </button>
      )}
    </div>
  );
}
