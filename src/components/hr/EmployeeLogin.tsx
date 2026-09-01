'use client';

import { useActionState, useState } from 'react';
import {
  createLoginAction,
  resetPasswordAction,
  unlinkLoginAction,
  type LoginState,
} from '@/app/(staff)/employees/login-actions';
import { ASSIGNABLE_ROLES } from '@/modules/hr/employee-login.service';

/**
 * The account that lets this person clock in.
 *
 * The clock is behind a login, so without one an employee can be recorded and
 * paid but cannot punch — and there was previously no screen anywhere that
 * could create an account. The office would have entered their eleventh member
 * of staff, printed the sign, and found out at the door.
 *
 * The first password is shown once, on this screen, and is not recoverable
 * afterwards: it is stored only as a hash, and the account is flagged to
 * demand a replacement at first sign-in. So the box below is deliberately
 * loud, and says plainly that closing it loses the password — the alternative
 * is somebody assuming they can look it up later and quietly locking a
 * technician out on the morning it matters.
 */

const ROLE_LABEL: Record<string, string> = {
  TECHNICIAN: 'ช่างเทคนิค',
  ADMIN: 'ธุรการ / คอลเซ็นเตอร์',
  SUPERVISOR: 'หัวหน้างาน',
  DISPATCHER: 'ผู้จ่ายงาน',
  ACCOUNTING: 'บัญชี',
};

const input =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

function Issued({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 rounded-[3px] border-2 border-[var(--color-brand-orange)] bg-[var(--color-brand-orange-50)] p-4">
      <p className="text-sm font-semibold text-[var(--color-brand-orange-600)]">
        บันทึกรหัสนี้ไว้เดี๋ยวนี้ — ปิดหน้านี้แล้วดูย้อนหลังไม่ได้
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-[12px] text-[var(--color-muted)]">อีเมลสำหรับเข้าระบบ</dt>
          <dd className="font-mono text-sm break-all">{email}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-[var(--color-muted)]">รหัสผ่านครั้งแรก</dt>
          <dd className="font-mono text-lg tracking-wider">{password}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(`${email} / ${password}`).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
          className="border border-[var(--color-brand-orange)] rounded-[3px] px-4 py-1.5 text-sm"
        >
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
        <span className="text-[12px] text-[var(--color-muted)]">
          ระบบจะบังคับให้เจ้าตัวตั้งรหัสใหม่ตอนเข้าระบบครั้งแรก
        </span>
      </div>
    </div>
  );
}

export function EmployeeLogin({
  employeeId,
  loginEmail,
  suggestedEmail,
}: {
  employeeId: string;
  /** The account already attached, if any. */
  loginEmail: string | null;
  /** The address on the personnel record, offered as a default. */
  suggestedEmail: string | null;
}) {
  const [createState, create, creating] = useActionState<LoginState, FormData>(
    createLoginAction,
    {},
  );
  const [resetState, reset, resetting] = useActionState<LoginState, FormData>(
    resetPasswordAction,
    {},
  );
  const [unlinkState, unlink, unlinking] = useActionState<LoginState, FormData>(
    unlinkLoginAction,
    {},
  );
  const [confirmRemove, setConfirmRemove] = useState(false);

  const issued = createState.issued ?? resetState.issued;
  const error = createState.error ?? resetState.error ?? unlinkState.error;
  const hasLogin = Boolean(loginEmail) && !unlinkState.removed;

  return (
    <div className="card p-4">
      <h2 className="text-base mb-1">บัญชีเข้าระบบ</h2>
      <p className="text-[12px] text-[var(--color-muted)] mb-3">
        ต้องมีบัญชีจึงจะสแกน QR ลงเวลาและยื่นขอโอที/ลาได้
      </p>

      {error && (
        <p className="text-[13px] text-[var(--color-status-cancelled)] mb-3">{error}</p>
      )}

      {!hasLogin ? (
        <form action={create} className="grid gap-3 sm:grid-cols-3 items-end">
          <input type="hidden" name="employeeId" value={employeeId} />
          <label className="block sm:col-span-2">
            <span className="block text-[12px] text-[var(--color-muted)] mb-1">
              อีเมลสำหรับเข้าระบบ <span className="text-[var(--color-brand-orange)]">*</span>
            </span>
            <input
              name="email"
              type="email"
              required
              defaultValue={suggestedEmail ?? ''}
              placeholder="somchai@nbcgroup.co.th"
              className={input}
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-[var(--color-muted)] mb-1">บทบาท</span>
            <select name="role" defaultValue="TECHNICIAN" className={input}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            <button
              disabled={creating}
              className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {creating ? 'กำลังสร้าง…' : 'สร้างบัญชีเข้าระบบ'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-mono">{loginEmail}</p>
            <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
              สแกน QR ลงเวลาได้แล้ว
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <form action={reset}>
              <input type="hidden" name="employeeId" value={employeeId} />
              <button
                disabled={resetting}
                className="border border-[var(--color-line)] rounded-[3px] px-4 py-1.5 text-sm hover:border-[var(--color-brand-blue)] disabled:opacity-60"
              >
                {resetting ? 'กำลังตั้ง…' : 'ตั้งรหัสผ่านใหม่'}
              </button>
            </form>

            {confirmRemove ? (
              <form action={unlink} className="flex items-center gap-2">
                <input type="hidden" name="employeeId" value={employeeId} />
                <span className="text-[12px] text-[var(--color-status-cancelled)]">
                  ยกเลิกบัญชีนี้?
                </span>
                <button
                  disabled={unlinking}
                  className="border border-[var(--color-status-cancelled)] text-[var(--color-status-cancelled)] rounded-[3px] px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  ยืนยัน
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-[12px] text-[var(--color-muted)]"
                >
                  ไม่
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-[12px] text-[var(--color-muted)] underline"
              >
                ยกเลิกบัญชี
              </button>
            )}
          </div>
        </div>
      )}

      {issued && <Issued email={issued.email} password={issued.password} />}

      {unlinkState.removed && !issued && (
        <p className="text-[13px] text-[var(--color-muted)] mt-2">
          ยกเลิกบัญชีแล้ว — ประวัติการทำงานที่ผูกกับบัญชีนี้ยังอยู่ครบ
        </p>
      )}
    </div>
  );
}
