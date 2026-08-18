'use client';

import { useActionState, useState } from 'react';
import type { CapturePolicy } from '@/modules/platform/capture-policy';
import { saveCaptureAction, type CaptureState } from '@/app/(staff)/settings/capture/actions';

export function CaptureForm({ policy }: { policy: CapturePolicy }) {
  const [state, action, pending] = useActionState<CaptureState, FormData>(saveCaptureAction, {});
  const [location, setLocation] = useState(policy.recordLocation);

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          {state.error}
        </div>
      )}
      {state.ok && <div className="card p-3 bg-green-50 border-green-300 text-sm">{state.ok}</div>}

      <label className="card p-4 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="recordTakenAt"
          defaultChecked={policy.recordTakenAt}
          className="size-4 accent-[var(--color-brand-orange)] mt-1"
        />
        <span>
          <span className="block font-semibold text-sm">บันทึกเวลาที่ถ่ายรูป</span>
          <span className="block text-[13px] text-[var(--color-muted)] mt-0.5">
            ใช้ยืนยันว่ารูปถ่ายในวันที่เข้างานจริง ไม่ใช่รูปเก่าที่นำมาใช้ซ้ำ
            ข้อมูลนี้ไม่ระบุตัวบุคคล
          </span>
        </span>
      </label>

      <label className="card p-4 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="recordLocation"
          checked={location}
          onChange={(e) => setLocation(e.target.checked)}
          className="size-4 accent-[var(--color-brand-orange)] mt-1"
        />
        <span>
          <span className="block font-semibold text-sm">บันทึกพิกัด GPS ของรูป</span>
          <span className="block text-[13px] text-[var(--color-muted)] mt-0.5">
            ใช้ยืนยันว่าช่างไปถึงหน้างานจริง แต่พิกัดของรูปคือ
            <strong> ตำแหน่งบ้านหรือสถานประกอบการของลูกค้า</strong>
          </span>
        </span>
      </label>

      {location && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-[13px]">
          <strong>เปิดแล้วต้องเตรียมเรื่องนี้ด้วย</strong> — พิกัดสถานที่ของลูกค้า
          ถือเป็นข้อมูลส่วนบุคคลตาม PDPA ควรระบุไว้ในนโยบายความเป็นส่วนตัวว่าเก็บอะไร
          เพื่ออะไร และเก็บนานเท่าไร ก่อนเปิดใช้กับลูกค้าจริง
        </div>
      )}

      <div className="flex justify-end">
        <button
          disabled={pending}
          className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
      </div>
    </form>
  );
}
