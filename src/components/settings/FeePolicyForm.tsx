'use client';

import { useActionState, useState } from 'react';
import { saveApprovalPolicyAction, saveFeePolicyAction, type FeeState } from '@/app/(staff)/settings/fees/actions';

export interface FeePolicyView {
  id: string;
  amount: number;
  waiveForContractCustomer: boolean;
  creditOnProceed: boolean;
  creditMode: 'FULL' | 'PARTIAL' | 'CAPPED';
  creditValue: number | null;
  minJobValueForCredit: number | null;
}

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

export function FeePolicyForm({
  policy,
  technicianMaxAmount,
}: {
  policy: FeePolicyView | null;
  technicianMaxAmount: number | null;
}) {
  const [state, action, pending] = useActionState<FeeState, FormData>(saveFeePolicyAction, {});
  const [approvalState, approvalAction, approvalPending] = useActionState<FeeState, FormData>(
    saveApprovalPolicyAction,
    {},
  );
  const [creditMode, setCreditMode] = useState(policy?.creditMode ?? 'FULL');

  return (
    <div className="space-y-4">
      {(state.error ?? approvalState.error) && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] text-sm">
          {state.error ?? approvalState.error}
        </div>
      )}
      {(state.ok ?? approvalState.ok) && (
        <div className="card p-3 bg-green-50 border-green-300 text-sm">{state.ok ?? approvalState.ok}</div>
      )}

      <form action={action} className="card p-4 space-y-3">
        <input type="hidden" name="id" value={policy?.id ?? ''} />
        <h2 className="text-base">ค่าเข้าตรวจเช็คหน้างาน</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[13px] mb-1">
              จำนวนเงิน (บาท) <span className="assumption-badge ml-1">ข้อ B1</span>
            </span>
            <input type="number" name="amount" min={0} step={10} required
              defaultValue={policy?.amount ?? 500} className={inputCls} />
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">
              วิธีหักคืนเมื่อลูกค้าตกลงซ่อม <span className="assumption-badge ml-1">ข้อ B3</span>
            </span>
            <select name="creditMode" value={creditMode}
              onChange={(e) => setCreditMode(e.target.value as typeof creditMode)}
              className={inputCls}>
              <option value="FULL">หักคืนเต็มจำนวน</option>
              <option value="PARTIAL">หักคืนเป็นเปอร์เซ็นต์</option>
              <option value="CAPPED">หักคืนไม่เกินจำนวนที่กำหนด</option>
            </select>
          </label>

          {creditMode !== 'FULL' && (
            <label className="block">
              <span className="block text-[13px] mb-1">
                {creditMode === 'PARTIAL' ? 'เปอร์เซ็นต์ที่หักคืน (%)' : 'หักคืนไม่เกิน (บาท)'}
              </span>
              <input type="number" name="creditValue" min={0} step={creditMode === 'PARTIAL' ? 1 : 10}
                defaultValue={policy?.creditValue ?? ''} className={inputCls} />
            </label>
          )}

          <label className="block">
            <span className="block text-[13px] mb-1">
              มูลค่างานขั้นต่ำก่อนได้ส่วนลด (บาท) <span className="assumption-badge ml-1">ข้อ B4</span>
            </span>
            <input type="number" name="minJobValueForCredit" min={0} step={100}
              placeholder="เว้นว่าง = ไม่กำหนด"
              defaultValue={policy?.minJobValueForCredit ?? ''} className={inputCls} />
            <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">
              ป้องกันการหักคืน ฿500 ออกจากงานมูลค่า ฿600
            </span>
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="waiveForContractCustomer"
            defaultChecked={policy?.waiveForContractCustomer ?? true}
            className="size-4 accent-[var(--color-brand-orange)] mt-0.5" />
          <span>
            ยกเว้นค่าตรวจเช็คทั้งหมดสำหรับลูกค้าในสัญญา
            <span className="assumption-badge ml-1">ข้อ B5</span>
            <span className="block text-[11px] text-[var(--color-muted)]">
              ตรงกับที่เว็บไซต์บริษัทประกาศว่า &quot;ตรวจเช็คฟรีสำหรับลูกค้าในสัญญา&quot; —
              ระบบจะไม่บันทึกรายการค่าใช้จ่ายเลย ไม่ใช่บันทึกแล้วหักทีหลัง
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="creditOnProceed"
            defaultChecked={policy?.creditOnProceed ?? true}
            className="size-4 accent-[var(--color-brand-orange)] mt-0.5" />
          <span>หักคืนค่าตรวจเช็คเป็นส่วนลดเมื่อลูกค้าตกลงซ่อม</span>
        </label>

        <div className="flex justify-end">
          <button disabled={pending}
            className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60">
            {pending ? 'กำลังบันทึก…' : 'บันทึกนโยบาย'}
          </button>
        </div>

        <p className="text-[11px] text-[var(--color-muted)] border-t border-[var(--color-line)] pt-2">
          การบันทึกจะสร้างนโยบาย<strong>เวอร์ชันใหม่</strong> และปิดของเดิมไว้เป็นประวัติ
          งานเก่าที่คิดเงินไปแล้วยังอ้างอิงนโยบายที่ใช้ตอนนั้น จึงอธิบายย้อนหลังได้เสมอ
        </p>
      </form>

      <form action={approvalAction} className="card p-4 space-y-3">
        <h2 className="text-base">วงเงินอนุมัติใบเสนอราคาหน้างาน</h2>
        <label className="block max-w-xs">
          <span className="block text-[13px] mb-1">
            หัวหน้าทีมช่างอนุมัติเองได้ไม่เกิน (บาท) <span className="assumption-badge ml-1">ข้อ F7</span>
          </span>
          <input type="number" name="maxAmountForTechnician" min={0} step={100}
            defaultValue={technicianMaxAmount ?? 2000} className={inputCls} />
          <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">
            เกินวงเงินนี้ต้องให้หัวหน้างานอนุมัติ
          </span>
        </label>
        <div className="flex justify-end">
          <button disabled={approvalPending}
            className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60">
            {approvalPending ? 'กำลังบันทึก…' : 'บันทึกวงเงิน'}
          </button>
        </div>
      </form>
    </div>
  );
}
