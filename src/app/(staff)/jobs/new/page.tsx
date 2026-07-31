'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { intakeAction, type IntakeFormState } from '../actions';
import { CATEGORY_LABEL, JOB_SIZE_LABEL } from '@/lib/labels';

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

export default function NewJobPage() {
  const [state, formAction, pending] = useActionState<IntakeFormState, FormData>(intakeAction, {});

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/jobs" className="text-sm text-[var(--color-brand-blue-600)]">← งานทั้งหมด</Link>
        <h1 className="text-2xl">รับแจ้งงานใหม่</h1>
        <p className="text-sm text-[var(--color-muted)]">
          สำหรับธุรการรับแจ้งทางโทรศัพท์ — ระบบจะค้นลูกค้าเดิมจากเบอร์โทรให้อัตโนมัติ
          งานจะเข้าคิวสถานะ &quot;รับเรื่องแล้ว&quot; รอผู้จ่ายงานนัดวันตามโควตา
        </p>
      </div>

      {state.error && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="card p-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="createdVia" value="PHONE" />

        <label className="block">
          <span className="block text-[13px] mb-1">ชื่อลูกค้า <span className="text-red-600">*</span></span>
          <input name="customerName" required className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[13px] mb-1">เบอร์โทร <span className="text-red-600">*</span></span>
          <input name="phone" required className={inputCls} placeholder="08x-xxx-xxxx" />
        </label>

        <label className="block sm:col-span-2">
          <span className="block text-[13px] mb-1">ที่อยู่หน้างาน</span>
          <textarea name="address" rows={2} className={inputCls} />
        </label>

        <label className="block">
          <span className="block text-[13px] mb-1">ประเภทงาน</span>
          <select name="category" className={inputCls} defaultValue="INSPECTION_REPAIR">
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[13px] mb-1">ขนาดงาน</span>
          <select name="jobSize" className={inputCls} defaultValue="S">
            {Object.entries(JOB_SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="block text-[13px] mb-1">จำนวนเครื่อง</span>
          <input type="number" name="unitCount" min={1} defaultValue={1} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[13px] mb-1">วันที่ลูกค้าสะดวก</span>
          <input type="date" name="requestedDate" className={inputCls} />
        </label>

        <label className="block sm:col-span-2">
          <span className="block text-[13px] mb-1">อาการ / รายละเอียดที่แจ้ง</span>
          <textarea name="problemDescription" rows={3} className={inputCls}
            placeholder="เช่น แอร์ไม่เย็น มีน้ำหยดจากเครื่องใน ห้องนอนชั้น 2" />
        </label>

        <p className="text-xs text-[var(--color-muted)] sm:col-span-2">
          งานประเภทตรวจเช็ค/แจ้งซ่อม ระบบจะบันทึกค่าเข้าตรวจเช็คตามนโยบายอัตโนมัติ
          และยกเว้นให้ลูกค้าที่มีสัญญารายปี
        </p>

        <div className="sm:col-span-2 flex justify-end gap-2">
          <Link href="/jobs" className="border border-[var(--color-line)] rounded-[3px] px-4 py-2 text-sm">
            ยกเลิก
          </Link>
          <button type="submit" disabled={pending}
            className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60">
            {pending ? 'กำลังบันทึก…' : 'บันทึกรับแจ้ง'}
          </button>
        </div>
      </form>
    </div>
  );
}
