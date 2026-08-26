'use client';

import { useActionState } from 'react';
import { revealSensitiveAction, type SensitiveState } from '@/app/(staff)/employees/actions';

/**
 * The withheld fields, behind a button.
 *
 * Deliberately a click and not part of the page.
 *
 * Opening a colleague's record to check their phone number is an ordinary act.
 * Reading their national ID is not, and the two should not be the same event —
 * if the numbers rendered with the page, the audit trail would say every
 * visitor read them and would therefore tell nobody anything. One button makes
 * the log mean what it says.
 *
 * Nothing is cached and nothing is prefetched: the values arrive only in the
 * response to this submit.
 */
export function SensitiveReveal({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState<SensitiveState, FormData>(
    revealSensitiveAction,
    {},
  );

  const f = state.fields;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base">ข้อมูลอ่อนไหว</h2>
        {!f && (
          <form action={action}>
            <input type="hidden" name="id" value={employeeId} />
            <button
              disabled={pending}
              className="border border-[var(--color-line)] rounded-[3px] px-4 py-1.5 text-sm hover:border-[var(--color-brand-blue)] disabled:opacity-60"
            >
              {pending ? 'กำลังเปิด…' : 'เปิดดูข้อมูล'}
            </button>
          </form>
        )}
      </div>

      {!f && !state.error && (
        <p className="text-[12px] text-[var(--color-muted)]">
          เลขบัตรประชาชน · เลขบัญชีธนาคาร · ค่าแรง —
          ระบบจะบันทึกชื่อผู้เปิดดูและเวลาไว้ในประวัติการเข้าถึงด้านล่าง
        </p>
      )}

      {state.error && (
        <p className="text-[13px] text-[var(--color-status-cancelled)]">{state.error}</p>
      )}

      {f && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3 mt-2">
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">เลขบัตรประชาชน</dt>
              <dd className="text-sm font-mono">
                {f.nationalId ?? <span className="text-[var(--color-muted)] font-sans">ไม่ได้บันทึกไว้</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">เลขบัญชีธนาคาร</dt>
              <dd className="text-sm font-mono">
                {f.bankAccount ?? <span className="text-[var(--color-muted)] font-sans">ไม่ได้บันทึกไว้</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">ค่าแรง</dt>
              <dd className="text-sm">
                {f.wageRate === null ? (
                  <span className="text-[var(--color-muted)]">ยังไม่ได้ตั้งค่า</span>
                ) : (
                  `${f.wageRate.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`
                )}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            บันทึกการเปิดดูครั้งนี้ไว้แล้ว · ปิดหน้านี้แล้วต้องกดเปิดใหม่
          </p>
        </>
      )}
    </div>
  );
}
