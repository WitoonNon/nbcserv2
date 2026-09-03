import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { getAsset, repairConcern, HISTORY_PER_PAGE } from '@/modules/assets/asset.service';
import { Pagination, pageParam } from '@/components/ui/Pagination';
import { AC_TYPE_LABEL, CATEGORY_LABEL } from '@/lib/labels';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatThaiDate } from '@/lib/date/buddhist';
import type { JobStatus, ServiceCategory } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

/**
 * One machine, and everything that has happened to it.
 *
 * This is the screen the register exists for. A technician quoting a repair
 * needs to know whether this is the first failure or the fourth, and that
 * answer lives nowhere else — the job list files work under the customer, so
 * one troublesome unit and four healthy ones are indistinguishable there.
 */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-[var(--color-muted)]">{label}</dt>
      <dd className="text-sm">{value || <span className="text-[var(--color-muted)]">—</span>}</dd>
    </div>
  );
}

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ h?: string }>;
}) {
  await requirePermission('customer.read', '/assets');
  const { id } = await params;
  const { h } = await searchParams;

  let asset;
  try {
    asset = await getAsset(id, { historyPage: pageParam(h) });
  } catch {
    return (
      <div className="card p-5 bg-[var(--color-brand-orange-50)] max-w-2xl">
        <p className="text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>
      </div>
    );
  }
  if (!asset) notFound();

  const concern = repairConcern(asset.recentRepairs);
  const overduePm = asset.nextPmDueAt !== null && new Date(asset.nextPmDueAt) < new Date();

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/assets" className="text-sm text-[var(--color-brand-blue-600)]">
          ← กลับไปทะเบียนเครื่อง
        </Link>
        {/* Two links, because tagging happens both ways: one machine that was
            replaced, or a whole plant room in an afternoon. */}
        <span className="text-sm">
          <Link
            href={`/print/asset-qr?ids=${asset.id}`}
            className="text-[var(--color-brand-blue-600)] underline"
          >
            พิมพ์ป้าย QR
          </Link>
          <span className="text-[var(--color-muted)]"> · </span>
          <Link
            href={`/print/asset-qr?site=${asset.siteId}`}
            className="text-[var(--color-brand-blue-600)] underline"
          >
            ทั้งหน้างาน
          </Link>
        </span>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-mono">{asset.assetTag}</h1>
            <p className="text-sm text-[var(--color-muted)] mt-0.5">
              {AC_TYPE_LABEL[asset.acType]}
              {asset.brand ? ` · ${asset.brand}` : ''}
              {asset.model ? ` ${asset.model}` : ''}
            </p>
          </div>
          <div className="text-right text-sm">
            <Link
              href={`/customers/${asset.customerId}`}
              className="text-[var(--color-brand-blue-600)]"
            >
              {asset.customerName}
            </Link>
            <p className="text-[12px] text-[var(--color-muted)]">
              {asset.siteName}
              {asset.locationInBuilding ? ` · ${asset.locationInBuilding}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* The judgement this page exists to inform — stated as a count and a
          suggestion, never as a decision. Whether a unit is replaced depends on
          the customer's budget and what the last technician actually saw,
          neither of which is in this database. */}
      {concern !== 'none' && (
        <div
          className={
            'card p-4 text-sm ' +
            (concern === 'high'
              ? 'bg-red-50 border-[#b42318]/30'
              : 'bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40')
          }
        >
          <p className="font-semibold">
            เครื่องนี้ซ่อมไปแล้ว {asset.recentRepairs} ครั้งในรอบ 12 เดือน
          </p>
          <p className="text-[13px] text-[var(--color-muted)] mt-1">
            {concern === 'high'
              ? 'ควรประเมินว่าคุ้มที่จะซ่อมต่อหรือควรเสนอเปลี่ยนเครื่อง ก่อนออกใบเสนอราคาครั้งถัดไป'
              : 'เริ่มซ่อมถี่ผิดปกติ ควรดูประวัติด้านล่างประกอบก่อนเสนอราคา'}
          </p>
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-base mb-3">ข้อมูลเครื่อง</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="ซีเรียล" value={asset.serialNo} />
          <Field label="ขนาด" value={asset.btu ? `${asset.btu.toLocaleString()} BTU` : null} />
          <Field label="น้ำยา" value={asset.refrigerant} />
          <Field
            label="ติดตั้งเมื่อ"
            value={asset.installedAt ? formatThaiDate(new Date(asset.installedAt)) : null}
          />
          <Field label="รอบล้างต่อปี" value={`${asset.pmFrequencyPerYear} ครั้ง`} />
          <Field
            label="ล้างครั้งล่าสุด"
            value={asset.lastPmAt ? formatThaiDate(new Date(asset.lastPmAt)) : null}
          />
          <Field
            label="ล้างครั้งถัดไป"
            value={
              asset.nextPmDueAt ? (
                <span className={overduePm ? 'text-[var(--color-brand-orange-600)] font-semibold' : ''}>
                  {formatThaiDate(new Date(asset.nextPmDueAt))}
                  {overduePm && ' · เลยกำหนดแล้ว'}
                </span>
              ) : null
            }
          />
          <Field label="ซ่อมทั้งหมด" value={`${asset.totalRepairs} ครั้ง`} />
          <Field label="ล้างทั้งหมด" value={`${asset.totalCleans} ครั้ง`} />
        </dl>
        <p className="text-[11px] text-[var(--color-muted)] mt-3">
          ที่อยู่หน้างาน · {asset.siteAddress}
        </p>
      </div>

      {/* The anchor is what makes paging usable on a unit with a long record:
          without it, turning the page drops the reader back at the letterhead
          and they have to scroll down to the table again every time. */}
      <div className="card overflow-hidden" id="history">
        <div className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-baseline justify-between gap-3">
          <h2 className="text-base">ประวัติงานของเครื่องนี้</h2>
          {asset.historyTotal > 0 && (
            <span className="text-[12px] text-[var(--color-muted)]">
              ทั้งหมด {asset.historyTotal.toLocaleString('th-TH')} งาน
            </span>
          )}
        </div>
        {asset.history.length === 0 ? (
          <p className="p-4 text-sm text-[var(--color-muted)]">
            ยังไม่มีประวัติงาน — เครื่องนี้เพิ่งเข้าทะเบียน หรือยังไม่เคยถูกระบุในใบงาน
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-[12px] text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="py-2 pl-4 pr-3 font-normal">เลขที่งาน</th>
                  <th className="py-2 pr-3 font-normal">ประเภท</th>
                  <th className="py-2 pr-3 font-normal">วันที่นัด</th>
                  <th className="py-2 pr-3 font-normal">สถานะ</th>
                  <th className="py-2 pr-4 font-normal">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:pl-4">
                {asset.history.map((h) => (
                  <tr key={h.jobId} className="border-b border-[var(--color-line)]">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/jobs/${h.jobId}`}
                        className="font-mono text-[13px] text-[var(--color-brand-blue-600)]"
                      >
                        {h.jobNo}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {CATEGORY_LABEL[h.category as ServiceCategory] ?? h.category}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {h.scheduledDate ? formatThaiDate(new Date(h.scheduledDate)) : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={h.status as JobStatus} />
                    </td>
                    <td className="py-2 pr-4 text-[12px] text-[var(--color-muted)]">
                      {h.note ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {asset.historyTotal > 0 && (
          <Pagination
            page={asset.historyPage}
            total={asset.historyTotal}
            perPage={HISTORY_PER_PAGE}
            basePath={`/assets/${asset.id}`}
            param="h"
            hash="#history"
            unit="งาน"
          />
        )}
      </div>
    </div>
  );
}
