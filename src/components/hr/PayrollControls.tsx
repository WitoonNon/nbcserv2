'use client';

import { useActionState, useState } from 'react';
import {
  calculateAction,
  closePeriodAction,
  openPeriodAction,
  type PayrollState,
} from '@/app/(staff)/payroll/actions';

/** Opening the month. */
export function OpenPeriodForm({ suggestedCode }: { suggestedCode: string }) {
  const [state, run, pending] = useActionState<PayrollState, FormData>(openPeriodAction, {});

  return (
    <form action={run} className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
          งวด (ปี พ.ศ. – เดือน)
        </span>
        <input
          name="code"
          defaultValue={suggestedCode}
          pattern="\d{4}-\d{2}"
          required
          className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white w-[130px] tabular-nums"
        />
      </label>
      <button
        disabled={pending}
        className="bg-[var(--color-brand-blue)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? 'กำลังเปิด…' : 'เปิดงวดใหม่'}
      </button>
      {state.error && (
        <p className="w-full text-[12px] text-[var(--color-status-cancelled)]">{state.error}</p>
      )}
      {state.ok && <p className="w-full text-[12px] text-[var(--color-status-done)]">{state.ok}</p>}
    </form>
  );
}

export function CalculateButton({ periodId }: { periodId: string }) {
  const [state, run, pending] = useActionState<PayrollState, FormData>(calculateAction, {});

  return (
    <form action={run} className="inline">
      <input type="hidden" name="periodId" value={periodId} />
      <button
        disabled={pending}
        className="border border-[var(--color-line)] rounded-[3px] px-3 py-1.5 text-sm bg-white disabled:opacity-60"
      >
        {pending ? 'กำลังคำนวณ…' : 'คำนวณใหม่'}
      </button>
      {state.error && (
        <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-1">
          {state.error}
        </span>
      )}
      {state.ok && (
        <span className="block text-[11px] text-[var(--color-status-done)] mt-1">{state.ok}</span>
      )}
    </form>
  );
}

/**
 * Closing the month.
 *
 * Two-step on purpose. Closing is irreversible — the figures lock and payslips
 * are issued from them — so it takes a deliberate second action rather than
 * one click next to "recalculate".
 */
export function ClosePeriodButton({
  periodId,
  blockedCount,
}: {
  periodId: string;
  blockedCount: number;
}) {
  const [state, run, pending] = useActionState<PayrollState, FormData>(closePeriodAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold"
      >
        ปิดงวด
      </button>
    );
  }

  return (
    <form action={run} className="card p-3 space-y-2 bg-[var(--color-brand-orange-50)]">
      <input type="hidden" name="periodId" value={periodId} />
      <p className="text-[13px]">
        <strong>ปิดงวดแล้วแก้ตัวเลขไม่ได้อีก</strong> — ออกสลิปได้จากงวดที่ปิดแล้วเท่านั้น
        ถ้าต้องแก้ภายหลังต้องเปิดงวดใหม่
      </p>

      {blockedCount > 0 && (
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="acceptBlocked" className="mt-1 size-4" />
          <span>
            ยืนยันปิดทั้งที่ยังมี <strong>{blockedCount} คน</strong> คำนวณไม่ได้ —
            คนเหล่านี้จะไม่ได้รับเงินในงวดนี้
          </span>
        </label>
      )}

      <div className="flex gap-2">
        <button
          disabled={pending}
          className="bg-[var(--color-status-cancelled)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังปิด…' : 'ยืนยันปิดงวด'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[12px] underline text-[var(--color-muted)]"
        >
          ยกเลิก
        </button>
      </div>

      {state.error && (
        <p className="text-[12px] text-[var(--color-status-cancelled)]">{state.error}</p>
      )}
    </form>
  );
}
