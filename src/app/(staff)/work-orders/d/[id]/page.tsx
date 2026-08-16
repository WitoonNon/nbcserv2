import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWorkOrder } from '@/modules/workorders/workorder.service';
import { requirePermission, can } from '@/lib/auth/guard';
import { canViewWorkOrder } from '@/modules/workorders/access';
import { WorkOrderEditor } from '@/components/forms/WorkOrderEditor';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * A real work order against a real job — as opposed to /work-orders/[code],
 * which previews a blank template.
 */
export default async function WorkOrderDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission('workorder.read', `/work-orders/d/${id}`);

  // The permission says this account may look at work orders, not at this one.
  // Without the scope check a technician could open another crew's document —
  // which carries the customer's name, telephone and address.
  if (!(await canViewWorkOrder(user, id))) notFound();

  let workOrder;
  try {
    workOrder = await getWorkOrder(id);
  } catch {
    return (
      <div className="card p-5 bg-[var(--color-brand-orange-50)] max-w-2xl">
        <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>
      </div>
    );
  }
  if (!workOrder) notFound();

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href={`/jobs/${workOrder.jobId}`} className="text-sm text-[var(--color-brand-blue-600)]">
        ← กลับไปงาน {workOrder.jobNo}
      </Link>

      {/* Letterhead, matching the client's paper form. */}
      <div className="card overflow-hidden">
        <div className="p-4 flex items-start justify-between gap-4 flex-wrap border-b-2 border-[var(--color-brand-navy)]">
          <div>
            <p className="font-[family-name:var(--font-heading)] text-lg text-[var(--color-brand-navy)]">
              บริษัท เอ็นบีซี กรุ๊ป จำกัด (สำนักงานใหญ่)
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              105/26 หมู่ 2 ตำบลละหาร อำเภอบางบัวทอง จังหวัดนนทบุรี 11110
            </p>
            <p className="text-xs text-[var(--color-muted)]">เลขประจำตัวผู้เสียภาษี 0125561013342</p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-[var(--color-brand-navy)] text-white px-4 py-1.5 font-[family-name:var(--font-heading)] tracking-wide">
              {workOrder.schema.titleEn?.toUpperCase() ?? workOrder.schema.titleTh}
            </span>
            <dl className="text-xs mt-2 space-y-0.5">
              <div className="flex gap-2 justify-end">
                <dt className="text-[var(--color-muted)]">เลขที่ใบงาน</dt>
                <dd className="font-mono text-[var(--color-brand-blue-600)]">{workOrder.docNo}</dd>
              </div>
              <div className="flex gap-2 justify-end">
                <dt className="text-[var(--color-muted)]">วันที่</dt>
                <dd>{formatThaiDate(new Date(workOrder.updatedAt))}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="px-4 py-2 text-[11px] text-[var(--color-muted)] flex flex-wrap gap-x-4 gap-y-1">
          <span>02-000-7332 ต่อ 1-3</span>
          <span>096-648-8886</span>
          <span>097-094-4419</span>
          <span>Line: @nbcservice</span>
          <span>nbcservice@nbcgroup.co.th</span>
        </div>
      </div>

      <WorkOrderEditor
        workOrder={workOrder}
        canSubmit={can(user, 'workorder.submit')}
        canApprove={can(user, 'workorder.approve')}
      />

      <p className="text-center text-sm text-[var(--color-brand-navy)] pb-4">
        ขอบคุณที่ไว้วางใจในบริการของเรา ❄
      </p>
    </div>
  );
}
