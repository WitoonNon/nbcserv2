'use client';

import { useActionState, useState } from 'react';
import type { CalendarDay } from '@/modules/scheduling/schedule.service';
import { toggleDayAction, type ScheduleState } from '@/app/(staff)/schedule/actions';
import { formatMinutes } from '@/lib/utils';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const STATUS_STYLE: Record<string, { cell: string; label: string }> = {
  OPEN: { cell: 'bg-white', label: 'เปิดรับ' },
  FULL: { cell: 'bg-red-50 border-red-200', label: 'เต็ม' },
  MANUALLY_CLOSED: { cell: 'bg-slate-100', label: 'ปิดรับ' },
  HOLIDAY: { cell: 'bg-amber-50 border-amber-200', label: 'วันหยุด' },
};

function Bar({ used, capacity }: { used: number; capacity: number | null }) {
  if (capacity === null || capacity === 0) return null;
  const pct = Math.min(100, Math.round((used / capacity) * 100));
  return (
    <div className="h-1 bg-[var(--color-line)] rounded-full overflow-hidden mt-1">
      <div
        className={`h-full ${pct >= 100 ? 'bg-[var(--color-status-cancelled)]' : pct > 80 ? 'bg-[var(--color-status-onsite)]' : 'bg-[var(--color-status-done)]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function QuotaCalendar({
  days,
  year,
  month,
  zoneId,
  category,
}: {
  days: CalendarDay[];
  year: number;
  month: number;
  zoneId: string;
  category: string;
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(toggleDayAction, {});
  const [selected, setSelected] = useState<CalendarDay | null>(null);

  const byIso = new Map(days.map((d) => [d.date, d]));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = first.getUTCDay();

  const cells: (CalendarDay | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      return byIso.get(iso) ?? null;
    }),
  ];

  return (
    <div className="space-y-3">
      {state.error && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] text-sm">{state.error}</div>
      )}
      {state.ok && <div className="card p-3 bg-green-50 border-green-300 text-sm">{state.ok}</div>}

      <div className="card p-3">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[11px] text-[var(--color-muted)] pb-1">{w}</div>
          ))}

          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[86px]" />;
            const style = STATUS_STYLE[day.status] ?? STATUS_STYLE.OPEN!;
            const dayNum = Number(day.date.slice(8, 10));
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelected(day)}
                className={`min-h-[86px] border rounded-[3px] p-1.5 text-left transition-colors ${style.cell} ${
                  selected?.date === day.date
                    ? 'border-[var(--color-brand-orange)] ring-1 ring-[var(--color-brand-orange)]'
                    : 'border-[var(--color-line)] hover:border-[var(--color-brand-blue)]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-[family-name:var(--font-heading)] text-[15px]">{dayNum}</span>
                  <span className="text-[9px] text-[var(--color-muted)]">{style.label}</span>
                </div>

                {day.isHoliday && (
                  <p className="text-[9px] text-amber-700 truncate">{day.holidayName}</p>
                )}

                {day.capacityJobs !== null && (
                  <>
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                      {day.usedJobs}/{day.capacityJobs} งาน
                    </p>
                    <Bar used={day.usedJobs} capacity={day.capacityJobs} />
                  </>
                )}
                {day.capacityMinutes !== null && (
                  <>
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                      {Math.round(day.usedMinutes / 60)}/{Math.round(day.capacityMinutes / 60)} ชม.
                    </p>
                    <Bar used={day.usedMinutes} capacity={day.capacityMinutes} />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="text-base">รายละเอียดวันที่ {selected.date}</h2>
            <button onClick={() => setSelected(null)} className="text-sm text-[var(--color-muted)]">ปิด</button>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="py-1.5 font-normal">ขนาดงาน</th>
                  <th className="py-1.5 font-normal">สถานะ</th>
                  <th className="py-1.5 font-normal text-right">งาน</th>
                  <th className="py-1.5 font-normal text-right">เวลาช่าง</th>
                </tr>
              </thead>
              <tbody>
                {selected.sizes.map((s) => (
                  <tr key={s.jobSize} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="py-1.5">{s.jobSize}</td>
                    <td className="py-1.5 text-xs">{STATUS_STYLE[s.status]?.label ?? s.status}</td>
                    <td className="py-1.5 text-right font-mono text-xs">
                      {s.usedJobs}/{s.capacityJobs ?? '∞'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs">
                      {formatMinutes(s.usedMinutes)} / {s.capacityMinutes ? formatMinutes(s.capacityMinutes) : '∞'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected.status !== 'HOLIDAY' && (
            <form action={action} className="mt-3 flex flex-wrap gap-2 items-end border-t border-[var(--color-line)] pt-3">
              <input type="hidden" name="date" value={selected.date} />
              <input type="hidden" name="zoneId" value={zoneId} />
              <input type="hidden" name="category" value={category} />
              <input type="hidden" name="status" value={selected.status === 'MANUALLY_CLOSED' ? 'OPEN' : 'MANUALLY_CLOSED'} />
              <label className="block flex-1 min-w-[220px]">
                <span className="block text-[11px] text-[var(--color-muted)] mb-0.5">
                  เหตุผล (บันทึกในประวัติการแก้ไขโควตา)
                </span>
                <input name="reason" required
                  placeholder={selected.status === 'MANUALLY_CLOSED' ? 'เช่น มีช่างว่างเพิ่ม' : 'เช่น ช่างลาหยุด / อบรม'}
                  className="w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white" />
              </label>
              <button disabled={pending}
                className={`rounded-[3px] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60 ${
                  selected.status === 'MANUALLY_CLOSED'
                    ? 'bg-[var(--color-status-done)]'
                    : 'bg-[var(--color-status-cancelled)]'
                }`}>
                {selected.status === 'MANUALLY_CLOSED' ? 'เปิดรับงานวันนี้' : 'ปิดรับงานวันนี้'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
