'use client';

import { useActionState, useState } from 'react';
import {
  confirmManyAction,
  confirmProposalAction,
  dismissProposalAction,
  type ProposalState,
} from '@/app/(staff)/schedule/pm/actions';

/**
 * The office answering a morning's PM proposals.
 *
 * Built around the common case, which is "these are all fine": everything is
 * ticked on arrival and one button books the lot. Refusing is the deliberate
 * act — it needs a reason, because the machine is still due tomorrow and the
 * next run would propose the same visit again.
 */

export interface ProposalRow {
  jobId: string;
  jobNo: string;
  dateLabel: string;
  customerName: string;
  siteName: string;
  zoneName: string | null;
  units: number;
  minutes: number;
  assetCount: number;
  assetSummary: string;
}

function Feedback({ state }: { state: ProposalState }) {
  if (state.ok) {
    return <p className="text-[13px] text-[var(--color-status-done)]">{state.ok}</p>;
  }
  if (state.error) {
    return <p className="text-[13px] text-[var(--color-status-cancelled)]">{state.error}</p>;
  }
  return null;
}

function DismissOne({ jobId }: { jobId: string }) {
  const [state, run, pending] = useActionState<ProposalState, FormData>(dismissProposalAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) return <p className="text-[12px] text-[var(--color-muted)]">{state.ok}</p>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] underline text-[var(--color-muted)]"
      >
        ปัดทิ้ง
      </button>
    );
  }

  return (
    <form action={run} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="flex-1 min-w-[200px]">
        <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
          เหตุผล — เก็บไว้ในประวัติงาน
        </span>
        <input
          name="reason"
          required
          placeholder="เช่น ลูกค้าเลื่อนไปไตรมาสหน้า"
          className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white"
        />
      </label>
      <button
        disabled={pending}
        className="bg-[var(--color-status-cancelled)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? 'กำลังบันทึก…' : 'ยืนยันปัดทิ้ง'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[12px] underline text-[var(--color-muted)]"
      >
        ย้อนกลับ
      </button>
      <Feedback state={state} />
    </form>
  );
}

function ConfirmOne({ jobId }: { jobId: string }) {
  const [state, run, pending] = useActionState<ProposalState, FormData>(confirmProposalAction, {});

  if (state.ok) return <p className="text-[12px] text-[var(--color-status-done)]">{state.ok}</p>;

  return (
    <div className="space-y-1">
      <form action={run}>
        <input type="hidden" name="jobId" value={jobId} />
        <button
          disabled={pending}
          className="bg-[var(--color-status-done)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'กำลังจอง…' : 'ยืนยันนัด'}
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

export function PmProposals({ rows }: { rows: ProposalRow[] }) {
  const [state, run, pending] = useActionState<ProposalState, FormData>(confirmManyAction, {});
  // Ticked on arrival: the office confirms far more of these than it refuses,
  // and starting empty would make the common case the most work.
  const [picked, setPicked] = useState<Set<string>>(new Set(rows.map((r) => r.jobId)));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <form action={run} className="card p-3 flex flex-wrap items-center gap-3">
        {[...picked].map((id) => (
          <input key={id} type="hidden" name="jobIds" value={id} />
        ))}
        <button
          disabled={pending || picked.size === 0}
          className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'กำลังจอง…' : `ยืนยันที่เลือก (${picked.size})`}
        </button>
        <button
          type="button"
          onClick={() =>
            setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.jobId)))
          }
          className="text-[13px] underline text-[var(--color-muted)]"
        >
          {picked.size === rows.length ? 'ไม่เลือกเลย' : 'เลือกทั้งหมด'}
        </button>
        {/* Said here rather than after the fact: confirming is what books the
            slot and what sends the customer a message. */}
        <span className="text-[12px] text-[var(--color-muted)]">
          ยืนยันแล้วจะกินโควตาของวันนั้น และส่งข้อความแจ้งลูกค้าทันที
        </span>
        <Feedback state={state} />
      </form>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.jobId} className="card p-3 space-y-2">
            <div className="flex flex-wrap items-start gap-3">
              <input
                type="checkbox"
                checked={picked.has(row.jobId)}
                onChange={() => toggle(row.jobId)}
                aria-label={`เลือก ${row.jobNo}`}
                className="mt-1 size-4 shrink-0"
              />
              <div className="flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{row.customerName}</span>
                  <span className="text-sm tabular-nums">{row.dateLabel}</span>
                </div>
                <p className="text-[13px] text-[var(--color-muted)]">
                  {row.siteName}
                  {row.zoneName && ` · ${row.zoneName}`} · {row.jobNo}
                </p>
                <p className="text-[13px]">
                  {row.assetCount} เครื่อง · {row.units} ยูนิต ·{' '}
                  <span className="tabular-nums">{Math.round(row.minutes / 60)}</span> ชม.
                </p>
                <p className="text-[12px] text-[var(--color-muted)]">{row.assetSummary}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pl-7">
              <ConfirmOne jobId={row.jobId} />
              <DismissOne jobId={row.jobId} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
