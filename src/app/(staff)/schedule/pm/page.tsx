import Link from 'next/link';
import type { AcType } from '@/generated/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { listPmProposals } from '@/modules/scheduling/pm.service';
import { formatThaiDate } from '@/lib/date/buddhist';
import { AC_TYPE_LABEL } from '@/lib/labels';
import { PmProposals, type ProposalRow } from '@/components/scheduling/PmProposals';

export const dynamic = 'force-dynamic';

/**
 * The queue of PM visits the system is suggesting.
 *
 * Its own screen rather than a filter on /jobs, because these are the only
 * jobs in the system that nobody has agreed to yet — mixed into the job list
 * they read as work that is going to happen, and the whole point is that it
 * will not until somebody here says so.
 *
 * An empty queue is the normal state and says so plainly. A screen that
 * always looks busy teaches people to stop reading it.
 */
export default async function PmProposalsPage() {
  await requirePermission('quota.override', '/schedule/pm');

  let rows: ProposalRow[];
  try {
    const proposals = await listPmProposals();
    rows = proposals.map((p) => ({
      jobId: p.jobId,
      jobNo: p.jobNo,
      dateLabel: formatThaiDate(p.scheduledDate, 'long'),
      customerName: p.customerName,
      siteName: p.siteName,
      zoneName: p.zoneName,
      units: p.units,
      minutes: p.minutes,
      assetCount: p.assetCount,
      // Counted by type rather than listed one by one: twelve tags tell the
      // office nothing, "แขวน 8 · ตู้ตั้ง 4" tells them what to send.
      assetSummary: summarise(p.assets),
    }));
  } catch {
    return (
      <div className="card p-5 max-w-xl text-center text-sm text-[var(--color-muted)]">
        ยังเชื่อมต่อฐานข้อมูลไม่ได้
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">ข้อเสนอนัดล้าง/PM</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            ระบบเสนอจากรอบที่ครบกำหนด · ยังไม่กินโควตาและยังไม่แจ้งลูกค้าจนกว่าจะยืนยัน
          </p>
        </div>
        <Link href="/schedule" className="text-sm text-[var(--color-brand-blue-600)] underline">
          ตารางงาน
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">
          ไม่มีข้อเสนอรอพิจารณา — เครื่องที่ถึงรอบถูกจัดการหมดแล้ว
        </div>
      ) : (
        <PmProposals rows={rows} />
      )}
    </div>
  );
}

function summarise(assets: { code: string; acType: AcType | null }[]): string {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const label = asset.acType ? AC_TYPE_LABEL[asset.acType] : 'ไม่ระบุประเภท';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, n]) => `${label} ${n}`).join(' · ');
}
