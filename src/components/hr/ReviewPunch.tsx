'use client';

import { useActionState, useState } from 'react';
import { reviewEntryAction, type ReviewState } from '@/app/(staff)/timesheet/actions';

/**
 * Clearing one flagged punch.
 *
 * The reason box is not optional and is not pre-filled. A supervisor who has
 * to type "ไปส่งของก่อนเข้าออฟฟิศ" has looked at the punch; a dropdown of
 * stock reasons would be clicked through without reading, and the note is the
 * whole value of the review.
 */
export function ReviewPunch({ entryId }: { entryId: string }) {
  const [state, run, pending] = useActionState<ReviewState, FormData>(reviewEntryAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return <span className="text-[11px] text-[var(--color-status-done)]">{state.ok}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] underline text-[var(--color-brand-blue-600)]"
      >
        ตรวจสอบ
      </button>
    );
  }

  return (
    <form action={run} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      <label className="block flex-1 min-w-[200px]">
        <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
          เหตุผลที่อนุมัติ — จะถูกเก็บไว้ถาวร
        </span>
        <input
          name="note"
          required
          placeholder="เช่น ไปส่งของก่อนเข้าออฟฟิศ"
          className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white"
        />
      </label>
      <button
        disabled={pending}
        className="bg-[var(--color-status-done)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? 'กำลังบันทึก…' : 'อนุมัติ'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[12px] text-[var(--color-muted)] underline"
      >
        ยกเลิก
      </button>
      {state.error && (
        <p className="w-full text-[11px] text-[var(--color-status-cancelled)]">{state.error}</p>
      )}
    </form>
  );
}
