'use client';

import { useActionState } from 'react';
import Image from 'next/image';
import { changePasswordAction, type ChangePasswordState } from './actions';

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)] focus:ring-1 focus:ring-[var(--color-brand-blue)]';

export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-surface-alt)]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image src="/brand/nbc-logo.png" alt="NBC Group" width={110} height={65} priority
            className="object-contain" />
        </div>

        <h1 className="text-2xl">ตั้งรหัสผ่านใหม่</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1 mb-5">
          บัญชีนี้ยังใช้รหัสผ่านที่ผู้ดูแลระบบตั้งให้
          กรุณาตั้งรหัสผ่านของคุณเองก่อนเริ่มใช้งาน
        </p>

        {state.error && (
          <div role="alert"
            className="mb-4 rounded-[3px] border border-[var(--color-status-cancelled)]/40 bg-red-50 px-3 py-2 text-sm text-[var(--color-status-cancelled)]">
            {state.error}
          </div>
        )}

        <form action={action} className="space-y-3">
          <label className="block">
            <span className="block text-[13px] mb-1">รหัสผ่านปัจจุบัน</span>
            <input name="currentPassword" type="password" required autoComplete="current-password"
              autoFocus className={inputCls} />
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">รหัสผ่านใหม่</span>
            <input name="newPassword" type="password" required minLength={10}
              autoComplete="new-password" className={inputCls} />
            <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">
              อย่างน้อย 10 ตัวอักษร และต้องไม่ซ้ำกับรหัสผ่านเดิม
            </span>
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">ยืนยันรหัสผ่านใหม่</span>
            <input name="confirmPassword" type="password" required minLength={10}
              autoComplete="new-password" className={inputCls} />
          </label>

          <button type="submit" disabled={pending}
            className="w-full bg-[var(--color-brand-orange)] text-white rounded-[3px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {pending ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>

        <p className="text-xs text-[var(--color-muted)] mt-6 border-t border-[var(--color-line)] pt-4">
          เมื่อเปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบด้วยบัญชีนี้จะถูกออกจากระบบทั้งหมด
        </p>
      </div>
    </div>
  );
}
