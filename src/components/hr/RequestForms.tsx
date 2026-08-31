'use client';

import { useActionState, useState } from 'react';
import type { EmploymentType, LeaveType, OvertimeKind } from '@/generated/prisma';
import {
  cancelLeaveAction,
  cancelOvertimeAction,
  submitLeaveAction,
  submitOvertimeAction,
  type RequestState,
} from '@/app/requests/actions';
import {
  LEAVE_LABEL_TH,
  leaveDaysBetween,
  splitLeave,
  type LeavePolicy,
} from '@/modules/hr/leave-rules';
import { LEGAL_MINIMUM_MULTIPLIER, OVERTIME_LABEL_TH } from '@/modules/hr/payroll-rules';

/**
 * The employee's side of overtime and leave.
 *
 * Built for a phone held in one hand — most of the people filing these are
 * technicians standing in a plant room, not at a desk. Inputs are full width
 * and at least 44px tall, and there is never more than one form on screen.
 *
 * The rule modules are imported directly rather than re-implemented: the
 * unpaid-days warning below runs the same `splitLeave` the approval runs, so
 * the number somebody sees before they commit cannot drift from the number
 * they are held to afterwards.
 */

const FIELD =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2.5 text-base bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue-600)]';
const LABEL = 'block text-[13px] text-[var(--color-muted)] mb-1';
const SUBMIT =
  'w-full bg-[var(--color-brand-blue-600)] text-white rounded-[3px] py-3 text-base font-semibold ' +
  'disabled:opacity-60 active:opacity-80';

function Feedback({ state }: { state: RequestState }) {
  if (state.ok) {
    return (
      <p className="text-sm text-[var(--color-status-done)] bg-[var(--color-status-done)]/10 rounded-[3px] px-3 py-2">
        {state.ok}
      </p>
    );
  }
  if (state.error) {
    return (
      <p className="text-sm text-[var(--color-status-cancelled)] bg-[var(--color-status-cancelled)]/10 rounded-[3px] px-3 py-2">
        {state.error}
      </p>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */

export function OvertimeRequestForm({ today }: { today: string }) {
  const [state, run, pending] = useActionState<RequestState, FormData>(submitOvertimeAction, {});
  const [kind, setKind] = useState<OvertimeKind>('WORKDAY_OT');

  return (
    <form action={run} className="space-y-3">
      <div>
        <label className={LABEL} htmlFor="ot-date">
          วันที่ทำโอที
        </label>
        {/* Tomorrow is the ceiling the service enforces: a shift already
            agreed can be filed ahead, next month is a mistake. */}
        <input
          id="ot-date"
          name="workDate"
          type="date"
          required
          defaultValue={today}
          className={`${FIELD} tabular-nums`}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="ot-kind">
          ประเภท
        </label>
        <select
          id="ot-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as OvertimeKind)}
          className={FIELD}
        >
          {(Object.keys(OVERTIME_LABEL_TH) as OvertimeKind[]).map((k) => (
            <option key={k} value={k}>
              {OVERTIME_LABEL_TH[k]}
            </option>
          ))}
        </select>
        <p className="text-[12px] text-[var(--color-muted)] mt-1">
          อัตราขั้นต่ำตามกฎหมาย {LEGAL_MINIMUM_MULTIPLIER[kind]} เท่า — หัวหน้าเป็นคนกำหนดอัตราจริงตอนอนุมัติ
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor="ot-hours">
          จำนวนชั่วโมง
        </label>
        <input
          id="ot-hours"
          name="hours"
          type="number"
          step="0.5"
          min="0.5"
          max="16"
          required
          inputMode="decimal"
          placeholder="เช่น 3"
          className={`${FIELD} tabular-nums`}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="ot-reason">
          เหตุผล
        </label>
        <textarea
          id="ot-reason"
          name="reason"
          required
          rows={2}
          placeholder="เช่น ซ่อมเครื่องที่โรงแรม ยังไม่เสร็จตามเวลา"
          className={FIELD}
        />
        {/* Required by the service, and worth saying why: this is the only
            thing the approver has to go on. */}
        <p className="text-[12px] text-[var(--color-muted)] mt-1">
          หัวหน้าเห็นเฉพาะข้อความนี้ตอนพิจารณา เขียนให้พอเข้าใจว่าทำอะไร
        </p>
      </div>

      <button disabled={pending} className={SUBMIT}>
        {pending ? 'กำลังส่ง…' : 'ส่งคำขอโอที'}
      </button>

      <Feedback state={state} />
    </form>
  );
}

/* -------------------------------------------------------------------------- */

export interface BalanceProp {
  type: LeaveType;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
}

export function LeaveRequestForm({
  today,
  policy,
  employmentType,
  balances,
}: {
  today: string;
  policy: LeavePolicy;
  employmentType: EmploymentType;
  balances: BalanceProp[];
}) {
  const [state, run, pending] = useActionState<RequestState, FormData>(submitLeaveAction, {});
  const [type, setType] = useState<LeaveType>('SICK');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const used = balances.find((b) => b.type === type)?.usedDays ?? 0;

  // Parsed as UTC midnight to match how the service reads a 'YYYY-MM-DD' —
  // new Date('2026-08-25') in Bangkok is 07:00 local, and going through the
  // local constructor here would shift the count by a day near midnight.
  const days = (() => {
    const a = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00Z`) : null;
    const b = /^\d{4}-\d{2}-\d{2}$/.test(to || from) ? new Date(`${to || from}T00:00:00Z`) : null;
    return a && b ? leaveDaysBetween(a, b) : 0;
  })();

  const preview =
    days > 0
      ? splitLeave({ policy, type, employmentType, paidDaysUsed: used, requestedDays: days })
      : null;

  return (
    <form action={run} className="space-y-3">
      <div>
        <label className={LABEL} htmlFor="lv-type">
          ประเภทการลา
        </label>
        <select
          id="lv-type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
          className={FIELD}
        >
          {(Object.keys(LEAVE_LABEL_TH) as LeaveType[]).map((t) => (
            <option key={t} value={t}>
              {LEAVE_LABEL_TH[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="lv-from">
            ตั้งแต่วันที่
          </label>
          <input
            id="lv-from"
            name="fromDate"
            type="date"
            required
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              // A one-day leave is the common case, and two date pickers is
              // two chances to get it wrong. The end follows the start until
              // somebody deliberately moves it.
              if (!to || to < e.target.value) setTo(e.target.value);
            }}
            className={`${FIELD} tabular-nums`}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="lv-to">
            ถึงวันที่
          </label>
          <input
            id="lv-to"
            name="toDate"
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${FIELD} tabular-nums`}
          />
        </div>
      </div>

      {/* Shown before they commit, not after they are told. The split is
          recalculated at approval — somebody else's request may take the last
          paid day first — so this says "ประมาณการ" rather than promising. */}
      {preview && (
        <div
          className={`rounded-[3px] px-3 py-2 text-[13px] ${
            preview.partlyUnpaid
              ? 'bg-[var(--color-brand-orange-50)] border border-[var(--color-brand-orange)]/40'
              : 'bg-[var(--color-surface-alt)]'
          }`}
        >
          <span className="font-semibold tabular-nums">รวม {days} วัน</span>
          {type === 'UNPAID' ? (
            <span> · ไม่รับค่าจ้างทั้งหมด</span>
          ) : preview.partlyUnpaid ? (
            <span>
              {' '}
              · ประมาณการ: ได้ค่าจ้าง{' '}
              <span className="tabular-nums">{preview.paidDays}</span> วัน ·{' '}
              <strong className="text-[var(--color-brand-orange)]">
                ไม่ได้ค่าจ้าง <span className="tabular-nums">{preview.unpaidDays}</span> วัน
              </strong>
              {preview.entitlementDays === 0 && ' (สิทธิ์ลาประเภทนี้ของคุณคือ 0 วัน)'}
            </span>
          ) : (
            <span> · ประมาณการ: ได้ค่าจ้างทั้งหมด</span>
          )}
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            ยอดจริงคิดตอนอนุมัติ ถ้ามีคนขอก่อนและใช้สิทธิ์ที่เหลือไป ตัวเลขนี้อาจเปลี่ยน
          </p>
        </div>
      )}

      <div>
        <label className={LABEL} htmlFor="lv-reason">
          เหตุผล
        </label>
        <textarea
          id="lv-reason"
          name="reason"
          required
          rows={2}
          placeholder="เช่น ไข้หวัด มีใบรับรองแพทย์"
          className={FIELD}
        />
      </div>

      <button disabled={pending} className={SUBMIT}>
        {pending ? 'กำลังส่ง…' : 'ส่งคำขอลา'}
      </button>

      <Feedback state={state} />
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Withdraw a request that nobody has decided yet.
 *
 * Two taps, because the first one is easy to hit by accident in a list and
 * the request cannot be un-withdrawn.
 */
export function CancelRequest({ requestId, kind }: { requestId: string; kind: 'overtime' | 'leave' }) {
  const [state, run, pending] = useActionState<RequestState, FormData>(
    kind === 'overtime' ? cancelOvertimeAction : cancelLeaveAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  if (state.ok) {
    return <p className="text-[12px] text-[var(--color-muted)]">{state.ok}</p>;
  }

  return (
    <div>
      {confirming ? (
        <form action={run} className="flex items-center gap-3">
          <input type="hidden" name="requestId" value={requestId} />
          <button
            disabled={pending}
            className="text-[13px] font-semibold text-[var(--color-status-cancelled)] underline disabled:opacity-60"
          >
            {pending ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[13px] text-[var(--color-muted)] underline"
          >
            ไม่ยกเลิก
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[13px] text-[var(--color-muted)] underline"
        >
          ยกเลิกคำขอ
        </button>
      )}
      {state.error && (
        <p className="text-[12px] text-[var(--color-status-cancelled)] mt-1">{state.error}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The two forms, one at a time.
 *
 * Tabs rather than both stacked: on a phone, a second form below the fold is
 * mostly a way to scroll past the one you wanted.
 */
export function RequestTabs({
  overtime,
  leave,
}: {
  overtime: React.ReactNode;
  leave: React.ReactNode;
}) {
  const [tab, setTab] = useState<'overtime' | 'leave'>('overtime');

  const tabClass = (active: boolean) =>
    `flex-1 py-3 text-base font-semibold border-b-2 transition-colors ${
      active
        ? 'border-[var(--color-brand-orange)] text-[var(--color-brand-blue-600)]'
        : 'border-transparent text-[var(--color-muted)]'
    }`;

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-[var(--color-line)]" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overtime'}
          onClick={() => setTab('overtime')}
          className={tabClass(tab === 'overtime')}
        >
          ขอโอที
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'leave'}
          onClick={() => setTab('leave')}
          className={tabClass(tab === 'leave')}
        >
          ขอลา
        </button>
      </div>
      <div className="p-4">{tab === 'overtime' ? overtime : leave}</div>
    </div>
  );
}
