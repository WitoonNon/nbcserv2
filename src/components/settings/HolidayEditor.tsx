'use client';

import { useActionState } from 'react';
import {
  addHolidayAction,
  removeHolidayAction,
  type HolidayState,
} from '@/app/(staff)/settings/holidays/actions';

export interface HolidayRow {
  id: string;
  date: string;
  label: string;
  nameTh: string;
  isPast: boolean;
}

export function AddHoliday({ defaultYear }: { defaultYear: number }) {
  const [state, run, pending] = useActionState<HolidayState, FormData>(addHolidayAction, {});

  return (
    <form action={run} className="card p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">วันที่</span>
          <input
            name="date"
            type="date"
            required
            min={`${defaultYear}-01-01`}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white tabular-nums"
          />
        </label>
        <label className="block flex-1 min-w-[200px]">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ชื่อวันหยุด</span>
          <input
            name="nameTh"
            required
            placeholder="เช่น วันวิสาขบูชา"
            className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white"
          />
        </label>
        <button
          disabled={pending}
          className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก…' : 'เพิ่ม'}
        </button>
      </div>
      {state.ok && <p className="text-[12px] text-[var(--color-status-done)]">{state.ok}</p>}
      {state.error && (
        <p className="text-[12px] text-[var(--color-status-cancelled)]">{state.error}</p>
      )}
    </form>
  );
}

/**
 * Removing one.
 *
 * No confirmation step: a holiday is re-addable in five seconds and the row
 * carries no history. Guarding it would be ceremony rather than safety.
 */
export function RemoveHoliday({ id }: { id: string }) {
  const [state, run, pending] = useActionState<HolidayState, FormData>(removeHolidayAction, {});

  if (state.ok) return <span className="text-[12px] text-[var(--color-muted)]">ลบแล้ว</span>;

  return (
    <form action={run}>
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        className="text-[12px] underline text-[var(--color-muted)] disabled:opacity-60"
      >
        {pending ? 'กำลังลบ…' : 'ลบ'}
      </button>
      {state.error && (
        <span className="text-[12px] text-[var(--color-status-cancelled)] ml-2">{state.error}</span>
      )}
    </form>
  );
}
