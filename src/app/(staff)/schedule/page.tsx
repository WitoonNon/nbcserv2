import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { ServiceCategory } from '@/generated/prisma';
import { getMonthCalendar, getQuotaRules } from '@/modules/scheduling/schedule.service';
import { QuotaCalendar } from '@/components/schedule/QuotaCalendar';
import { CATEGORY_LABEL } from '@/lib/labels';
import { toBuddhistYear } from '@/lib/date/buddhist';
import { formatMinutes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

interface Search {
  y?: string;
  m?: string;
  category?: string;
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getUTCFullYear();
  const month = Number(sp.m) || now.getUTCMonth() + 1;
  const category = (sp.category ?? 'CLEANING_PM') as ServiceCategory;

  let zone = null;
  let days = null;
  let rules: Awaited<ReturnType<typeof getQuotaRules>> = [];
  try {
    zone = await prisma.zone.findFirst({ where: { isActive: true } });
    if (zone) {
      days = await getMonthCalendar({ year, month, zoneId: zone.id, category });
      rules = await getQuotaRules();
    }
  } catch {
    days = null;
  }

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const qs = (o: { y: number; m: number }) => `?y=${o.y}&m=${o.m}&category=${category}`;

  const totalUsed = days?.reduce((s, d) => s + d.usedJobs, 0) ?? 0;
  const totalCap = days?.reduce((s, d) => s + (d.capacityJobs ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">ตารางงานและโควตา</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {TH_MONTHS[month - 1]} {toBuddhistYear(new Date(Date.UTC(year, 0, 1)))}
            {zone && ` · ${zone.nameTh}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <form method="get" className="flex items-center gap-1.5">
            <input type="hidden" name="y" value={year} />
            <input type="hidden" name="m" value={month} />
            <select name="category" defaultValue={category}
              className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white">
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-3 py-1.5 text-sm">
              ดู
            </button>
          </form>
          <Link href={`/schedule${qs(prev)}`}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white">←</Link>
          <Link href={`/schedule${qs(next)}`}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white">→</Link>
        </div>
      </div>

      {days === null ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
          <p className="text-sm">
            ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ปฏิทินโควตาจะแสดงทันทีเมื่อตั้งค่า DATABASE_URL
            แล้วรัน migrate + seed (ระบบจะสร้างช่องโควตาล่วงหน้า 90 วันให้อัตโนมัติ)
          </p>
        </div>
      ) : (
        <>
          {totalCap > 0 && (
            <div className="card p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <span className="text-[var(--color-muted)]">ใช้ไปทั้งเดือน </span>
                <strong>{totalUsed}</strong> / {totalCap} งาน
              </span>
              <span>
                <span className="text-[var(--color-muted)]">อัตราการใช้โควตา </span>
                <strong>{Math.round((totalUsed / totalCap) * 100)}%</strong>
              </span>
              <span className="text-[var(--color-muted)]">
                คลิกที่วันเพื่อดูรายละเอียดและเปิด/ปิดรับงาน
              </span>
            </div>
          )}

          <QuotaCalendar
            days={days}
            year={year}
            month={month}
            zoneId={zone?.id ?? ''}
            category={category}
          />

          <div className="card overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
              <h2 className="text-base">กฎโควตาที่ใช้อยู่</h2>
              <p className="text-[11px] text-[var(--color-muted)]">
                ช่องโควตารายวันสร้างจากกฎเหล่านี้ · ค่าว่าง (∞) หมายถึงไม่จำกัดในแกนนั้น
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                    <th className="px-3 py-2 font-normal">ชื่อกฎ</th>
                    <th className="px-3 py-2 font-normal">ประเภทงาน</th>
                    <th className="px-3 py-2 font-normal text-right">งาน/วัน</th>
                    <th className="px-3 py-2 font-normal text-right">เครื่อง/วัน</th>
                    <th className="px-3 py-2 font-normal text-right">เวลาช่าง/วัน</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{CATEGORY_LABEL[r.category]}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.maxJobs ?? '∞'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.maxUnits ?? '∞'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {r.maxTechnicianMinutes ? formatMinutes(r.maxTechnicianMinutes) : '∞'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
