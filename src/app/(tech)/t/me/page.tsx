import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { logoutAction } from '@/app/login/actions';
import { prisma } from '@/lib/db';
import { formatThaiDate } from '@/lib/date/buddhist';
import { EMPLOYMENT_TYPE_LABEL } from '@/lib/hr-labels';

export const dynamic = 'force-dynamic';

/**
 * The technician's own screen.
 *
 * Built because the tab bar pointed at /t/profile and /t/history, neither of
 * which existed — two buttons that returned 404 to anybody who pressed them.
 * The bar also had no way to sign out, which matters more here than on a desk:
 * this runs on a personal phone, and somebody leaving the company with a live
 * session and no visible way to end it is a real problem rather than a tidiness
 * one.
 *
 * What a technician actually wants from a screen about themselves is narrow:
 * am I clocked in, what did I work this week, and how do I get out. Their pay
 * is deliberately not here — that is the owner's to disclose, not a thing to
 * leave on a screen that gets handed around a van.
 */

function startOfWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Monday, because a Thai working week is discussed that way.
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * 86_400_000);
}

export default async function TechMePage() {
  const user = await requireUser('/t/me');

  const employee = await prisma.employee
    .findFirst({
      where: { userId: user.id },
      select: {
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        nickname: true,
        position: true,
        department: true,
        employmentType: true,
        hiredAt: true,
      },
    })
    .catch(() => null);

  const from = startOfWeek(new Date());
  const punches = employee
    ? await prisma.timeClockEntry
        .findMany({
          where: { employee: { userId: user.id }, occurredAt: { gte: from } },
          orderBy: { occurredAt: 'desc' },
          take: 20,
          select: { kind: true, occurredAt: true, needsReview: true },
        })
        .catch(() => [])
    : [];

  return (
    <div className="p-4 space-y-4">
      <div className="card p-4">
        <h1 className="text-xl">
          {employee
            ? `${employee.firstNameTh} ${employee.lastNameTh}`
            : user.name}
          {employee?.nickname && (
            <span className="text-[var(--color-muted)] text-base"> ({employee.nickname})</span>
          )}
        </h1>
        {employee ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">รหัสพนักงาน</dt>
              <dd className="font-mono">{employee.employeeCode}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">ตำแหน่ง</dt>
              <dd>{employee.position}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">ประเภทค่าจ้าง</dt>
              <dd>{EMPLOYMENT_TYPE_LABEL[employee.employmentType]}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--color-muted)]">วันเริ่มงาน</dt>
              <dd>{employee.hiredAt ? formatThaiDate(employee.hiredAt) : '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-[var(--color-muted)] mt-2">
            บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน — แจ้งฝ่ายบุคคลเพื่อผูกให้
            จึงจะลงเวลาและยื่นคำขอได้
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-baseline justify-between">
          <h2 className="text-base">การลงเวลาสัปดาห์นี้</h2>
          <Link href="/clock" className="text-sm text-[var(--color-brand-blue-600)]">
            ลงเวลา
          </Link>
        </div>
        {punches.length === 0 ? (
          <p className="p-4 text-sm text-[var(--color-muted)]">
            สัปดาห์นี้ยังไม่มีการลงเวลา
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {punches.map((p, i) => (
              <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm">
                  {p.kind === 'IN' ? 'เข้างาน' : 'ออกงาน'}
                  {p.needsReview && (
                    <span className="ml-2 text-[11px] text-[var(--color-brand-orange-600)]">
                      รอหัวหน้าตรวจ
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-[var(--color-muted)] whitespace-nowrap">
                  {formatThaiDate(p.occurredAt)}{' '}
                  {p.occurredAt.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Bangkok',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/requests"
        className="card p-4 flex items-center justify-between active:bg-[var(--color-brand-sky-50)]"
      >
        <span className="text-sm">ขอโอที / ขอลา</span>
        <span className="text-[var(--color-brand-blue-600)]">›</span>
      </Link>

      <form action={logoutAction}>
        <button className="w-full border border-[var(--color-line)] rounded-[3px] py-3 text-sm text-[var(--color-status-cancelled)] active:bg-[#fdeaea]">
          ออกจากระบบ
        </button>
      </form>
    </div>
  );
}
