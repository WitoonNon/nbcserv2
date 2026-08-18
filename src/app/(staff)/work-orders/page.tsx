import Link from 'next/link';
import type { WorkOrderStatus } from '@/generated/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { countWorkOrdersByStatus, listWorkOrders } from '@/modules/workorders/workorder.service';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * The work-order queue.
 *
 * Replaces a page that listed the three blank form templates. That was a
 * catalogue, not a workload: a supervisor had no way to find what was waiting
 * for them, so a submitted form sat unapproved until somebody happened to open
 * the right job. The templates are still previewable, just no longer the point
 * of the screen.
 *
 * Defaults to "รอตรวจ" because that is the only status anyone has to act on.
 */

const FORM_LABEL: Record<string, string> = {
  INSPECTION_REQUEST: 'ใบตรวจเช็ค/แจ้งซ่อม',
  CLEANING_PM: 'ใบล้าง/PM',
  REPAIR: 'ใบซ่อม',
};

const TABS: { status: WorkOrderStatus | 'ALL'; label: string }[] = [
  { status: 'SUBMITTED', label: 'รอตรวจ' },
  { status: 'RETURNED', label: 'ตีกลับให้แก้' },
  { status: 'DRAFT', label: 'ร่าง' },
  { status: 'APPROVED', label: 'อนุมัติแล้ว' },
  { status: 'ALL', label: 'ทั้งหมด' },
];

const STATUS_STYLE: Record<WorkOrderStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'ร่าง', cls: 'bg-slate-500' },
  SUBMITTED: { label: 'รอตรวจ', cls: 'bg-[var(--color-status-quote)]' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-[var(--color-status-done)]' },
  RETURNED: { label: 'ตีกลับ', cls: 'bg-[var(--color-status-cancelled)]' },
};

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission('workorder.read', '/work-orders');
  const sp = await searchParams;
  const active = (sp.status ?? 'SUBMITTED') as WorkOrderStatus | 'ALL';

  let rows;
  let counts;
  try {
    [rows, counts] = await Promise.all([
      listWorkOrders(user, active === 'ALL' ? undefined : { status: active }),
      countWorkOrdersByStatus(user),
    ]);
  } catch {
    return (
      <div className="card p-5 bg-[var(--color-brand-orange-50)] max-w-2xl text-sm">
        ยังเชื่อมต่อฐานข้อมูลไม่ได้
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">ใบงาน</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            ใบงานที่คุณเกี่ยวข้อง เรียงตามความเคลื่อนไหวล่าสุด
          </p>
        </div>
        <Link
          href="/work-orders/templates"
          className="border border-[var(--color-line)] rounded-[3px] px-3 py-1.5 text-sm bg-white whitespace-nowrap"
        >
          ดูแบบฟอร์มทั้ง 3 ใบ
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const isActive = t.status === active;
          const count = t.status === 'ALL' ? null : counts[t.status];
          return (
            <Link
              key={t.status}
              href={`/work-orders?status=${t.status}`}
              className={`rounded-[3px] border px-3 py-1.5 text-sm ${
                isActive
                  ? 'border-[var(--color-brand-orange)] bg-[var(--color-brand-orange)] text-white'
                  : 'border-[var(--color-line)] bg-white hover:border-[var(--color-brand-orange)]'
              }`}
            >
              {t.label}
              {count !== null && count > 0 && (
                <span className={`ml-1.5 ${isActive ? 'text-white/80' : 'text-[var(--color-muted)]'}`}>
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--color-muted)]">
          {active === 'SUBMITTED'
            ? 'ไม่มีใบงานรอตรวจ — เคลียร์หมดแล้ว'
            : 'ไม่มีใบงานในสถานะนี้'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                  <th className="px-3 py-2 font-normal">เลขที่ใบงาน</th>
                  <th className="px-3 py-2 font-normal">ประเภท</th>
                  <th className="px-3 py-2 font-normal">ลูกค้า</th>
                  <th className="px-3 py-2 font-normal">งาน</th>
                  <th className="px-3 py-2 font-normal">ส่งโดย</th>
                  <th className="px-3 py-2 font-normal">อัปเดต</th>
                  <th className="px-3 py-2 font-normal text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-alt)]">
                    <td className="px-3 py-2">
                      <Link
                        href={`/work-orders/d/${w.id}`}
                        className="font-mono text-xs text-[var(--color-brand-blue-600)] underline underline-offset-2"
                      >
                        {w.docNo}
                      </Link>
                      {w.hasStaleSignature && (
                        <span
                          className="ml-2 text-[10px] text-[var(--color-status-cancelled)]"
                          title="ฟอร์มถูกแก้หลังจากมีคนเซ็นแล้ว"
                        >
                          ⚠ เซ็นไม่ตรงเนื้อหา
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{FORM_LABEL[w.templateCode] ?? w.templateCode}</td>
                    <td className="px-3 py-2">{w.customerName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{w.jobNo}</td>
                    <td className="px-3 py-2 text-xs">{w.submittedByName ?? '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {formatThaiDate(new Date(w.updatedAt))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${STATUS_STYLE[w.status].cls}`}
                      >
                        {STATUS_STYLE[w.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
