import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';
import { timesheetFor } from '@/modules/hr/timeclock.service';
import { minutesToHours, type DayRow } from '@/modules/hr/worktime';
import { inScope, visibleEmployeeIds } from '@/modules/hr/scope';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * One person's hours, day by day — ใบเสนอราคาข้อ 2.
 *
 * The month is the unit because the payroll period is, and the question this
 * screen exists to settle is always "why is this figure on the payslip".
 *
 * ## Broken pairings are the point, not an edge case
 *
 * A day where somebody punched in and never out contributes no minutes, and
 * that day is exactly what this screen is opened to find. It is listed in
 * orange with the reason rather than shown as a quiet zero — a zero reads as
 * a day off, which is a different and wrong statement about somebody's pay.
 */

const PROBLEM_TH: Record<NonNullable<DayRow['problem']>, string> = {
  OPEN: 'ลงเวลาเข้าแล้วไม่ได้ลงออก',
  TOO_LONG: 'ช่วงเวลายาวผิดปกติ (เกิน 16 ชม.)',
  ORPHAN_OUT: 'ลงเวลาออกโดยไม่มีเข้า',
};

function monthRange(code: string): { from: Date; to: Date; label: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(code);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    // Day 0 of the next month is the last day of this one — no leap-year
    // table, and February comes out right without special-casing.
    to: new Date(Date.UTC(year, month, 0)),
    label: `${month.toString().padStart(2, '0')}/${year + 543}`,
  };
}

function time(at: Date | null): string {
  return at
    ? at.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : '—';
}

export default async function EmployeeTimesheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { employeeId } = await params;
  const user = await requirePermission('hr.approve', `/timesheet/${employeeId}`);

  // ใบเสนอราคาข้อ 7 — a supervisor reads their own crew's hours and nobody
  // else's. Checked here and not only on the queue screen.
  const scope = await visibleEmployeeIds(user);
  if (!inScope(scope, employeeId)) notFound();

  const { month } = await searchParams;
  const now = new Date();
  const range =
    monthRange(month ?? '') ??
    monthRange(
      `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`,
    )!;

  let employee;
  let sheet;
  try {
    [employee, sheet] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          employeeCode: true,
          firstNameTh: true,
          lastNameTh: true,
          nickname: true,
          employmentType: true,
        },
      }),
      timesheetFor(employeeId, range.from, range.to),
    ]);
  } catch {
    return (
      <div className="card p-5 max-w-xl text-center text-sm text-[var(--color-muted)]">
        ยังเชื่อมต่อฐานข้อมูลไม่ได้
      </div>
    );
  }
  if (!employee) notFound();

  const iso = `${range.from.getUTCFullYear()}-${(range.from.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
  const prev = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth() - 1, 1));
  const next = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth() + 1, 1));
  const code = (d: Date) =>
    `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`;

  const problems = sheet.days.filter((d) => d.problem !== null).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">
            {employee.firstNameTh} {employee.lastNameTh}
            {employee.nickname && (
              <span className="text-base text-[var(--color-muted)]"> ({employee.nickname})</span>
            )}
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {employee.employeeCode} ·{' '}
            {employee.employmentType === 'MONTHLY' ? 'รายเดือน' : 'รายวัน'} · เดือน {range.label}
          </p>
        </div>
        <Link href="/timesheet" className="text-sm text-[var(--color-brand-blue-600)] underline">
          กลับหน้าลงเวลา
        </Link>
      </div>

      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/timesheet/${employeeId}?month=${code(prev)}`}
          className="text-sm text-[var(--color-brand-blue-600)] underline"
        >
          ← เดือนก่อน
        </Link>
        <form className="flex items-end gap-2">
          <input
            type="month"
            name="month"
            defaultValue={iso}
            className="border border-[var(--color-line)] rounded-[3px] px-2.5 py-1.5 text-sm bg-white tabular-nums"
          />
          <button className="border border-[var(--color-line)] bg-white rounded-[3px] px-3 py-1.5 text-sm">
            ดู
          </button>
        </form>
        <Link
          href={`/timesheet/${employeeId}?month=${code(next)}`}
          className="text-sm text-[var(--color-brand-blue-600)] underline"
        >
          เดือนถัดไป →
        </Link>
      </div>

      <section className="card p-3">
        <ul className="grid grid-cols-3 gap-2 text-center">
          <li className="bg-[var(--color-surface-alt)] rounded-[3px] py-2">
            <span className="block text-[12px] text-[var(--color-muted)]">วันที่มาทำงาน</span>
            <span className="block text-xl font-semibold tabular-nums">
              {sheet.summary.daysPresent}
            </span>
          </li>
          <li className="bg-[var(--color-surface-alt)] rounded-[3px] py-2">
            <span className="block text-[12px] text-[var(--color-muted)]">ชั่วโมงรวม</span>
            <span className="block text-xl font-semibold tabular-nums">
              {minutesToHours(sheet.summary.minutesWorked)}
            </span>
          </li>
          <li
            className={`rounded-[3px] py-2 ${
              problems > 0
                ? 'bg-[var(--color-brand-orange-50)] border border-[var(--color-brand-orange)]/40'
                : 'bg-[var(--color-surface-alt)]'
            }`}
          >
            <span className="block text-[12px] text-[var(--color-muted)]">วันที่ต้องตรวจ</span>
            <span className="block text-xl font-semibold tabular-nums">{problems}</span>
          </li>
        </ul>
        {problems > 0 && (
          // Said plainly: these days are why the hours look low, and nobody
          // should have to work that out from the table.
          <p className="text-[12px] text-[var(--color-muted)] mt-2">
            วันที่จับคู่เข้า-ออกไม่ได้จะไม่ถูกนับชั่วโมง — ระบบไม่เดาเวลาที่ไม่มีใครบันทึกไว้
            ต้องให้หัวหน้าตรวจและแก้ที่ต้นทาง
          </p>
        )}
      </section>

      {sheet.days.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">
          ไม่มีการลงเวลาในเดือนนี้
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[480px]">
            <thead>
              <tr className="bg-[var(--color-surface-alt)] text-left">
                {['วันที่', 'เข้า', 'ออก', 'ชั่วโมง', 'หมายเหตุ'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 font-normal text-[12px] text-[var(--color-muted)] ${
                      i > 0 && i < 4 ? 'text-right' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.days.map((day) => (
                <tr
                  key={day.day}
                  className={`border-t border-[var(--color-line)] ${
                    day.problem ? 'bg-[var(--color-brand-orange-50)]' : ''
                  }`}
                >
                  <td className="px-3 py-2 tabular-nums">
                    {formatThaiDate(new Date(`${day.day}T00:00:00Z`))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{time(day.firstIn)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{time(day.lastOut)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {day.minutes > 0 ? minutesToHours(day.minutes) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[13px] text-[var(--color-brand-orange)]">
                    {day.problem ? PROBLEM_TH[day.problem] : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-[var(--color-muted)] pb-4">
        ชั่วโมงนี้คือเวลาที่จับคู่เข้า-ออกได้จริง ·{' '}
        <strong>พนักงานรายเดือนไม่ถูกหักเงินอัตโนมัติจากตัวเลขนี้</strong> —
        ใช้ประกอบการตัดสินใจของออฟฟิศ ดูที่{' '}
        <Link href="/payroll" className="underline text-[var(--color-brand-blue-600)]">
          หน้าเงินเดือน
        </Link>
      </p>
    </div>
  );
}
