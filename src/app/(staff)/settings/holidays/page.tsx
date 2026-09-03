import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';
import { formatThaiDate } from '@/lib/date/buddhist';
import { AddHoliday, RemoveHoliday } from '@/components/settings/HolidayEditor';

export const dynamic = 'force-dynamic';

/**
 * The holidays the system cannot work out for itself.
 *
 * Grouped by year, because the question that matters is never "what are the
 * holidays" but "has anybody entered next year's yet" — a year with no rows
 * is not an empty list, it is a business that quietly opens on วันวิสาขบูชา.
 */
export default async function HolidaysPage() {
  await requirePermission('admin.config', '/settings/holidays');

  const today = new Date();
  const thisYear = today.getUTCFullYear();

  let rows;
  try {
    rows = await prisma.holiday.findMany({
      where: { date: { gte: new Date(Date.UTC(thisYear, 0, 1)) } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, nameTh: true },
    });
  } catch {
    return (
      <div className="card p-5 max-w-xl text-center text-sm text-[var(--color-muted)]">
        ยังเชื่อมต่อฐานข้อมูลไม่ได้
      </div>
    );
  }

  const byYear = new Map<number, typeof rows>();
  for (const row of rows) {
    const year = row.date.getUTCFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), row]);
  }

  const nextYear = thisYear + 1;
  const nextYearMissing = !byYear.has(nextYear);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">วันหยุดประจำปี</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            ปิดรับงานในวันเหล่านี้ตอนสร้างปฏิทินโควตา
          </p>
        </div>
        <Link
          href="/settings/system"
          className="text-sm text-[var(--color-brand-blue-600)] underline"
        >
          สถานะระบบ
        </Link>
      </div>

      {/* The warning that is the point of this screen. A missing year is
          invisible everywhere else until a technician is dispatched to it. */}
      {nextYearMissing && (
        <div className="card p-3 border border-[var(--color-brand-orange)]/50 bg-[var(--color-brand-orange-50)] text-[13px]">
          <strong>ยังไม่มีวันหยุดของปี {nextYear + 543}</strong> — ถ้าไม่ใส่
          ระบบจะรับงานทุกวันในปีหน้ารวมวันหยุด · วันจันทรคติ (มาฆบูชา วิสาขบูชา อาสาฬหบูชา
          เข้าพรรษา) ต้องขอจากลูกค้าหรือดูประกาศราชการ <strong>ระบบเดาให้ไม่ได้</strong>
        </div>
      )}

      <AddHoliday defaultYear={thisYear} />

      {[...byYear.entries()].map(([year, list]) => (
        <section key={year}>
          <h2 className="text-lg">
            {year + 543} <span className="text-sm text-[var(--color-muted)]">({list.length} วัน)</span>
          </h2>
          <ul className="card divide-y divide-[var(--color-line)] mt-2">
            {list.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">
                  <span className="tabular-nums">{formatThaiDate(row.date)}</span> · {row.nameTh}
                </span>
                <RemoveHoliday id={row.id} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
