import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/guard';
import { ClockPunch } from '@/components/hr/ClockPunch';
import { entriesForDay } from '@/modules/hr/timeclock.service';
import { NavIcon } from '@/components/ui/NavIcon';

export const dynamic = 'force-dynamic';

/**
 * Where the QR code on the wall leads.
 *
 * Outside the staff layout on purpose: this is opened by a phone camera in a
 * doorway, not navigated to from a sidebar, and everything on screen that is
 * not the button is in the way. It is also the one screen a labourer who never
 * opens anything else will use, so it assumes nothing about permissions beyond
 * being signed in and having an employee record.
 */
export default async function ClockPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const user = await requireUser(t ? `/clock?t=${encodeURIComponent(t)}` : '/clock');

  const employee = await prisma.employee.findFirst({
    where: { userId: user.id },
    select: { id: true, firstNameTh: true, lastNameTh: true, nickname: true },
  });

  const shell = (children: React.ReactNode) => (
    <main className="min-h-dvh bg-[var(--color-surface-alt)] p-4 flex items-center justify-center">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );

  if (!employee) {
    return shell(
      <div className="card p-5 text-center space-y-2">
        <NavIcon name="employees" className="mx-auto size-12 text-[var(--color-muted)]" />
        <p className="font-semibold">บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน</p>
        <p className="text-sm text-[var(--color-muted)]">
          แจ้งฝ่ายบุคคลให้เพิ่มชื่อคุณในทะเบียนพนักงานก่อน จึงจะลงเวลาได้
        </p>
      </div>,
    );
  }

  if (!t) {
    // Reached without scanning. Says what to do rather than showing a dead
    // button — the token only ever comes from the code on the wall.
    return shell(
      <div className="card p-5 text-center space-y-2">
        <NavIcon name="camera" className="mx-auto size-12 text-[var(--color-muted)]" />
        <p className="font-semibold">สแกน QR ที่จุดลงเวลา</p>
        <p className="text-sm text-[var(--color-muted)]">
          เปิดกล้องมือถือแล้วส่องที่รหัส QR ตรงจุดลงเวลา หน้านี้จะเปิดขึ้นเอง
        </p>
        <Link href="/requests" className="text-sm text-[var(--color-brand-blue-600)] underline">
          ขอโอที / ขอลา
        </Link>
      </div>,
    );
  }

  const today = await entriesForDay(employee.id, new Date());
  const name = employee.nickname
    ? `${employee.firstNameTh} (${employee.nickname})`
    : `${employee.firstNameTh} ${employee.lastNameTh}`;

  return shell(
    <div className="space-y-4">
      <ClockPunch token={t} employeeName={name} />

      {today.length > 0 && (
        <div className="card p-3">
          <p className="text-[11px] text-[var(--color-muted)] mb-1.5">วันนี้บันทึกไว้แล้ว</p>
          <ul className="space-y-1">
            {today.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span>{entry.kind === 'IN' ? 'เข้างาน' : 'ออกงาน'}</span>
                <span className="tabular-nums">
                  {entry.occurredAt.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {entry.needsReview && (
                    <span className="ml-2 text-[11px] text-[var(--color-brand-orange)]">
                      รอตรวจสอบ
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The one screen every employee already opens, so it is where the
          self-service page has to be reachable from — nobody is going to
          type a URL in a doorway. */}
      <p className="text-center">
        <Link href="/requests" className="text-sm underline text-[var(--color-brand-blue-600)]">
          ขอโอที / ขอลา
        </Link>
      </p>
    </div>,
  );
}
