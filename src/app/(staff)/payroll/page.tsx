import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';
import { listPeriods } from '@/modules/hr/payroll.service';
import { formatBaht } from '@/modules/hr/payroll-rules';
import {
  CalculateButton,
  ClosePeriodButton,
  OpenPeriodForm,
} from '@/components/hr/PayrollControls';

export const dynamic = 'force-dynamic';

/** This month, as the Buddhist-era code the period list uses. */
function currentPeriodCode(): string {
  const now = new Date();
  return `${now.getFullYear() + 543}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Running the month.
 *
 * The screen is built around the one irreversible action on it. Everything a
 * period needs before closing — who could not be calculated, what the total
 * comes to, whether any overtime had to be raised to the legal minimum — is
 * on the page before the close button, because those are the things somebody
 * would otherwise find out afterwards.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission('payroll.read', '/payroll');
  const { period: selectedId } = await searchParams;

  const periods = await listPeriods();
  const active = selectedId
    ? periods.find((p) => p.id === selectedId)
    : periods.find((p) => p.status === 'DRAFT') ?? periods[0];

  const lines = active
    ? await prisma.payrollLine.findMany({
        where: { periodId: active.id },
        orderBy: [{ blockedReason: 'desc' }, { netSatang: 'desc' }],
        include: {
          employee: {
            select: { employeeCode: true, firstNameTh: true, lastNameTh: true, position: true },
          },
        },
      })
    : [];

  const blocked = lines.filter((l) => l.blockedReason);
  const payable = lines.filter((l) => !l.blockedReason);
  const total = payable.reduce((sum, l) => sum + l.netSatang, 0);
  const anyRaised = payable.some((l) => l.raisedToLegalMinimum);

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl">เงินเดือน</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          คำนวณจากค่าแรงที่มีผลในงวดนั้น โอทีที่อนุมัติแล้ว และวันลาที่ไม่ได้รับค่าจ้าง
        </p>
      </div>

      <div className="card p-3 text-[13px] bg-[var(--color-surface-alt)]">
        <strong>ยอดที่แสดงยังไม่ได้หักประกันสังคมและภาษี</strong> —
        ระบบยังไม่ได้คำนวณสองรายการนี้ เพราะยังไม่ได้รับอัตราจากลูกค้า
        สลิปที่ออกจะเขียนกำกับไว้ด้วย
      </div>

      <section className="card p-4">
        <OpenPeriodForm suggestedCode={currentPeriodCode()} />
      </section>

      {periods.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <Link
              key={p.id}
              href={`/payroll?period=${p.id}`}
              className={`px-3 py-1.5 rounded-[3px] text-sm border ${
                p.id === active?.id
                  ? 'bg-[var(--color-brand-navy)] text-white border-[var(--color-brand-navy)]'
                  : 'bg-white border-[var(--color-line)]'
              }`}
            >
              <span className="tabular-nums">{p.code}</span>
              <span className="text-[11px] ml-1.5 opacity-80">
                {p.status === 'CLOSED' ? 'ปิดแล้ว' : 'ร่าง'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {!active ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">
          ยังไม่มีงวดเงินเดือน — เปิดงวดแรกด้านบน
        </div>
      ) : (
        <section className="space-y-3">
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold tabular-nums">
                งวด {active.code}
                <span className="text-[11px] text-[var(--color-muted)] ml-2">
                  {active.status === 'CLOSED' ? 'ปิดแล้ว — ตัวเลขล็อก' : 'ร่าง — ยังแก้ได้'}
                </span>
              </p>
              <p className="text-sm text-[var(--color-muted)] mt-0.5">
                จ่ายได้ {payable.length} คน · ยอดรวม{' '}
                <span className="tabular-nums font-semibold text-[var(--color-ink)]">
                  {formatBaht(total)}
                </span>{' '}
                บาท
              </p>
            </div>

            {active.status === 'DRAFT' && (
              <div className="flex flex-wrap items-center gap-2">
                <CalculateButton periodId={active.id} />
                {lines.length > 0 && (
                  <ClosePeriodButton periodId={active.id} blockedCount={blocked.length} />
                )}
              </div>
            )}
          </div>

          {anyRaised && (
            <div className="card p-3 text-[13px] bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
              มีรายการโอทีที่ระบุอัตราต่ำกว่าที่กฎหมายกำหนด{' '}
              <strong>ระบบปรับขึ้นเป็นอัตราขั้นต่ำให้แล้ว</strong> — ยอดที่เห็นคืออัตราที่ถูกกฎหมาย
            </div>
          )}

          {blocked.length > 0 && (
            <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-status-cancelled)]/50">
              <p className="text-sm font-semibold text-[var(--color-status-cancelled)]">
                คำนวณไม่ได้ {blocked.length} คน — ถ้าปิดงวดตอนนี้ คนเหล่านี้จะไม่ได้รับเงิน
              </p>
              <ul className="text-[13px] mt-1 space-y-0.5">
                {blocked.map((l) => (
                  <li key={l.id}>
                    {l.employee.firstNameTh} {l.employee.lastNameTh} — {l.blockedReason}{' '}
                    <Link
                      href={`/employees/${l.employeeId}`}
                      className="underline text-[var(--color-brand-blue-600)]"
                    >
                      แก้ค่าแรง
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="card p-6 text-center text-sm text-[var(--color-muted)]">
              ยังไม่ได้คำนวณงวดนี้ — กด “คำนวณใหม่”
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[720px]">
                <thead>
                  <tr className="bg-[var(--color-surface-alt)] text-left">
                    {['พนักงาน', 'ค่าแรง', 'วันทำงาน', 'ลาไม่รับค่าจ้าง', 'โอที (ชม.)', 'ค่าโอที', 'สุทธิ'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 font-normal text-[12px] text-[var(--color-muted)]"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {payable.map((line) => (
                    <tr key={line.id} className="border-t border-[var(--color-line)]">
                      <td className="px-3 py-2">
                        {line.employee.firstNameTh} {line.employee.lastNameTh}
                        <span className="block text-[11px] text-[var(--color-muted)]">
                          {line.employee.employeeCode} · {line.employee.position}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatBaht(Number(line.wageRate) * 100)}
                        <span className="text-[11px] text-[var(--color-muted)] ml-1">
                          {line.employmentType === 'MONTHLY' ? '/เดือน' : '/วัน'}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{Number(line.daysWorked)}</td>
                      <td className="px-3 py-2 tabular-nums">{Number(line.unpaidLeaveDays)}</td>
                      <td className="px-3 py-2 tabular-nums">{Number(line.overtimeHours)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatBaht(line.overtimeSatang)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        {formatBaht(line.netSatang)}
                        {line.raisedToLegalMinimum && (
                          <span
                            title="มีโอทีที่ถูกปรับขึ้นเป็นอัตราขั้นต่ำตามกฎหมาย"
                            className="ml-1 text-[var(--color-brand-orange)]"
                          >
                            *
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
