import Link from 'next/link';
import type { HrRequestStatus } from '@/generated/prisma';
import { requireUser } from '@/lib/auth/guard';
import { formatThaiDate } from '@/lib/date/buddhist';
import { currentEmployee, displayName } from '@/modules/hr/self-service';
import { myOvertimeRequests } from '@/modules/hr/overtime.service';
import { getLeavePolicy, leaveBalances, myLeaveRequests } from '@/modules/hr/leave.service';
import { LEAVE_LABEL_TH } from '@/modules/hr/leave-rules';
import { OVERTIME_LABEL_TH } from '@/modules/hr/payroll-rules';
import { NavIcon } from '@/components/ui/NavIcon';
import {
  CancelRequest,
  LeaveRequestForm,
  OvertimeRequestForm,
  RequestTabs,
} from '@/components/hr/RequestForms';

export const dynamic = 'force-dynamic';

/**
 * Where an employee asks for overtime and leave themselves.
 *
 * Outside the staff layout, like /clock: the people who use this most are
 * technicians on a phone, and a desktop sidebar built for a dispatch board is
 * in the way. It assumes nothing beyond being signed in and having a row in
 * the staff register — a labourer with no permissions at all can use it.
 *
 * This screen only ASKS. Every decision stays on /timesheet behind
 * `admin.config`, and the services refuse to let anyone touch a request that
 * is not their own or that has already been decided.
 */

const STATUS: Record<HrRequestStatus, { text: string; cls: string }> = {
  PENDING: { text: 'รอพิจารณา', cls: 'text-[var(--color-brand-orange)]' },
  APPROVED: { text: 'อนุมัติแล้ว', cls: 'text-[var(--color-status-done)]' },
  REJECTED: { text: 'ไม่อนุมัติ', cls: 'text-[var(--color-status-cancelled)]' },
  CANCELLED: { text: 'ยกเลิกแล้ว', cls: 'text-[var(--color-muted)]' },
};

/** Today in Bangkok as 'YYYY-MM-DD' — en-CA is the locale that formats it that way. */
function bangkokToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--color-surface-alt)] p-4">
      <div className="w-full max-w-lg mx-auto space-y-4">{children}</div>
    </main>
  );
}

export default async function MyRequestsPage() {
  await requireUser('/requests');
  const employee = await currentEmployee();

  if (!employee) {
    return (
      <Shell>
        <div className="card p-5 text-center space-y-2">
          <NavIcon name="employees" className="mx-auto size-12 text-[var(--color-muted)]" />
          <p className="font-semibold">บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน</p>
          <p className="text-sm text-[var(--color-muted)]">
            แจ้งฝ่ายบุคคลให้เพิ่มชื่อคุณในทะเบียนพนักงานก่อน จึงจะยื่นคำขอได้
          </p>
        </div>
      </Shell>
    );
  }

  // The database is the one thing this page cannot work around, and the
  // employee reading it can do nothing about it. Saying so beats a stack
  // trace, and beats an empty list that looks like their requests vanished.
  let data;
  try {
    const [policy, balances, overtime, leave] = await Promise.all([
      getLeavePolicy(),
      leaveBalances(employee.id),
      myOvertimeRequests(employee.id),
      myLeaveRequests(employee.id),
    ]);
    data = { policy, balances, overtime, leave };
  } catch {
    return (
      <Shell>
        <div className="card p-5 text-center space-y-2">
          <NavIcon name="offline" className="mx-auto size-12 text-[var(--color-muted)]" />
          <p className="font-semibold">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>
          <p className="text-sm text-[var(--color-muted)]">
            ลองใหม่อีกครั้งในอีกสักครู่ · ถ้ายังไม่ได้ให้แจ้งออฟฟิศ
          </p>
        </div>
      </Shell>
    );
  }

  const { policy, balances, overtime, leave } = data;
  const today = bangkokToday();
  const pendingCount =
    overtime.filter((r) => r.status === 'PENDING').length +
    leave.filter((r) => r.status === 'PENDING').length;

  return (
    <Shell>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">คำขอของฉัน</h1>
          <p className="text-[13px] text-[var(--color-muted)]">
            {displayName(employee)} · {employee.employeeCode}
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="text-[13px] text-[var(--color-brand-orange)] shrink-0">
            รอพิจารณา {pendingCount}
          </span>
        )}
      </header>

      {/* What is left, before they ask — not after they are told. Types with
          no entitlement are shown rather than hidden: a 0 that is visible is
          the answer to "why was my ลากิจ unpaid". */}
      <section className="card p-3">
        <h2 className="text-[13px] text-[var(--color-muted)] mb-2">
          สิทธิ์การลาคงเหลือปีนี้
        </h2>
        <ul className="grid grid-cols-3 gap-2 text-center">
          {balances.map((b) => (
            <li key={b.type} className="bg-[var(--color-surface-alt)] rounded-[3px] py-2">
              <span className="block text-[12px] text-[var(--color-muted)]">
                {LEAVE_LABEL_TH[b.type]}
              </span>
              <span className="block text-lg font-semibold tabular-nums">
                {b.remainingDays}
              </span>
              <span className="block text-[11px] text-[var(--color-muted)] tabular-nums">
                จาก {b.entitlementDays} วัน
              </span>
            </li>
          ))}
        </ul>
      </section>

      <RequestTabs
        overtime={<OvertimeRequestForm today={today} />}
        leave={
          <LeaveRequestForm
            today={today}
            policy={policy}
            employmentType={employee.employmentType}
            balances={balances}
          />
        }
      />

      <section>
        <h2 className="text-base font-semibold mb-2">คำขอโอทีที่ผ่านมา</h2>
        {overtime.length === 0 ? (
          <p className="card p-4 text-center text-sm text-[var(--color-muted)]">
            ยังไม่เคยยื่นคำขอโอที
          </p>
        ) : (
          <ul className="space-y-2">
            {overtime.map((r) => (
              <li key={r.id} className="card p-3 space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="tabular-nums text-sm">
                    {formatThaiDate(r.workDate)} · {Number(r.hours)} ชม.
                  </span>
                  <span className={`text-[13px] font-semibold ${STATUS[r.status].cls}`}>
                    {STATUS[r.status].text}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--color-muted)]">
                  {OVERTIME_LABEL_TH[r.kind]} — {r.reason}
                </p>
                {r.status === 'APPROVED' && r.approvedMultiplier && (
                  <p className="text-[13px]">
                    อนุมัติที่อัตรา{' '}
                    <span className="tabular-nums">{Number(r.approvedMultiplier)}</span> เท่า
                    {r.paidInPeriodId && ' · จ่ายในงวดแล้ว'}
                  </p>
                )}
                {/* The reason a refusal was given is the point of requiring
                    one — it belongs on the asker's screen, not only in the
                    office's record. */}
                {r.decisionNote && (
                  <p className="text-[13px] border-l-2 border-[var(--color-line)] pl-2">
                    หัวหน้าแจ้งว่า: {r.decisionNote}
                  </p>
                )}
                {r.status === 'PENDING' && <CancelRequest requestId={r.id} kind="overtime" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">คำขอลาที่ผ่านมา</h2>
        {leave.length === 0 ? (
          <p className="card p-4 text-center text-sm text-[var(--color-muted)]">
            ยังไม่เคยยื่นคำขอลา
          </p>
        ) : (
          <ul className="space-y-2">
            {leave.map((r) => (
              <li key={r.id} className="card p-3 space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="tabular-nums text-sm">
                    {formatThaiDate(r.fromDate)}
                    {Number(r.totalDays) > 1 && ` – ${formatThaiDate(r.toDate)}`} ·{' '}
                    {Number(r.totalDays)} วัน
                  </span>
                  <span className={`text-[13px] font-semibold ${STATUS[r.status].cls}`}>
                    {STATUS[r.status].text}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--color-muted)]">
                  {LEAVE_LABEL_TH[r.type]} — {r.reason}
                </p>
                {r.status === 'APPROVED' && (
                  <p className="text-[13px]">
                    ได้ค่าจ้าง <span className="tabular-nums">{Number(r.paidDays)}</span> วัน
                    {Number(r.unpaidDays) > 0 && (
                      <>
                        {' · '}
                        <span className="text-[var(--color-brand-orange)]">
                          ไม่ได้ค่าจ้าง{' '}
                          <span className="tabular-nums">{Number(r.unpaidDays)}</span> วัน
                        </span>
                      </>
                    )}
                  </p>
                )}
                {r.decisionNote && (
                  <p className="text-[13px] border-l-2 border-[var(--color-line)] pl-2">
                    หัวหน้าแจ้งว่า: {r.decisionNote}
                  </p>
                )}
                {r.status === 'PENDING' && <CancelRequest requestId={r.id} kind="leave" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[12px] text-[var(--color-muted)] text-center pb-4">
        <Link href="/clock" className="underline text-[var(--color-brand-blue-600)]">
          ลงเวลาเข้า-ออกงาน
        </Link>
      </p>
    </Shell>
  );
}
