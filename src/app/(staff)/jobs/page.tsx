import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { JobStatus, Prisma, ServiceCategory } from '@/generated/prisma';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CATEGORY_LABEL } from '@/lib/labels';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS: JobStatus[] = [
  'SUBMITTED', 'SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS',
  'PENDING_QUOTE', 'COMPLETED', 'CLOSED', 'CANCELLED',
];

interface Search {
  q?: string;
  status?: string;
  category?: string;
  from?: string;
  to?: string;
}

async function loadJobs(sp: Search) {
  const where: Prisma.JobWhereInput = {};
  if (sp.q) {
    where.OR = [
      { jobNo: { contains: sp.q, mode: 'insensitive' } },
      { customer: { displayName: { contains: sp.q, mode: 'insensitive' } } },
      { customer: { phone: { contains: sp.q } } },
    ];
  }
  if (sp.status) where.status = sp.status as JobStatus;
  if (sp.category) where.category = sp.category as ServiceCategory;
  if (sp.from || sp.to) {
    where.scheduledDate = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(sp.to) } : {}),
    };
  }

  try {
    return await prisma.job.findMany({
      where,
      include: { customer: true, site: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  } catch {
    return null;
  }
}

const inputCls =
  'border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white';

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const jobs = await loadJobs(sp);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl">งานทั้งหมด</h1>
        <Link
          href="/jobs/new"
          className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold"
        >
          + รับแจ้งงานใหม่
        </Link>
      </div>

      <form className="card p-3 flex flex-wrap gap-2 items-end" method="get">
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ค้นหา</span>
          <input name="q" defaultValue={sp.q} placeholder="เลขที่งาน / ชื่อลูกค้า / เบอร์โทร"
            className={`${inputCls} w-64`} />
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">สถานะ</span>
          <select name="status" defaultValue={sp.status ?? ''} className={inputCls}>
            <option value="">ทั้งหมด</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ประเภทงาน</span>
          <select name="category" defaultValue={sp.category ?? ''} className={inputCls}>
            <option value="">ทั้งหมด</option>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">นัดตั้งแต่</span>
          <input type="date" name="from" defaultValue={sp.from} className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ถึง</span>
          <input type="date" name="to" defaultValue={sp.to} className={inputCls} />
        </label>
        <button className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-4 py-1.5 text-sm">
          กรอง
        </button>
      </form>

      {jobs === null ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
          <p className="text-sm">
            ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ตารางงานจะแสดงทันทีเมื่อตั้งค่า DATABASE_URL แล้วรัน
            migrate + seed
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          ยังไม่มีงานที่ตรงเงื่อนไข —{' '}
          <Link href="/jobs/new" className="text-[var(--color-brand-blue-600)]">รับแจ้งงานแรก</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                <th className="px-3 py-2 font-normal">เลขที่งาน</th>
                <th className="px-3 py-2 font-normal">ลูกค้า</th>
                <th className="px-3 py-2 font-normal">หน้างาน</th>
                <th className="px-3 py-2 font-normal">ประเภท</th>
                <th className="px-3 py-2 font-normal text-center">เครื่อง</th>
                <th className="px-3 py-2 font-normal">วันที่นัด</th>
                <th className="px-3 py-2 font-normal">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-brand-sky-50)]">
                  <td className="px-3 py-2.5">
                    <Link href={`/jobs/${j.id}`} className="font-mono text-xs text-[var(--color-brand-blue-600)]">
                      {j.jobNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {j.customer.displayName}
                    <span className="block text-[11px] text-[var(--color-muted)]">{j.customer.phone}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{j.site.name}</td>
                  <td className="px-3 py-2.5 text-xs">{CATEGORY_LABEL[j.category]}</td>
                  <td className="px-3 py-2.5 text-center">{j.unitCount}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {j.scheduledDate
                      ? formatThaiDate(j.scheduledDate)
                      : j.requestedDate
                        ? <>ขอ {formatThaiDate(j.requestedDate)}<span className="text-[var(--color-muted)]"> (ยังไม่นัด)</span></>
                        : '—'}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={j.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
