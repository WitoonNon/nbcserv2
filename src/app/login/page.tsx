'use client';

import { useActionState } from 'react';
import { use } from 'react';
import Image from 'next/image';
import { loginAction, type LoginState } from './actions';

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)] focus:ring-1 focus:ring-[var(--color-brand-blue)]';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = use(searchParams);
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel — carries the logo on the gradient it was designed for. */}
      <div className="brand-gradient hidden lg:flex flex-col justify-between p-10 text-white">
        <Image src="/brand/nbc-logo.png" alt="NBC Group" width={150} height={84} priority
          className="object-contain drop-shadow-lg" />
        <div>
          <h1 className="text-white text-3xl leading-snug">
            ระบบบริหารงานซ่อม
            <br />และบริการ
          </h1>
          <p className="text-white/75 text-sm mt-3 max-w-sm">
            จองคิว จ่ายงานช่าง ออกใบงาน และติดตามสถานะ สำหรับทีมงาน
            บริษัท เอ็นบีซี กรุ๊ป จำกัด
          </p>
        </div>
        <p className="text-white/60 text-xs">
          105/26 หมู่ 2 ตำบลละหาร อำเภอบางบัวทอง จังหวัดนนทบุรี 11110
          <br />
          Call Center 02-000-7332 ต่อ 1-3 · LINE @nbcservice
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6 flex justify-center">
            <Image src="/brand/nbc-logo.png" alt="NBC Group" width={110} height={62} priority
              className="object-contain" />
          </div>

          <h2 className="text-2xl">เข้าสู่ระบบ</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1 mb-5">
            สำหรับพนักงานและช่างเทคนิค
          </p>

          {state.error && (
            <div
              role="alert"
              className="mb-4 rounded-[3px] border border-[var(--color-status-cancelled)]/40 bg-red-50 px-3 py-2 text-sm text-[var(--color-status-cancelled)]"
            >
              {state.error}
            </div>
          )}

          <form action={action} className="space-y-3">
            <input type="hidden" name="next" value={next ?? ''} />

            <label className="block">
              <span className="block text-[13px] mb-1">อีเมล</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                className={inputCls}
                placeholder="name@nbcgroup.co.th"
              />
            </label>

            <label className="block">
              <span className="block text-[13px] mb-1">รหัสผ่าน</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className={inputCls}
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-[var(--color-brand-orange)] text-white rounded-[3px] py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <p className="text-xs text-[var(--color-muted)] mt-6 border-t border-[var(--color-line)] pt-4">
            ลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </div>
      </div>
    </div>
  );
}
