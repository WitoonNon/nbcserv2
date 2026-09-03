'use client';

import { useActionState, useState } from 'react';
import { recordWageAction, deleteWageAction, type WageFormState } from '@/app/(staff)/employees/wage-actions';
import { EMPLOYMENT_TYPE_LABEL } from '@/lib/hr-labels';
import { formatThaiDate } from '@/lib/date/buddhist';
import type { WageChangeRow } from '@/modules/hr/wage.service';
import type { EmploymentType } from '@/generated/prisma';

/**
 * ประวัติการปรับค่าแรง.
 *
 * Behind the same permission as the wage itself, and rendered only when the
 * page has already established the reader may see one — the amounts are here
 * in full, so this component must never be reachable by someone who could not
 * open `SensitiveReveal`.
 *
 * The table is what the client asked for as a notes field. It is a table
 * because a note is overwritten by the next adjustment, and the thing they
 * wanted to keep was the sequence.
 */

const input =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

function money(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Delta({ from, to }: { from: number | null; to: number }) {
  if (from === null) return <span className="text-[var(--color-muted)]">ตั้งครั้งแรก</span>;
  const diff = to - from;
  if (diff === 0) return <span className="text-[var(--color-muted)]">เท่าเดิม</span>;

  const up = diff > 0;
  return (
    <span className={up ? 'text-[#16a34a]' : 'text-[#b42318]'}>
      {up ? '▲' : '▼'} {money(Math.abs(diff))}
      <span className="text-[var(--color-muted)] ml-1.5">จาก {money(from)}</span>
    </span>
  );
}

export function WageHistory({
  employeeId,
  history,
  currentType,
  canEdit,
}: {
  employeeId: string;
  history: WageChangeRow[];
  currentType: EmploymentType;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<WageFormState, FormData>(recordWageAction, {});
  const [delState, delAction, delPending] = useActionState<WageFormState, FormData>(
    deleteWageAction,
    {},
  );
  const [open, setOpen] = useState(false);

  const newestId = history[0]?.id;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base">ประวัติการปรับค่าแรง</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-[var(--color-brand-blue-600)]"
          >
            {open ? 'ยกเลิก' : '+ บันทึกการปรับค่าแรง'}
          </button>
        )}
      </div>

      {open && canEdit && (
        <form action={action} className="p-4 border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
          <input type="hidden" name="employeeId" value={employeeId} />
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">
                มีผลตั้งแต่วันที่ <span className="text-[var(--color-brand-orange)]">*</span>
              </span>
              <input name="effectiveFrom" type="date" required className={input} />
            </label>
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">
                ค่าแรงใหม่ (บาท) <span className="text-[var(--color-brand-orange)]">*</span>
              </span>
              <input name="wageRate" required inputMode="decimal" className={input} />
            </label>
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">ประเภทค่าจ้าง</span>
              <select name="employmentType" defaultValue={currentType} className={input}>
                {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">หมายเหตุ</span>
              <input name="reason" placeholder="ผ่านทดลองงาน / ปรับประจำปี" className={input} />
            </label>
          </div>

          {/* ใบเสนอราคาข้อ 5. Optional on purpose — almost everybody is on the
              statutory floor, and three boxes that must be filled would make
              the ordinary case the most work. */}
          <div className="grid gap-3 sm:grid-cols-3 mt-3">
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">
                อัตราโอทีวันทำงาน
              </span>
              <input
                name="otWorkdayMultiplier"
                type="number"
                step="0.1"
                min="1.5"
                inputMode="decimal"
                placeholder="ว่าง = 1.5 ตามกฎหมาย"
                className={input}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">
                อัตราทำงานวันหยุด
              </span>
              <input
                name="otHolidayWorkMultiplier"
                type="number"
                step="0.1"
                min="2"
                inputMode="decimal"
                placeholder="ว่าง = 2 ตามกฎหมาย"
                className={input}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] text-[var(--color-muted)] mb-1">
                อัตราโอทีวันหยุด
              </span>
              <input
                name="otHolidayOtMultiplier"
                type="number"
                step="0.1"
                min="3"
                inputMode="decimal"
                placeholder="ว่าง = 3 ตามกฎหมาย"
                className={input}
              />
            </label>
          </div>

          <p className="text-[11px] text-[var(--color-muted)] mt-2">
            ค่าแรงเดิมจะถูกบันทึกไว้อัตโนมัติ · การคำนวณเงินเดือนของงวดที่ผ่านมาจะยังใช้ค่าแรงเดิม
            ไม่ใช่ค่าใหม่นี้
          </p>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            อัตราโอทีเป็น<strong>ค่าตั้งต้น</strong>ตอนหัวหน้าอนุมัติ · ตั้งต่ำกว่ากฎหมายไม่ได้
            ระบบจะดันขึ้นให้เสมอ
          </p>

          <button
            disabled={pending}
            className="mt-3 bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </form>
      )}

      {(state.error || delState.error) && (
        <p className="px-4 py-2 text-[13px] text-[var(--color-status-cancelled)] border-b border-[var(--color-line)]">
          {state.error ?? delState.error}
        </p>
      )}

      {history.length === 0 ? (
        <p className="p-4 text-sm text-[var(--color-muted)]">
          ยังไม่มีประวัติการปรับค่าแรง —{' '}
          {canEdit
            ? 'บันทึกค่าแรงตั้งต้นไว้ก่อน จึงจะคำนวณเงินเดือนได้'
            : 'ยังคำนวณเงินเดือนของพนักงานคนนี้ไม่ได้'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[12px] text-[var(--color-muted)] border-b border-[var(--color-line)]">
                <th className="py-2 pl-4 pr-3 font-normal">มีผลตั้งแต่</th>
                <th className="py-2 pr-3 font-normal">ค่าแรง</th>
                <th className="py-2 pr-3 font-normal">เปลี่ยนแปลง</th>
                <th className="py-2 pr-3 font-normal">หมายเหตุ</th>
                <th className="py-2 pr-4 font-normal">บันทึกโดย</th>
                {canEdit && <th className="py-2 pr-4 font-normal" />}
              </tr>
            </thead>
            <tbody className="[&_td:first-child]:pl-4">
              {history.map((h) => (
                <tr key={h.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {formatThaiDate(new Date(h.effectiveFrom))}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {money(h.wageRate)}
                    <span className="text-[11px] text-[var(--color-muted)] ml-1">
                      /{EMPLOYMENT_TYPE_LABEL[h.employmentType] === 'รายวัน' ? 'วัน' : 'เดือน'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-[13px] whitespace-nowrap">
                    <Delta from={h.previousRate} to={h.wageRate} />
                  </td>
                  <td className="py-2.5 pr-3 text-[13px] text-[var(--color-muted)]">
                    {h.reason ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-[12px] text-[var(--color-muted)]">
                    {h.recordedByName}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 pr-4 text-right">
                      {/* Only the newest can go: an older row may already have
                          been paid against, and changing the basis of a payment
                          that has been made is worse than an odd-looking row. */}
                      {h.id === newestId && (
                        <form action={delAction} className="inline">
                          <input type="hidden" name="employeeId" value={employeeId} />
                          <input type="hidden" name="changeId" value={h.id} />
                          <button
                            disabled={delPending}
                            className="text-[12px] text-[var(--color-status-cancelled)] disabled:opacity-60"
                          >
                            ลบ
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
