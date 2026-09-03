import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import { loadReports } from '@/modules/reports/reports.service';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * The five reports the quotation sells, on one page — Phase 3.2.
 *
 * One page rather than five, because the questions they answer are asked
 * together: how much came in, was the quota set right, who did the work, and
 * which sites keep calling back.
 *
 * A table with no rows says why it has none. "ยังไม่มีข้อมูล" on its own is
 * read as a quiet month, and for parts it means something entirely different
 * — nobody has been recording them.
 */

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 text-center text-sm text-[var(--color-muted)]">{children}</div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[520px]">
        <thead>
          <tr className="bg-[var(--color-surface-alt)] text-left">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2 font-normal text-[12px] text-[var(--color-muted)] ${
                  i > 0 ? 'text-right' : ''
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission('report.read', '/reports');
  const params = await searchParams;

  const today = new Date();
  const to = parseDate(params.to, today);
  const from = parseDate(params.from, new Date(to.getTime() - 89 * 86_400_000));
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  let b;
  try {
    b = await loadReports({ from, to });
  } catch {
    return <Empty>ยังเชื่อมต่อฐานข้อมูลไม่ได้</Empty>;
  }

  const totalRevenue = b.revenueByCategory.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">รายงานและสถิติ</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {formatThaiDate(from, 'long')} – {formatThaiDate(to, 'long')}
          </p>
        </div>
        <a
          href={`/reports/export?from=${iso(from)}&to=${iso(to)}`}
          className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-3 py-2 text-sm font-semibold"
        >
          ดาวน์โหลด CSV
        </a>
      </div>

      {/* GET, so a range is a URL somebody can bookmark and send to the owner
          — which is what happens the moment a number is queried. */}
      <form className="card p-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ตั้งแต่</span>
          <input
            type="date"
            name="from"
            defaultValue={iso(from)}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white tabular-nums"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">ถึง</span>
          <input
            type="date"
            name="to"
            defaultValue={iso(to)}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white tabular-nums"
          />
        </label>
        <button className="border border-[var(--color-line)] bg-white rounded-[3px] px-3 py-1.5 text-sm">
          ดูรายงาน
        </button>
        {b.failed.length > 0 && (
          <span className="text-[12px] text-[var(--color-status-cancelled)]">
            บางรายงานดึงข้อมูลไม่สำเร็จ: {b.failed.join(', ')}
          </span>
        )}
      </form>

      <section>
        <h2 className="text-lg">รายได้</h2>
        <p className="text-[13px] text-[var(--color-muted)] mb-2">
          รวม <span className="tabular-nums font-semibold">{baht(totalRevenue)}</span> บาท ·
          นับจากรายการเรียกเก็บจริง หักใบลดหนี้แล้ว
        </p>
        {b.revenueByCategory.length === 0 ? (
          <Empty>ไม่มีรายการเรียกเก็บในช่วงนี้</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Table head={['ประเภทงาน', 'งาน', 'ยอด (บาท)']}>
              {b.revenueByCategory.map((r) => (
                <tr key={r.key} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">{r.labelTh}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.jobs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(r.amount)}</td>
                </tr>
              ))}
            </Table>
            <Table head={['เขต', 'งาน', 'ยอด (บาท)']}>
              {b.revenueByZone.map((r) => (
                <tr key={r.key} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">{r.labelTh}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.jobs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(r.amount)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg">อัตราการใช้โควตา</h2>
        {/* The two numbers say different things and the screen has to say so,
            or "40%" gets read as "cut the ceiling" on a bucket that is also
            selling out every Saturday. */}
        <p className="text-[13px] text-[var(--color-muted)] mb-2">
          เปอร์เซ็นต์ต่ำ = เพดานสูงเกิน · วันที่เต็มเยอะ = เพดานต่ำเกิน ดูคู่กันเสมอ
        </p>
        {b.quota.length === 0 ? (
          <Empty>ยังไม่มีปฏิทินโควตาในช่วงนี้</Empty>
        ) : (
          <Table head={['เขต', 'ประเภท', 'วัน', 'วันที่เต็ม', 'ความจุ', 'ใช้ไป', 'ใช้ไป %']}>
            {b.quota.map((r) => (
              <tr key={`${r.zoneName}-${r.category}`} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2">{r.zoneName}</td>
                <td className="px-3 py-2 text-right">{r.categoryLabelTh}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.fullDays > 0 ? 'text-[var(--color-brand-orange)]' : ''
                  }`}
                >
                  {r.fullDays}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.capacityJobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.usedJobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.utilisation === null ? (
                    <span className="text-[var(--color-muted)]">ไม่ได้ตั้งเพดาน</span>
                  ) : (
                    `${r.utilisation}%`
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-lg">ผลงานทีมช่าง</h2>
        <p className="text-[13px] text-[var(--color-muted)] mb-2">
          &ldquo;เปิดซ้ำ&rdquo; คืองานที่กลับมาสถานะกำลังทำหลังปิดไปแล้ว —
          เป็นตัวชี้วัดคร่าว ๆ งานที่ลูกค้าขอเพิ่มขอบเขตก็นับด้วย
        </p>
        {b.crews.length === 0 ? (
          <Empty>ยังไม่มีงานที่จ่ายให้ทีมในช่วงนี้</Empty>
        ) : (
          <Table head={['ทีม', 'งาน', 'ปิดแล้ว', 'เวลาเฉลี่ย', 'เปิดซ้ำ']}>
            {b.crews.map((r) => (
              <tr key={r.crewName} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2">{r.crewName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.jobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.closed}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.avgMinutes === null ? '—' : `${r.avgMinutes} นาที`}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.reopened > 0 ? 'text-[var(--color-brand-orange)]' : ''
                  }`}
                >
                  {r.reopened}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-lg">อะไหล่ที่ใช้บ่อย</h2>
        {b.parts.length === 0 ? (
          // An empty table here is a data-entry gap, not a quiet month, and
          // saying which is the only thing likely to get it fixed.
          <Empty>
            ยังไม่มีการบันทึกอะไหล่ในใบงานเลย — รายงานนี้จะมีข้อมูลเมื่อช่างเริ่มลงอะไหล่ที่ใช้
          </Empty>
        ) : (
          <Table head={['อะไหล่', 'จำนวน', 'มูลค่า (บาท)', 'ใช้ในงาน']}>
            {b.parts.map((r) => (
              <tr key={r.name} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(r.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.jobs}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-lg">ลูกค้าที่เรียกซ้ำ</h2>
        <p className="text-[13px] text-[var(--color-muted)] mb-2">
          นับเฉพาะงานซ่อม แยกตามหน้างาน — สาขาเดียวที่เรียกซ้ำสำคัญกว่าเครือที่มี 20 สาขา
        </p>
        {b.repeats.length === 0 ? (
          <Empty>ไม่มีหน้างานที่เรียกซ่อมเกิน 1 ครั้งในช่วงนี้</Empty>
        ) : (
          <Table head={['ลูกค้า', 'หน้างาน', 'ครั้ง', 'ล่าสุด']}>
            {b.repeats.map((r, i) => (
              <tr key={`${r.customerName}-${i}`} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2">{r.customerName}</td>
                <td className="px-3 py-2 text-right">{r.siteName ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.jobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatThaiDate(r.lastJobOn)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <p className="text-[12px] text-[var(--color-muted)] pb-4">
        ตัวเลขทั้งหมดคิดจากข้อมูลที่บันทึกในระบบ ·{' '}
        <Link href="/settings/system" className="underline text-[var(--color-brand-blue-600)]">
          สถานะระบบ
        </Link>
      </p>
    </div>
  );
}
