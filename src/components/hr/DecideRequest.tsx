'use client';

import { useActionState, useState } from 'react';
import {
  decideLeaveAction,
  decideOvertimeAction,
  type DecisionState,
} from '@/app/(staff)/timesheet/request-actions';

/**
 * Approving or refusing one request.
 *
 * Approve is one tap because it is the common answer. Refuse opens a reason
 * box first and will not submit without it — "no" with no reason is not
 * something the person who asked can act on, and it is the answer most likely
 * to be argued about later.
 */
function Decider({
  action,
  requestId,
  extra,
}: {
  action: typeof decideOvertimeAction;
  requestId: string;
  extra?: React.ReactNode;
}) {
  const [state, run, pending] = useActionState<DecisionState, FormData>(action, {});
  const [rejecting, setRejecting] = useState(false);

  if (state.ok) {
    return <p className="text-[12px] text-[var(--color-status-done)]">{state.ok}</p>;
  }

  return (
    <div className="space-y-2">
      {!rejecting ? (
        <form action={run} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="decision" value="approve" />
          {extra}
          <button
            disabled={pending}
            className="bg-[var(--color-status-done)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? 'กำลังบันทึก…' : 'อนุมัติ'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="border border-[var(--color-line)] rounded-[3px] px-3 py-1.5 text-sm bg-white"
          >
            ไม่อนุมัติ
          </button>
        </form>
      ) : (
        <form action={run} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="decision" value="reject" />
          <label className="block flex-1 min-w-[220px]">
            <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
              เหตุผลที่ไม่อนุมัติ — พนักงานจะเห็นข้อความนี้
            </span>
            <input
              name="note"
              required
              placeholder="เช่น งานนี้ไม่ได้อนุมัติล่วงเวลาไว้"
              className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white"
            />
          </label>
          <button
            disabled={pending}
            className="bg-[var(--color-status-cancelled)] text-white rounded-[3px] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? 'กำลังบันทึก…' : 'ยืนยันไม่อนุมัติ'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="text-[12px] underline text-[var(--color-muted)]"
          >
            ย้อนกลับ
          </button>
        </form>
      )}

      {state.error && (
        <p className="text-[12px] text-[var(--color-status-cancelled)]">{state.error}</p>
      )}
    </div>
  );
}

export function DecideOvertime({
  requestId,
  legalMinimum,
}: {
  requestId: string;
  legalMinimum: number;
}) {
  return (
    <Decider
      action={decideOvertimeAction}
      requestId={requestId}
      extra={
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
            อัตรา (ขั้นต่ำ {legalMinimum})
          </span>
          <input
            name="multiplier"
            type="number"
            step="0.1"
            min={legalMinimum}
            defaultValue={legalMinimum}
            className="w-[90px] border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white tabular-nums"
          />
        </label>
      }
    />
  );
}

export function DecideLeave({ requestId }: { requestId: string }) {
  return <Decider action={decideLeaveAction} requestId={requestId} />;
}
