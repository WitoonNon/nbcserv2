import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { getAsset, repairConcern } from '@/modules/assets/asset.service';
import { AC_TYPE_LABEL } from '@/lib/labels';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * Where the sticker on the machine leads — Phase 3.1.
 *
 * `/a/<id>` and not `/assets/<id>`: this URL is printed into a QR code that
 * goes on a label two centimetres wide, and every character is another module
 * in the grid. The staff register keeps its own longer path.
 *
 * Outside the staff layout for the same reason /clock is. A technician opens
 * this crouched beside a condenser on a rooftop, one-handed, and a dispatch
 * sidebar built for a desk is in the way.
 *
 * ## Not a public page
 *
 * The QR carries no token and needs none — but it is still behind a login.
 * The asset id is not a secret; the customer's name, address and repair
 * history attached to it are. A photographed label must not become a way to
 * read another company's maintenance record.
 */
export default async function AssetScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  await requirePermission('customer.read', `/a/${id}`);

  const { page } = await searchParams;
  const historyPage = Number(page) > 1 ? Number(page) : 1;

  let asset;
  try {
    asset = await getAsset(id, { historyPage });
  } catch {
    return (
      <Shell>
        <div className="card p-5 text-center text-sm text-[var(--color-muted)]">
          ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ลองใหม่อีกครั้ง
        </div>
      </Shell>
    );
  }
  if (!asset) notFound();

  const concern = repairConcern(asset.recentRepairs);
  const overdue = asset.nextPmDueAt ? new Date(asset.nextPmDueAt) < new Date() : false;

  return (
    <Shell>
      <header>
        <p className="text-[13px] text-[var(--color-muted)]">{asset.customerName}</p>
        <h1 className="text-xl font-semibold">{asset.assetTag}</h1>
        <p className="text-[13px]">
          {AC_TYPE_LABEL[asset.acType]}
          {asset.btu ? ` · ${asset.btu.toLocaleString('th-TH')} BTU` : ''}
        </p>
        <p className="text-[13px] text-[var(--color-muted)]">
          {asset.siteName}
          {asset.locationInBuilding && ` · ${asset.locationInBuilding}`}
        </p>
      </header>

      {/* The two facts a technician standing at the machine actually needs,
          before any of the history: is it due, and has it been trouble. */}
      {(overdue || concern !== 'none') && (
        <div
          className={`card p-3 text-[13px] border ${
            concern === 'high'
              ? 'border-[var(--color-status-cancelled)]/50'
              : 'border-[var(--color-brand-orange)]/50 bg-[var(--color-brand-orange-50)]'
          }`}
        >
          {overdue && (
            <p>
              <strong>เลยกำหนดล้าง</strong> — ครบกำหนด{' '}
              {formatThaiDate(new Date(asset.nextPmDueAt!))}
            </p>
          )}
          {concern !== 'none' && (
            <p>
              <strong>
                ซ่อม {asset.recentRepairs} ครั้งใน 12 เดือน
                {concern === 'high' ? ' — ควรพิจารณาเปลี่ยนเครื่อง' : ''}
              </strong>
              {/* The flag is advice, not a verdict: budget and what the
                  technician can see are not in this database. */}
              <span className="block text-[12px] text-[var(--color-muted)]">
                เป็นข้อมูลประกอบ การตัดสินใจขึ้นกับสภาพจริงและงบลูกค้า
              </span>
            </p>
          )}
        </div>
      )}

      <section className="card p-3 text-[13px] space-y-1">
        <Row label="ยี่ห้อ / รุ่น" value={[asset.brand, asset.model].filter(Boolean).join(' ') || '—'} />
        <Row label="ซีเรียล" value={asset.serialNo ?? '—'} />
        <Row label="น้ำยา" value={asset.refrigerant ?? '—'} />
        <Row
          label="ติดตั้งเมื่อ"
          value={asset.installedAt ? formatThaiDate(new Date(asset.installedAt)) : '—'}
        />
        <Row label="รอบล้าง" value={`${asset.pmFrequencyPerYear} ครั้ง/ปี`} />
        <Row
          label="ล้างล่าสุด"
          value={asset.lastPmAt ? formatThaiDate(new Date(asset.lastPmAt)) : 'ยังไม่มีบันทึก'}
        />
        <Row
          label="ครบกำหนดถัดไป"
          value={asset.nextPmDueAt ? formatThaiDate(new Date(asset.nextPmDueAt)) : '—'}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">
          ประวัติ — ล้าง {asset.totalCleans} · ซ่อม {asset.totalRepairs}
        </h2>
        {asset.history.length === 0 ? (
          <p className="card p-4 text-center text-sm text-[var(--color-muted)]">
            ยังไม่มีประวัติงานของเครื่องนี้
          </p>
        ) : (
          <ul className="space-y-2">
            {asset.history.map((row) => (
              <li key={row.jobId} className="card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{row.jobNo}</span>
                  <span className="text-[13px] tabular-nums text-[var(--color-muted)]">
                    {row.scheduledDate ? formatThaiDate(new Date(row.scheduledDate)) : '—'}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--color-muted)]">
                  {row.category} · {row.status}
                </p>
                {row.note && <p className="text-[13px] mt-0.5">{row.note}</p>}
              </li>
            ))}
          </ul>
        )}

        {asset.historyTotal > asset.historyPerPage && (
          <div className="flex justify-between items-center mt-2 text-[13px]">
            {historyPage > 1 ? (
              <Link href={`/a/${id}?page=${historyPage - 1}`} className="underline">
                ก่อนหน้า
              </Link>
            ) : (
              <span />
            )}
            <span className="text-[var(--color-muted)]">
              หน้า {historyPage} / {Math.ceil(asset.historyTotal / asset.historyPerPage)}
            </span>
            {historyPage * asset.historyPerPage < asset.historyTotal ? (
              <Link href={`/a/${id}?page=${historyPage + 1}`} className="underline">
                ถัดไป
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>

      <p className="text-center text-[12px] text-[var(--color-muted)] pb-4">
        <Link href={`/assets/${id}`} className="underline text-[var(--color-brand-blue-600)]">
          เปิดในทะเบียนเครื่อง
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--color-surface-alt)] p-4">
      <div className="w-full max-w-lg mx-auto space-y-4">{children}</div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-muted)] shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
