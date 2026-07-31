import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CATEGORY_LABEL, JOB_SIZE_LABEL } from '@/lib/labels';
import { formatThaiDate } from '@/lib/date/buddhist';
import { formatTHB } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function loadJob(id: string) {
  try {
    return await prisma.job.findUnique({
      where: { id },
      include: {
        customer: true,
        site: true,
        contract: true,
        statusEvents: { orderBy: { occurredAt: 'desc' } },
        charges: { orderBy: { createdAt: 'asc' } },
        workOrders: { orderBy: { createdAt: 'desc' } },
        assignments: { include: { crew: true }, orderBy: { assignedAt: 'desc' } },
        assets: { include: { asset: true } },
      },
    });
  } catch {
    return undefined; // DB unavailable — distinct from "not found"
  }
}

function timeOf(d: Date) {
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadJob(id);

  if (job === undefined) {
    return (
      <div className="card p-5 bg-[var(--color-brand-orange-50)] max-w-2xl">
        <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>
      </div>
    );
  }
  if (!job) notFound();

  const net = job.charges.reduce((s, c) => s + Number(c.amountSigned), 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/jobs" className="text-sm text-[var(--color-brand-blue-600)]">← งานทั้งหมด</Link>
          <h1 className="text-2xl font-mono">{job.jobNo}</h1>
        </div>
        <StatusBadge status={job.status} className="!text-[13px] !px-3 !py-1" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Summary */}
        <div className="card p-4 space-y-2 lg:col-span-2">
          <h2 className="text-base">ข้อมูลงาน</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-muted)]">ลูกค้า</dt>
            <dd>{job.customer.displayName} <span className="text-xs text-[var(--color-muted)]">({job.customer.phone})</span></dd>
            <dt className="text-[var(--color-muted)]">หน้างาน</dt>
            <dd>{job.site.name} — {job.site.address}</dd>
            <dt className="text-[var(--color-muted)]">ประเภท / ขนาด</dt>
            <dd>{CATEGORY_LABEL[job.category]} · {JOB_SIZE_LABEL[job.jobSize]}</dd>
            <dt className="text-[var(--color-muted)]">จำนวนเครื่อง</dt>
            <dd>{job.unitCount}</dd>
            <dt className="text-[var(--color-muted)]">วันที่ขอ / วันที่นัด</dt>
            <dd>
              {job.requestedDate ? formatThaiDate(job.requestedDate) : '—'}
              {' / '}
              {job.scheduledDate ? formatThaiDate(job.scheduledDate) : 'ยังไม่นัด'}
            </dd>
            <dt className="text-[var(--color-muted)]">สัญญา</dt>
            <dd>
              {job.contract
                ? <>{job.contract.contractNo} <span className="text-xs text-green-700">(ลูกค้าในสัญญา)</span></>
                : 'ไม่มี (ลูกค้าทั่วไป)'}
            </dd>
            <dt className="text-[var(--color-muted)]">ทีมช่าง</dt>
            <dd>{job.assignments[0]?.crew.name ?? 'ยังไม่จ่ายงาน'}</dd>
            <dt className="text-[var(--color-muted)]">อาการ/รายละเอียด</dt>
            <dd>{job.problemDescription ?? '—'}</dd>
          </dl>
        </div>

        {/* Charges ledger */}
        <div className="card p-4">
          <h2 className="text-base mb-2">ค่าใช้จ่าย</h2>
          {job.charges.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              {job.feeWaivedReason === 'CONTRACT'
                ? 'ยกเว้นค่าตรวจเช็ค (ลูกค้าในสัญญา)'
                : 'ยังไม่มีรายการ'}
            </p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {job.charges.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className={Number(c.amountSigned) < 0 ? 'text-green-700' : ''}>{c.description}</span>
                  <span className={`font-mono ${Number(c.amountSigned) < 0 ? 'text-green-700' : ''}`}>
                    {formatTHB(Number(c.amountSigned))}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-2 border-t border-[var(--color-line)] pt-1.5 font-semibold">
                <span>รวมสุทธิ</span>
                <span className="font-mono">{formatTHB(net)}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* Work orders */}
      <div className="card p-4">
        <h2 className="text-base mb-2">ใบงานที่ผูกอยู่</h2>
        {job.workOrders.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">ยังไม่มีใบงาน — ช่างจะเปิดใบงานเมื่อถึงหน้างาน</p>
        ) : (
          <ul className="text-sm space-y-1">
            {job.workOrders.map((w) => (
              <li key={w.id} className="flex gap-3">
                <span className="font-mono text-xs text-[var(--color-brand-blue-600)]">{w.docNo}</span>
                <span>{w.templateCode} v{w.templateVersion}</span>
                <span className="text-xs text-[var(--color-muted)]">{w.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Status timeline — rendered from the append-only event stream */}
      <div className="card p-4">
        <h2 className="text-base mb-3">ประวัติสถานะ</h2>
        <ol className="space-y-0">
          {job.statusEvents.map((e, i) => (
            <li key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`size-2.5 rounded-full mt-1.5 ${i === 0 ? 'bg-[var(--color-brand-orange)]' : 'bg-[var(--color-line)]'}`} />
                {i < job.statusEvents.length - 1 && <span className="w-px flex-1 bg-[var(--color-line)]" />}
              </div>
              <div className="pb-4 text-sm">
                <StatusBadge status={e.toStatus} />
                <span className="text-xs text-[var(--color-muted)] ml-2">
                  {formatThaiDate(e.occurredAt)} {timeOf(e.occurredAt)}
                  {e.actorRole && ` · ${e.actorRole}`}
                </span>
                {e.note && <p className="text-xs mt-0.5">{e.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
