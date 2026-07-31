import { cn } from '@/lib/utils';
import type { JobStatus } from '@/generated/prisma';

const STATUS_STYLE: Record<JobStatus, { bg: string; label: string }> = {
  DRAFT: { bg: 'bg-slate-400', label: 'ร่าง' },
  SUBMITTED: { bg: 'bg-slate-600', label: 'รับเรื่องแล้ว' },
  SCHEDULED: { bg: 'bg-[var(--color-status-scheduled)]', label: 'นัดหมายแล้ว' },
  ASSIGNED: { bg: 'bg-[var(--color-status-assigned)]', label: 'จ่ายงานแล้ว' },
  EN_ROUTE: { bg: 'bg-[var(--color-status-enroute)]', label: 'กำลังเดินทาง' },
  ON_SITE: { bg: 'bg-[var(--color-status-onsite)]', label: 'ถึงหน้างาน' },
  IN_PROGRESS: { bg: 'bg-[var(--color-status-progress)]', label: 'กำลังดำเนินการ' },
  PENDING_QUOTE: { bg: 'bg-[var(--color-status-quote)]', label: 'รออนุมัติราคา' },
  QUOTE_APPROVED: { bg: 'bg-emerald-600', label: 'อนุมัติราคาแล้ว' },
  QUOTE_REJECTED: { bg: 'bg-rose-600', label: 'ไม่อนุมัติราคา' },
  COMPLETED: { bg: 'bg-[var(--color-status-done)]', label: 'งานเสร็จ' },
  REPORT_APPROVED: { bg: 'bg-green-700', label: 'อนุมัติรายงาน' },
  CLOSED: { bg: 'bg-[var(--color-status-closed)]', label: 'ปิดงาน' },
  CANCELLED: { bg: 'bg-[var(--color-status-cancelled)]', label: 'ยกเลิก' },
  RESCHEDULED: { bg: 'bg-amber-600', label: 'เลื่อนนัด' },
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap',
        s.bg,
        className,
      )}
    >
      {s.label}
    </span>
  );
}

/** Marks a seeded placeholder so it is never mistaken for a confirmed rule. */
export function AssumptionBadge({ question }: { question?: string }) {
  return (
    <span className="assumption-badge" title="ค่าสมมติ รอลูกค้ายืนยัน">
      ⚠ ค่าสมมติ{question ? ` (${question})` : ''}
    </span>
  );
}
