'use client';

import { useActionState, useState } from 'react';
import { FormRenderer } from '@/components/forms/FormRenderer';
import type { WorkOrderView } from '@/modules/workorders/workorder.service';
import {
  approveAction,
  returnAction,
  saveDraftAction,
  submitAction,
  type WorkOrderState,
} from '@/app/(staff)/work-orders/d/[id]/actions';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'ร่าง', cls: 'bg-slate-500' },
  SUBMITTED: { label: 'รอหัวหน้างานตรวจ', cls: 'bg-[var(--color-status-quote)]' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-[var(--color-status-done)]' },
  RETURNED: { label: 'ตีกลับให้แก้ไข', cls: 'bg-[var(--color-status-cancelled)]' },
};

export function WorkOrderEditor({
  workOrder,
  canSubmit,
  canApprove,
}: {
  workOrder: WorkOrderView;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const [payload, setPayload] = useState<Record<string, unknown>>(workOrder.payload);
  const [showReturn, setShowReturn] = useState(false);

  const [saveState, saveDraft, saving] = useActionState<WorkOrderState, FormData>(saveDraftAction, {});
  const [submitState, submit, submitting] = useActionState<WorkOrderState, FormData>(submitAction, {});
  const [approveState, approve, approving] = useActionState<WorkOrderState, FormData>(approveAction, {});
  const [returnState, sendBack, returning] = useActionState<WorkOrderState, FormData>(returnAction, {});

  const state = submitState.error || submitState.ok
    ? submitState
    : returnState.error || returnState.ok
      ? returnState
      : approveState.error || approveState.ok
        ? approveState
        : saveState;

  // An approved document is evidence of what was signed; a submitted one is
  // waiting on someone else. Neither is the technician's to edit.
  const readOnly = workOrder.status === 'APPROVED' || workOrder.status === 'SUBMITTED';
  const status = STATUS_LABEL[workOrder.status] ?? STATUS_LABEL.DRAFT!;

  // Every action posts the same payload, so the form the technician is looking
  // at is exactly what gets stored — no separate "current" copy to drift.
  const hidden = (
    <>
      <input type="hidden" name="workOrderId" value={workOrder.id} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] text-[var(--color-muted)]">เลขที่ใบงาน</p>
          <p className="font-mono text-lg text-[var(--color-brand-orange)]">{workOrder.docNo}</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            {workOrder.customerName} · {workOrder.siteAddress}
          </p>
        </div>
        <div className="text-right">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${status.cls}`}
          >
            {status.label}
          </span>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            ฟอร์มเวอร์ชัน {workOrder.templateVersion}
          </p>
          {workOrder.submittedByName && workOrder.submittedAt && (
            <p className="text-[11px] text-[var(--color-muted)]">
              ส่งโดย {workOrder.submittedByName}
            </p>
          )}
          {workOrder.approvedByName && workOrder.approvedAt && (
            <p className="text-[11px] text-[var(--color-muted)]">
              อนุมัติโดย {workOrder.approvedByName}
            </p>
          )}
        </div>
      </div>

      {workOrder.status === 'RETURNED' && workOrder.returnReason && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          <strong>หัวหน้างานตีกลับ:</strong> {workOrder.returnReason}
        </div>
      )}

      {state.error && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          {state.error}
        </div>
      )}
      {state.ok && <div className="card p-3 bg-green-50 border-green-300 text-sm">{state.ok}</div>}

      <FormRenderer
        schema={workOrder.schema}
        values={payload}
        onChange={setPayload}
        errors={submitState.fieldErrors ?? {}}
        readOnly={readOnly}
        workOrderId={workOrder.id}
      />

      <div className="card p-4 space-y-3">
        {!readOnly && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-[var(--color-muted)] max-w-md">
              บันทึกร่างได้ตลอด แม้กรอกยังไม่ครบ — ระบบจะตรวจความครบถ้วนตอนกดส่งเท่านั้น
            </p>
            <div className="flex gap-2">
              <form action={saveDraft}>
                {hidden}
                <button
                  disabled={saving}
                  className="border border-[var(--color-line)] rounded-[3px] px-4 py-2 text-sm bg-white disabled:opacity-60"
                >
                  {saving ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
                </button>
              </form>
              {canSubmit && (
                <form action={submit}>
                  {hidden}
                  <button
                    disabled={submitting}
                    className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {submitting ? 'กำลังส่ง…' : 'ส่งใบงาน'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {workOrder.status === 'SUBMITTED' && canApprove && (
          <div className="border-t border-[var(--color-line)] pt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm">ตรวจใบงานนี้</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReturn((v) => !v)}
                  className="border border-[var(--color-line)] rounded-[3px] px-4 py-2 text-sm bg-white"
                >
                  ตีกลับให้แก้
                </button>
                <form action={approve}>
                  {hidden}
                  <button
                    disabled={approving}
                    className="bg-[var(--color-status-done)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {approving ? 'กำลังอนุมัติ…' : 'อนุมัติ'}
                  </button>
                </form>
              </div>
            </div>

            {showReturn && (
              <form action={sendBack} className="flex flex-wrap gap-2 items-end">
                {hidden}
                <label className="block flex-1 min-w-[240px]">
                  <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
                    เหตุผลที่ตีกลับ — ช่างต้องรู้ว่าต้องแก้อะไร
                  </span>
                  <input
                    name="reason"
                    required
                    placeholder="เช่น ยังไม่ได้กรอกค่าแรงดันไฟฟ้า"
                    className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white"
                  />
                </label>
                <button
                  disabled={returning}
                  className="bg-[var(--color-status-cancelled)] text-white rounded-[3px] px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
                >
                  {returning ? 'กำลังส่งกลับ…' : 'ยืนยันตีกลับ'}
                </button>
              </form>
            )}
          </div>
        )}

        {workOrder.status === 'APPROVED' && (
          <p className="text-[11px] text-[var(--color-muted)]">
            ใบงานนี้อนุมัติแล้ว แก้ไขไม่ได้ — หากต้องแก้ ต้องออกใบงานใหม่
            เพื่อให้เอกสารที่ลูกค้าเซ็นไปแล้วยังตรวจสอบย้อนหลังได้
          </p>
        )}
        {workOrder.status === 'SUBMITTED' && !canApprove && (
          <p className="text-[11px] text-[var(--color-muted)]">
            ส่งแล้ว รอหัวหน้างานตรวจ — หากต้องแก้ ให้หัวหน้างานตีกลับก่อน
          </p>
        )}
      </div>
    </div>
  );
}
