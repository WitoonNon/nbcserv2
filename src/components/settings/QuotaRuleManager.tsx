'use client';

import { useActionState, useState } from 'react';
import type { ServiceCategory } from '@/generated/prisma';
import {
  deleteQuotaRuleAction,
  rematerialiseAction,
  saveQuotaRuleAction,
  type QuotaState,
} from '@/app/(staff)/settings/quota/actions';
import { CATEGORY_LABEL } from '@/lib/labels';
import { formatMinutes } from '@/lib/utils';

export interface QuotaRuleView {
  id: string;
  name: string;
  category: ServiceCategory;
  zoneId: string | null;
  zoneName: string | null;
  weekdayMask: number;
  maxJobs: number | null;
  maxUnits: number | null;
  maxTechnicianMinutes: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  priority: number;
}

export interface ZoneOption {
  id: string;
  nameTh: string;
}

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

/** Bit 0 = Sunday, matching QuotaRule.weekdayMask and Date.getUTCDay(). */
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function weekdayLabel(mask: number): string {
  if (mask === 127) return 'ทุกวัน';
  if (mask === 126) return 'จ-ส';
  if (mask === 62) return 'จ-ศ';
  const days = WEEKDAYS.filter((_, i) => (mask & (1 << i)) !== 0);
  return days.length ? days.join(' ') : '—';
}

const BLANK: QuotaRuleView = {
  id: '',
  name: '',
  category: 'CLEANING_PM',
  zoneId: null,
  zoneName: null,
  weekdayMask: 126,
  maxJobs: null,
  maxUnits: null,
  maxTechnicianMinutes: null,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: null,
  priority: 0,
};

export function QuotaRuleManager({
  rules,
  zones,
}: {
  rules: QuotaRuleView[];
  zones: ZoneOption[];
}) {
  const [saveState, saveAction, savePending] = useActionState<QuotaState, FormData>(
    saveQuotaRuleAction,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<QuotaState, FormData>(
    deleteQuotaRuleAction,
    {},
  );
  const [matState, matAction, matPending] = useActionState<QuotaState, FormData>(
    rematerialiseAction,
    {},
  );

  const [editing, setEditing] = useState<QuotaRuleView | null>(null);

  const message = saveState.ok ?? deleteState.ok ?? matState.ok;
  const error = saveState.error ?? deleteState.error ?? matState.error;

  // Remount the form when the target rule changes so every defaultValue in it
  // is refreshed — without this, switching rules keeps the previous values.
  const formKey = editing?.id ?? 'new';
  const target = editing ?? BLANK;

  return (
    <div className="space-y-4">
      {error && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          {error}
        </div>
      )}
      {message && <div className="card p-3 bg-green-50 border-green-300 text-sm">{message}</div>}

      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base">คำนวณปฏิทินใหม่</h2>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5 max-w-xl">
              กฎที่แก้ไว้จะยังไม่มีผลกับปฏิทินจนกว่าจะกดปุ่มนี้ ระบบจะสร้างช่องโควตาล่วงหน้า 90 วัน
              <strong> งานที่ลูกค้าจองไว้แล้วไม่ถูกแตะ</strong> — ปรับเฉพาะเพดานความจุเท่านั้น
            </p>
          </div>
          <form action={matAction}>
            <button
              disabled={matPending}
              className="bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-4 py-2 text-sm font-semibold disabled:opacity-60 whitespace-nowrap"
            >
              {matPending ? 'กำลังคำนวณ…' : 'คำนวณปฏิทินใหม่'}
            </button>
          </form>
        </div>
      </div>

      <div className="card overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base">กฎโควตา</h2>
            <p className="text-[11px] text-[var(--color-muted)]">
              ช่องว่าง (∞) = ไม่จำกัดในแกนนั้น · เมื่อหลายกฎตรงกัน กฎที่ลำดับสูงกว่าชนะ
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="border border-[var(--color-line)] rounded-[3px] px-3 py-1.5 text-sm bg-white whitespace-nowrap"
          >
            + เพิ่มกฎใหม่
          </button>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                <th className="px-3 py-2 font-normal">ชื่อกฎ</th>
                <th className="px-3 py-2 font-normal">ประเภทงาน</th>
                <th className="px-3 py-2 font-normal">เขต</th>
                <th className="px-3 py-2 font-normal">วัน</th>
                <th className="px-3 py-2 font-normal text-right">งาน/วัน</th>
                <th className="px-3 py-2 font-normal text-right">เครื่อง/วัน</th>
                <th className="px-3 py-2 font-normal text-right">เวลาช่าง/วัน</th>
                <th className="px-3 py-2 font-normal text-right">ลำดับ</th>
                <th className="px-3 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[var(--color-muted)]">
                    ยังไม่มีกฎโควตา — เพิ่มกฎแรกด้านล่าง
                  </td>
                </tr>
              )}
              {rules.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-[var(--color-line)] last:border-0 ${
                    editing?.id === r.id ? 'bg-[var(--color-brand-orange-50)]' : ''
                  }`}
                >
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-xs">{CATEGORY_LABEL[r.category]}</td>
                  <td className="px-3 py-2 text-xs">{r.zoneName ?? 'ทุกเขต'}</td>
                  <td className="px-3 py-2 text-xs">{weekdayLabel(r.weekdayMask)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.maxJobs ?? '∞'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.maxUnits ?? '∞'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.maxTechnicianMinutes ? formatMinutes(r.maxTechnicianMinutes) : '∞'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.priority}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="text-xs text-[var(--color-brand-blue-600)] underline underline-offset-2"
                      >
                        แก้ไข
                      </button>
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          disabled={deletePending}
                          className="text-xs text-[var(--color-brand-orange)] underline underline-offset-2 disabled:opacity-60"
                        >
                          ยกเลิก
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form key={formKey} action={saveAction} className="card p-4 space-y-3">
        <input type="hidden" name="id" value={target.id} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base">{target.id ? `แก้ไขกฎ — ${target.name}` : 'เพิ่มกฎใหม่'}</h2>
          {target.id && (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs text-[var(--color-muted)] underline underline-offset-2"
            >
              ยกเลิกการแก้ไข
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[13px] mb-1">ชื่อกฎ</span>
            <input
              name="name"
              required
              defaultValue={target.name}
              placeholder="เช่น ล้างแอร์ วันธรรมดา"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">ประเภทงาน</span>
            <select name="category" defaultValue={target.category} className={inputCls}>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">เขตพื้นที่</span>
            <select name="zoneId" defaultValue={target.zoneId ?? ''} className={inputCls}>
              <option value="">ทุกเขต</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nameTh}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">ลำดับความสำคัญ</span>
            <input
              type="number"
              name="priority"
              step={1}
              defaultValue={target.priority}
              className={inputCls}
            />
            <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">
              เลขสูงกว่าชนะเมื่อมีหลายกฎตรงกับวันเดียวกัน
            </span>
          </label>
        </div>

        <div>
          <span className="block text-[13px] mb-1">วันที่รับงาน</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <label
                key={d}
                className="flex items-center gap-1.5 border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white cursor-pointer"
              >
                <input
                  type="checkbox"
                  name={`day${i}`}
                  defaultChecked={(target.weekdayMask & (1 << i)) !== 0}
                  className="size-4 accent-[var(--color-brand-orange)]"
                />
                {d}
              </label>
            ))}
          </div>
        </div>

        <fieldset className="border border-[var(--color-line)] rounded-[3px] p-3">
          <legend className="text-[13px] px-1">เพดานความจุต่อวัน</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="block text-[13px] mb-1">จำนวนงาน</span>
              <input
                type="number"
                name="maxJobs"
                min={1}
                step={1}
                placeholder="∞"
                defaultValue={target.maxJobs ?? ''}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[13px] mb-1">จำนวนเครื่อง</span>
              <input
                type="number"
                name="maxUnits"
                min={1}
                step={1}
                placeholder="∞"
                defaultValue={target.maxUnits ?? ''}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[13px] mb-1">เวลาช่าง (นาที)</span>
              <input
                type="number"
                name="maxTechnicianMinutes"
                min={1}
                step={30}
                placeholder="∞"
                defaultValue={target.maxTechnicianMinutes ?? ''}
                className={inputCls}
              />
              <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">
                480 = ทีมช่าง 1 ทีมเต็มวัน
              </span>
            </label>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-2">
            เว้นว่าง = ไม่จำกัดในแกนนั้น · ต้องกำหนดอย่างน้อย 1 แกน
          </p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[13px] mb-1">เริ่มมีผล</span>
            <input
              type="date"
              name="effectiveFrom"
              required
              defaultValue={target.effectiveFrom}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] mb-1">สิ้นสุด</span>
            <input
              type="date"
              name="effectiveTo"
              defaultValue={target.effectiveTo ?? ''}
              className={inputCls}
            />
            <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">
              เว้นว่าง = ใช้ตลอดไป
            </span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            disabled={savePending}
            className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {savePending ? 'กำลังบันทึก…' : target.id ? 'บันทึกการแก้ไข' : 'เพิ่มกฎ'}
          </button>
        </div>
      </form>
    </div>
  );
}
