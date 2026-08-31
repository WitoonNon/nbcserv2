import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';
import { getScanPointPolicy, pendingReviews } from '@/modules/hr/timeclock.service';
import { ReviewPunch } from '@/components/hr/ReviewPunch';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

const VERDICT_LABEL: Record<string, { text: string; cls: string }> = {
  INSIDE: { text: 'อยู่ในพื้นที่', cls: 'text-[var(--color-status-done)]' },
  OUTSIDE: { text: 'อยู่นอกพื้นที่', cls: 'text-[var(--color-status-cancelled)]' },
  NO_FIX: { text: 'ไม่มีตำแหน่ง', cls: 'text-[var(--color-brand-orange)]' },
  UNRELIABLE: { text: 'ตำแหน่งไม่แม่นพอ', cls: 'text-[var(--color-brand-orange)]' },
};

function time(at: Date): string {
  return at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The supervisor's view of the time clock.
 *
 * Two things, in the order they matter: what still needs a decision, then what
 * happened today. A queue that is empty is the normal state and says so —
 * a screen that always looks busy teaches people to stop reading it.
 */
export default async function TimesheetPage() {
  await requirePermission('admin.config', '/timesheet');

  const [queue, policy, todayEntries] = await Promise.all([
    pendingReviews(),
    getScanPointPolicy(),
    prisma.timeClockEntry.findMany({
      where: {
        occurredAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 60,
      include: {
        employee: { select: { employeeCode: true, firstNameTh: true, lastNameTh: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">ลงเวลางาน</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {formatThaiDate(new Date(), 'long')}
          </p>
        </div>
        <Link
          href="/settings/timeclock"
          className="text-sm text-[var(--color-brand-blue-600)] underline"
        >
          จัดการ QR และจุดลงเวลา
        </Link>
      </div>

      {/* The coordinate decides who gets paid. While it is still the seeded
          guess, saying so here is the only thing likely to get it fixed. */}
      {policy.isAssumption && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-[13px]">
          <strong>พิกัดจุดลงเวลายังเป็นค่าประมาณ</strong> — ตั้งไว้ที่รัศมี{' '}
          {policy.radiusMetres} เมตร จากพิกัดที่ประมาณจากที่อยู่
          ควรไปยืนที่จุดติด QR จริงแล้วบันทึกพิกัดที่อ่านได้ จากนั้นลดรัศมีลง
        </div>
      )}

      <section>
        <h2 className="text-lg">รอตรวจสอบ {queue.length > 0 && `(${queue.length})`}</h2>
        {queue.length === 0 ? (
          <div className="card p-5 text-center text-sm text-[var(--color-muted)] mt-2">
            ไม่มีรายการค้าง — การลงเวลาทั้งหมดอยู่ในพื้นที่
          </div>
        ) : (
          <ul className="space-y-2 mt-2">
            {queue.map((entry) => (
              <li
                key={entry.id}
                className="card p-3 border-l-4 border-l-[var(--color-brand-orange)] space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-semibold">
                      {entry.employee.firstNameTh} {entry.employee.lastNameTh}
                    </span>
                    <span className="text-[11px] text-[var(--color-muted)] ml-2">
                      {entry.employee.employeeCode}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums">
                    {entry.kind === 'IN' ? 'เข้างาน' : 'ออกงาน'} {time(entry.occurredAt)} ·{' '}
                    {formatThaiDate(entry.occurredAt)}
                  </span>
                </div>

                <p className={`text-[13px] ${VERDICT_LABEL[entry.geofence]?.cls ?? ''}`}>
                  {VERDICT_LABEL[entry.geofence]?.text ?? entry.geofence}
                  {entry.distanceMetres !== null && ` · ห่างจุดลงเวลา ${entry.distanceMetres} ม.`}
                  {entry.accuracyMetres !== null &&
                    ` · ความแม่นยำ ±${Math.round(entry.accuracyMetres)} ม.`}
                </p>

                <ReviewPunch entryId={entry.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg">การลงเวลาวันนี้</h2>
        {todayEntries.length === 0 ? (
          <div className="card p-5 text-center text-sm text-[var(--color-muted)] mt-2">
            ยังไม่มีใครลงเวลาวันนี้
          </div>
        ) : (
          <div className="card overflow-x-auto mt-2">
            <table className="w-full text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="bg-[var(--color-surface-alt)] text-left">
                  <th className="px-3 py-2 font-normal text-[12px] text-[var(--color-muted)]">เวลา</th>
                  <th className="px-3 py-2 font-normal text-[12px] text-[var(--color-muted)]">พนักงาน</th>
                  <th className="px-3 py-2 font-normal text-[12px] text-[var(--color-muted)]">รายการ</th>
                  <th className="px-3 py-2 font-normal text-[12px] text-[var(--color-muted)]">ตำแหน่ง</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-[var(--color-line)]">
                    <td className="px-3 py-2 tabular-nums">{time(entry.occurredAt)}</td>
                    <td className="px-3 py-2">
                      {entry.employee.firstNameTh} {entry.employee.lastNameTh}
                    </td>
                    <td className="px-3 py-2">{entry.kind === 'IN' ? 'เข้างาน' : 'ออกงาน'}</td>
                    <td className={`px-3 py-2 ${VERDICT_LABEL[entry.geofence]?.cls ?? ''}`}>
                      {VERDICT_LABEL[entry.geofence]?.text ?? entry.geofence}
                      {entry.reviewedAt && (
                        <span className="text-[11px] text-[var(--color-muted)] ml-1">
                          · ตรวจแล้ว
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

      <p className="text-[12px] text-[var(--color-muted)]">
        การคำนวณชั่วโมงทำงาน โอที และเงินเดือน อยู่ระหว่างพัฒนา —
        หน้านี้บันทึกและตรวจสอบการลงเวลาเท่านั้น
      </p>
    </div>
  );
}
