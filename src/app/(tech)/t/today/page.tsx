import Link from 'next/link';
import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatThaiDate } from '@/lib/date/buddhist';
import { formatMinutes } from '@/lib/utils';
import { requireUser } from '@/lib/auth/guard';
import { dateOnly } from '@/modules/scheduling/quota.service';
import { nextStepFor } from '@/modules/jobs/field-work.service';
import { JobStepButton } from '@/components/tech/JobStepButton';

export const dynamic = 'force-dynamic';

/**
 * Technician queue for today.
 *
 * Layout priorities, in order: what is next, where is it, how do I start it.
 * Everything is a large tap target — this is used one-handed, often with
 * gloves on, sometimes in direct sunlight on a rooftop.
 */
/**
 * Only the jobs assigned to THIS technician's crew. A technician opening the
 * app must never see the whole company's day — it is both noise and a
 * disclosure of other customers' details.
 */
async function loadQueue(technicianId: string | null) {
  if (!technicianId) return [];
  try {
    // dateOnly() normalises to UTC midnight, which is how @db.Date columns are
    // stored. Using local midnight in Bangkok (UTC+7) resolves to 17:00 the
    // previous day and silently matches nothing — the technician sees an empty
    // queue while jobs are in fact assigned to them.
    const today = dateOnly(new Date());
    return await prisma.job.findMany({
      where: {
        scheduledDate: today,
        assignments: {
          some: {
            unassignedAt: null,
            crew: { members: { some: { technicianId, validTo: null } } },
          },
        },
      },
      include: {
        customer: true,
        // The site's own contact is who the technician should ring — the
        // person at the door, not head office.
        site: { include: { contacts: { orderBy: { isPrimary: 'desc' }, take: 1 } } },
        assets: true,
        workOrders: { select: { id: true, status: true } },
      },
      orderBy: [{ priority: 'desc' }, { scheduledWindowFrom: 'asc' }],
      take: 20,
    });
  } catch {
    return null;
  }
}

export default async function TechTodayPage() {
  const user = await requireUser('/t/today');
  const jobs = await loadQueue(user.technicianId);

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
            {(() => {
              // The number to ring: the site contact, else the customer on
              // file. This used to be `tel:${job.site.id}`, which dialled a
              // database id.
              const phone = job.site.contacts[0]?.phone ?? job.customer.phone;
              const step = nextStepFor(job.status);
              const hasPaperwork = job.workOrders.some(
                (w) => w.status === 'SUBMITTED' || w.status === 'APPROVED',
              );

              return (
                <>
                  <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] border-t border-[var(--color-line)]">
                    {phone ? (
                      <a
                        href={`tel:${phone}`}
                        className="bg-white min-h-[48px] grid place-items-center text-sm font-semibold text-[var(--color-brand-blue-600)]"
                      >
                        โทรหาลูกค้า
                      </a>
                    ) : (
                      <span className="bg-white min-h-[48px] grid place-items-center text-sm text-[var(--color-muted)]">
                        ไม่มีเบอร์ติดต่อ
                      </span>
                    )}
                    <Link
                      href={`/jobs/${job.id}`}
                      className="bg-white min-h-[48px] grid place-items-center text-sm font-semibold text-[var(--color-brand-blue-600)]"
                    >
                      ใบงาน
                    </Link>
                  </div>

                  {step ? (
                    <JobStepButton jobId={job.id} step={step} warnNoWorkOrder={!hasPaperwork} />
                  ) : (
                    <p className="text-center text-xs text-[var(--color-muted)] py-3 border-t border-[var(--color-line)]">
                      {job.status === 'COMPLETED'
                        ? 'ปิดงานแล้ว — รอออฟฟิศตรวจ'
                        : 'ขั้นตอนถัดไปทำที่ออฟฟิศ'}
                    </p>
                  )}
                </>
              );
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}
