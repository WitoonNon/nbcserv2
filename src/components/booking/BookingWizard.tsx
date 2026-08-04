'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { AcType, ServiceCategory } from '@/generated/prisma';
import {
  confirmBookingAction,
  holdSlotAction,
  loadCalendarAction,
  releaseHoldAction,
  type ConfirmState,
} from '@/app/(portal)/booking/actions';
import type { BookingCalendar, FeePreview } from '@/modules/scheduling/booking.service';
import { formatMinutes, formatTHB } from '@/lib/utils';

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

const CATEGORIES: { code: ServiceCategory; th: string; desc: string }[] = [
  { code: 'CLEANING_PM', th: 'ล้างแอร์ / PM', desc: 'ล้างทำความสะอาด บำรุงรักษาตามรอบ' },
  { code: 'INSPECTION_REPAIR', th: 'ตรวจเช็ค / แจ้งซ่อม', desc: 'ช่างเข้าตรวจหน้างาน วิเคราะห์อาการ' },
  { code: 'REPAIR', th: 'ซ่อม', desc: 'แก้ไขอาการเสีย เปลี่ยนอะไหล่' },
];

const AC_TYPES: { code: AcType; th: string }[] = [
  { code: 'WALL', th: 'แบบติดผนัง' },
  { code: 'CEILING', th: 'แบบแขวน' },
  { code: 'STANDING', th: 'แบบตู้ตั้ง' },
  { code: 'CASSETTE_4WAY', th: 'แบบฝังฝ้า 4 ทิศทาง' },
  { code: 'CONCEALED_SMALL', th: 'แบบซ่อนในฝ้า (เล็ก)' },
  { code: 'CONCEALED_LARGE', th: 'แบบซ่อนในฝ้า (ใหญ่)' },
  { code: 'OTHER', th: 'อื่นๆ / ไม่แน่ใจ' },
];

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center justify-center size-6 rounded-full text-xs font-semibold ${
          done
            ? 'bg-[var(--color-status-done)] text-white'
            : active
              ? 'bg-[var(--color-brand-orange)] text-white'
              : 'bg-[var(--color-line)] text-[var(--color-muted)]'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={`text-xs ${active ? '' : 'text-[var(--color-muted)]'}`}>{label}</span>
    </div>
  );
}

export function BookingWizard({
  initial,
  initialFee,
}: {
  initial: BookingCalendar | null;
  initialFee: FeePreview | null;
}) {
  const [category, setCategory] = useState<ServiceCategory>('CLEANING_PM');
  const [acType, setAcType] = useState<AcType>('WALL');
  const [unitCount, setUnitCount] = useState(1);

  const [calendar, setCalendar] = useState<BookingCalendar | null>(initial);
  const [fee, setFee] = useState<FeePreview | null>(initialFee);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [holdExpires, setHoldExpires] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holding, startHold] = useTransition();

  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmBookingAction, {});

  // The server already rendered the calendar for the default selection, so
  // fetching it again on mount would blank a calendar that is already correct
  // and push out the first meaningful paint for no gain. Refetch only once the
  // customer actually changes what they are booking — which genuinely changes
  // the answer, since a 40-unit job and a 1-unit job do not share free days.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setFee(initialFee);
      return;
    }

    setSelectedDate(null);
    setHoldExpires(null);
    startLoading(async () => {
      const res = await loadCalendarAction({ category, acType, unitCount });
      if (res.error) {
        setLoadError(res.error);
        return;
      }
      setLoadError(null);
      setCalendar(res.calendar);
      setFee(res.fee);
    });
  }, [category, acType, unitCount, initialFee]);

  async function pickDate(date: string) {
    if (!calendar) return;
    setHoldError(null);
    startHold(async () => {
      const res = await holdSlotAction({
        date,
        zoneId: calendar.zoneId,
        category,
        units: calendar.estimate.unitCount,
        minutes: calendar.estimate.totalMinutes,
      });
      if (!res.ok) {
        setHoldError(res.error ?? 'จองวันนี้ไม่สำเร็จ กรุณาเลือกวันอื่น');
        return;
      }
      setSelectedDate(date);
      setHoldExpires(res.expiresAt ?? null);
    });
  }

  // Success screen — the booking is committed, nothing left to edit.
  if (state.jobNo) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-3xl">✓</p>
        <h2 className="text-xl">จองคิวเรียบร้อยแล้ว</h2>
        <p className="text-sm">
          เลขที่งานของคุณคือ{' '}
          <strong className="font-mono text-[var(--color-brand-orange)]">{state.jobNo}</strong>
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          นัดหมายวันที่ {state.scheduledDate} · เจ้าหน้าที่จะติดต่อกลับเพื่อยืนยันช่วงเวลาอีกครั้ง
        </p>
        <div className="pt-2">
          <a
            href={`/track?jobNo=${encodeURIComponent(state.jobNo)}`}
            className="inline-block bg-[var(--color-brand-blue-600)] text-white rounded-[3px] px-5 py-2 text-sm font-semibold"
          >
            ติดตามสถานะงาน
          </a>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          กรุณาบันทึกเลขที่งานไว้ ใช้คู่กับเบอร์โทรเพื่อติดตามสถานะ
        </p>
      </div>
    );
  }

  const estimate = calendar?.estimate;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StepBadge n={1} label="เลือกงาน" active={!selectedDate} done={Boolean(selectedDate)} />
        <StepBadge n={2} label="เลือกวัน" active={!selectedDate} done={Boolean(selectedDate)} />
        <StepBadge n={3} label="ยืนยันข้อมูล" active={Boolean(selectedDate)} done={false} />
      </div>

      <section className="card p-4 space-y-3">
        <h2 className="text-base">1. งานที่ต้องการ</h2>

        <div className="grid gap-2 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCategory(c.code)}
              className={`border rounded-[3px] p-3 text-left transition-colors ${
                category === c.code
                  ? 'border-[var(--color-brand-orange)] ring-1 ring-[var(--color-brand-orange)] bg-[var(--color-brand-orange-50)]'
                  : 'border-[var(--color-line)] bg-white hover:border-[var(--color-brand-blue)]'
              }`}
            >
              <p className="font-semibold text-[var(--color-brand-teal)] text-sm">{c.th}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{c.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[13px] mb-1">ประเภทเครื่อง</span>
            <select
              value={acType}
              onChange={(e) => setAcType(e.target.value as AcType)}
              className={inputCls}
            >
              {AC_TYPES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.th}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">จำนวนเครื่อง</span>
            <input
              type="number"
              min={1}
              max={200}
              value={unitCount}
              onChange={(e) => setUnitCount(Math.max(1, Number(e.target.value) || 1))}
              className={inputCls}
            />
          </label>
        </div>

        {estimate && (
          <div className="text-[13px] bg-[var(--color-surface-alt)] rounded-[3px] p-3 space-y-0.5">
            <p>
              เวลาทำงานโดยประมาณ{' '}
              <strong>{formatMinutes(estimate.totalMinutes)}</strong>{' '}
              <span className="text-[var(--color-muted)]">
                ({estimate.minutesPerUnit} นาที × {estimate.unitCount} เครื่อง)
              </span>
            </p>
            {estimate.estimatedTotal !== null && (
              <p>
                ราคาโดยประมาณ <strong>{formatTHB(estimate.estimatedTotal)}</strong>{' '}
                <span className="text-[var(--color-muted)]">
                  — ราคาจริงยืนยันหน้างานตามสภาพเครื่อง
                </span>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="text-base">2. เลือกวันที่</h2>
          {calendar && (
            <span className="text-[11px] text-[var(--color-muted)]">
              เขต {calendar.zoneName}
            </span>
          )}
        </div>

        {loadError && (
          <div className="bg-[var(--color-brand-orange-50)] border border-[var(--color-brand-orange)]/40 rounded-[3px] p-3 text-sm">
            {loadError}
          </div>
        )}

        {loading && <p className="text-sm text-[var(--color-muted)]">กำลังตรวจสอบวันว่าง…</p>}

        {!loading && calendar && (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {calendar.days.map((d) => {
                const date = new Date(`${d.date}T00:00:00Z`);
                const closed = !d.available;
                const chosen = selectedDate === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={closed || holding}
                    onClick={() => pickDate(d.date)}
                    className={`border rounded-[3px] p-2 text-center transition-colors ${
                      chosen
                        ? 'border-[var(--color-brand-orange)] ring-1 ring-[var(--color-brand-orange)] bg-[var(--color-brand-orange-50)]'
                        : closed
                          ? 'opacity-40 cursor-not-allowed bg-[var(--color-surface-alt)] border-[var(--color-line)]'
                          : 'bg-white border-[var(--color-line)] hover:border-[var(--color-brand-orange)] cursor-pointer'
                    }`}
                  >
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {WEEKDAYS[date.getUTCDay()]}
                    </p>
                    <p className="font-[family-name:var(--font-heading)] text-lg leading-tight">
                      {date.getUTCDate()}
                    </p>
                    <p className="text-[9px] text-[var(--color-muted)] leading-tight">
                      {d.status === 'HOLIDAY'
                        ? 'วันหยุด'
                        : d.status === 'FULL'
                          ? 'เต็ม'
                          : closed
                            ? 'ปิดรับ'
                            : d.remainingJobs !== null
                              ? `เหลือ ${d.remainingJobs}`
                              : 'ว่าง'}
                    </p>
                  </button>
                );
              })}
            </div>

            {holdError && (
              <div className="bg-[var(--color-brand-orange-50)] border border-[var(--color-brand-orange)]/40 rounded-[3px] p-3 text-sm">
                {holdError}
              </div>
            )}

            <p className="text-[11px] text-[var(--color-muted)]">
              จองล่วงหน้าอย่างน้อย 3 วัน · วันที่เต็มโควตาหรือเป็นวันหยุดจะปิดรับอัตโนมัติ ·
              จำนวนเครื่องยิ่งมาก วันว่างยิ่งน้อย เพราะระบบคิดจากเวลาทำงานของทีมช่างจริง
            </p>
          </>
        )}
      </section>

      {selectedDate && calendar && (
        <form action={action} className="card p-4 space-y-3">
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="acType" value={acType} />
          <input type="hidden" name="zoneId" value={calendar.zoneId} />
          <input type="hidden" name="date" value={selectedDate} />
          <input type="hidden" name="unitCount" value={calendar.estimate.unitCount} />
          <input type="hidden" name="minutes" value={calendar.estimate.totalMinutes} />

          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h2 className="text-base">3. ข้อมูลผู้ติดต่อ</h2>
            <span className="text-[11px] text-[var(--color-muted)]">
              นัดวันที่ {selectedDate}
              {holdExpires && ' · กันคิวไว้ให้ 10 นาที'}
            </span>
          </div>

          {state.error && (
            <div className="bg-[var(--color-brand-orange-50)] border border-[var(--color-brand-orange)]/40 rounded-[3px] p-3 text-sm">
              {state.error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[13px] mb-1">ชื่อผู้ติดต่อ</span>
              <input name="customerName" required className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-[13px] mb-1">เบอร์โทร</span>
              <input name="phone" required inputMode="tel" placeholder="0812345678" className={inputCls} />
            </label>
          </div>

          <label className="block">
            <span className="block text-[13px] mb-1">
              อีเมล <span className="text-[var(--color-muted)]">(ไม่บังคับ)</span>
            </span>
            <input name="email" type="email" className={inputCls} />
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">ที่อยู่หน้างาน</span>
            <textarea name="address" required rows={2} className={inputCls} />
          </label>

          <label className="block">
            <span className="block text-[13px] mb-1">
              อาการ / รายละเอียดเพิ่มเติม{' '}
              <span className="text-[var(--color-muted)]">(ไม่บังคับ)</span>
            </span>
            <textarea
              name="problemDescription"
              rows={2}
              placeholder="เช่น ไม่เย็น มีน้ำหยด เสียงดัง"
              className={inputCls}
            />
          </label>

          {fee && (
            <div
              className={`rounded-[3px] p-3 text-sm border ${
                fee.waived
                  ? 'bg-green-50 border-green-300'
                  : 'bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40'
              }`}
            >
              {fee.waived ? (
                <p>
                  <strong>ไม่มีค่าเข้าตรวจเช็ค</strong> — {fee.waivedReason}
                </p>
              ) : (
                <p>
                  ค่าเข้าตรวจเช็คหน้างาน <strong>{formatTHB(fee.amount)}</strong>
                </p>
              )}
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{fee.note}</p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="feeAccepted"
              required
              className="size-4 accent-[var(--color-brand-orange)] mt-0.5"
            />
            <span>
              {fee && !fee.waived
                ? `ข้าพเจ้ารับทราบและยอมรับค่าเข้าตรวจเช็คหน้างาน ${formatTHB(fee.amount)}`
                : 'ข้าพเจ้ารับทราบเงื่อนไขการให้บริการ'}
              {fee?.creditedOnProceed && !fee.waived && (
                <span className="block text-[11px] text-[var(--color-muted)]">
                  หากตกลงซ่อมต่อ ค่าตรวจเช็คนี้จะถูกหักคืนเป็นส่วนลด
                </span>
              )}
            </span>
          </label>

          <div className="flex justify-between items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(null);
                setHoldExpires(null);
                void releaseHoldAction();
              }}
              className="text-sm text-[var(--color-muted)] underline underline-offset-2"
            >
              เปลี่ยนวันที่
            </button>
            <button
              disabled={pending}
              className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {pending ? 'กำลังยืนยัน…' : 'ยืนยันการจอง'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
