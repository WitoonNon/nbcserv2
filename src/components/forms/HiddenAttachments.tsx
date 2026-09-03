'use client';

import { useActionState, useState } from 'react';
import {
  hideAttachmentAction,
  unhideAttachmentAction,
  type AttachmentState,
} from '@/app/(staff)/work-orders/d/[id]/attachment-actions';

/**
 * Hiding and restoring one photograph.
 *
 * The reason box opens first and will not submit empty, for the same reason a
 * refusal needs one: "why is this photo gone" has to have an answer, and the
 * day it gets asked is the day nobody remembers.
 */

function Feedback({ state }: { state: AttachmentState }) {
  if (state.ok) return <p className="text-[12px] text-[var(--color-status-done)]">{state.ok}</p>;
  if (state.error) {
    return <p className="text-[12px] text-[var(--color-status-cancelled)]">{state.error}</p>;
  }
  return null;
}

export function HideAttachment({
  attachmentId,
  workOrderId,
}: {
  attachmentId: string;
  workOrderId: string;
}) {
  const [state, run, pending] = useActionState<AttachmentState, FormData>(hideAttachmentAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) return <Feedback state={state} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] underline text-[var(--color-muted)]"
      >
        ซ่อนรูปนี้
      </button>
    );
  }

  return (
    <form action={run} className="space-y-1.5">
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <label className="block">
        <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
          เหตุผล — เก็บไว้ในบันทึกตรวจสอบ ลบไม่ได้
        </span>
        <input
          name="reason"
          required
          placeholder="เช่น ถ่ายผิดเครื่อง"
          className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="bg-[var(--color-status-cancelled)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังซ่อน…' : 'ยืนยันซ่อน'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] underline text-[var(--color-muted)]"
        >
          ย้อนกลับ
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export interface HiddenRow {
  id: string;
  kindLabel: string;
  hiddenAtLabel: string;
  hiddenReason: string | null;
  hiddenByName: string | null;
  url: string;
}

function Restore({ id, workOrderId }: { id: string; workOrderId: string }) {
  const [state, run, pending] = useActionState<AttachmentState, FormData>(
    unhideAttachmentAction,
    {},
  );
  if (state.ok) return <Feedback state={state} />;

  return (
    <form action={run}>
      <input type="hidden" name="attachmentId" value={id} />
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <button
        disabled={pending}
        className="text-[12px] underline text-[var(--color-brand-blue-600)] disabled:opacity-60"
      >
        {pending ? 'กำลังคืน…' : 'เอากลับมาแสดง'}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * What was hidden, and by whom.
 *
 * Kept on screen rather than gone. A customer holding a printed document with
 * a photograph on it must be able to be told what happened to it — a list
 * that simply omitted them would leave nobody able to answer.
 */
export function HiddenAttachments({
  rows,
  workOrderId,
}: {
  rows: HiddenRow[];
  workOrderId: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="card p-3 space-y-2">
      <h3 className="text-sm font-semibold">รูปที่ถูกซ่อน ({rows.length})</h3>
      <p className="text-[12px] text-[var(--color-muted)]">
        ไฟล์ยังอยู่ในระบบและไม่ได้ถูกลบ · เอกสารที่พิมพ์ไปก่อนหน้านี้ยังมีรูปเหล่านี้อยู่
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start gap-3 border-t border-[var(--color-line)] pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.url}
              alt={row.kindLabel}
              className="size-16 object-cover rounded-[3px] opacity-50 shrink-0"
            />
            <div className="flex-1 min-w-[180px] text-[13px]">
              <p className="font-medium">{row.kindLabel}</p>
              <p className="text-[var(--color-muted)]">
                ซ่อนเมื่อ {row.hiddenAtLabel}
                {row.hiddenByName && ` โดย ${row.hiddenByName}`}
              </p>
              {row.hiddenReason && <p>เหตุผล: {row.hiddenReason}</p>}
              <div className="mt-1">
                <Restore id={row.id} workOrderId={workOrderId} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
