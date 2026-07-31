import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatThaiDate } from '@/lib/date/buddhist';
import { formatMinutes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Technician queue for today.
 *
 * Layout priorities, in order: what is next, where is it, how do I start it.
 * Everything is a large tap target — this is used one-handed, often with
 * gloves on, sometimes in direct sunlight on a rooftop.
 */
async function loadQueue() {
  try {
    const today = new Date(new Date().toDateString());
    return await prisma.job.findMany({
      where: { scheduledDate: today },
      include: { customer: true, site: true, assets: true },
      orderBy: [{ priority: 'desc' }, { scheduledWindowFrom: 'asc' }],
      take: 20,
    });
  } catch {
    return null;
  }
}

export default async function TechTodayPage() {
  const jobs = await loadQueue();

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl">งานวันนี้</h1>
        <p className="text-sm text-[var(--color-muted)]">{formatThaiDate(new Date(), 'long')}</p>
      </div>

      {jobs === null && (
        <div className="card p-4 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
          <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ตั้งค่า DATABASE_URL แล้วรัน migrate + seed</p>
        </div>
      )}

      {jobs?.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-4xl mb-2">☀️</p>
          <p className="text-sm text-[var(--color-muted)]">วันนี้ยังไม่มีงานที่จ่ายให้</p>
        </div>
      )}

      <ul className="space-y-3">
        {(jobs ?? []).map((job) => (
          <li key={job.id} className="card overflow-hidden">
            <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-[var(--color-line)]">
              <div className="min-w-0">
                <p className="font-semibold truncate">{job.customer.displayName}</p>
                <p className="text-xs text-[var(--color-muted)] truncate">{job.site.name}</p>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <div className="px-4 py-3 text-sm space-y-1">
              <p className="text-[var(--color-muted)] text-xs">
                {job.jobNo} · {job.assets.length} เครื่อง · {formatMinutes(job.estimatedMinutes)}
              </p>
              <p className="truncate">{job.problemDescription ?? '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[var(--color-line)]">
              <a
                href={`tel:${job.site.id}`}
                className="bg-white min-h-[48px] grid place-items-center text-sm font-semibold text-[var(--color-brand-blue-600)]"
              >
                โทรหาลูกค้า
              </a>
              <button
                type="button"
                className="bg-[var(--color-brand-orange)] min-h-[48px] text-white text-sm font-semibold"
              >
                เริ่มเดินทาง
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Placeholder for the offline sync queue indicator. */}
      <p className="text-[11px] text-center text-[var(--color-muted)] pt-2">
        ฟอร์มและรูปที่กรอกไว้ตอนไม่มีสัญญาณ จะถูกส่งอัตโนมัติเมื่อกลับมาออนไลน์
      </p>
    </div>
  );
}
