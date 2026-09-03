import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import { healthReport } from '@/modules/platform/health.service';
import type { HealthLevel } from '@/modules/platform/health-rules';

export const dynamic = 'force-dynamic';

/**
 * The same report /api/health serves, for people rather than for a monitor.
 *
 * It exists because the endpoint answers "is it up" and this answers "what
 * should I do about it" — the two are different questions and the second one
 * needs the sentence, not the status code.
 */

const STYLE: Record<HealthLevel, { text: string; dot: string; card: string }> = {
  OK: {
    text: 'ปกติ',
    dot: 'bg-[var(--color-status-done)]',
    card: 'border-[var(--color-line)]',
  },
  WARN: {
    text: 'ควรดู',
    dot: 'bg-[var(--color-brand-orange)]',
    card: 'border-[var(--color-brand-orange)]/50 bg-[var(--color-brand-orange-50)]',
  },
  DOWN: {
    text: 'ใช้งานไม่ได้',
    dot: 'bg-[var(--color-status-cancelled)]',
    card: 'border-[var(--color-status-cancelled)]/50',
  },
};

export default async function SystemHealthPage() {
  await requirePermission('admin.config', '/settings/system');
  const report = await healthReport();
  const style = STYLE[report.level];

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl">สถานะระบบ</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          ตรวจเมื่อ {new Date(report.checkedAt).toLocaleString('th-TH')}
        </p>
      </div>

      <div className={`card p-4 border ${style.card}`}>
        <div className="flex items-center gap-2">
          <span className={`size-3 rounded-full ${style.dot}`} aria-hidden />
          <span className="text-lg font-semibold">{style.text}</span>
        </div>
        {/* "ควรดู" is not "พัง". Said here so nobody treats an amber row as an
            outage and stops reading the screen. */}
        <p className="text-[13px] text-[var(--color-muted)] mt-1">
          &ldquo;ควรดู&rdquo; คือเรื่องที่จะกลายเป็นปัญหาในอนาคต ไม่ใช่ระบบล่มตอนนี้
        </p>
      </div>

      <ul className="space-y-2">
        {report.checks.map((check) => (
          <li key={check.key} className={`card p-3 border ${STYLE[check.level].card}`}>
            <div className="flex items-start gap-2">
              <span
                className={`size-2.5 rounded-full mt-1.5 shrink-0 ${STYLE[check.level].dot}`}
                aria-hidden
              />
              <div>
                <p className="font-semibold text-sm">{check.labelTh}</p>
                <p className="text-[13px] text-[var(--color-muted)]">{check.detailTh}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="card p-4 space-y-3 text-[13px]">
        <div>
          <p className="font-semibold">เฝ้าระวังจากภายนอก</p>
          <p className="text-[var(--color-muted)]">
            ตั้ง UptimeRobot หรือ Better Stack ให้ยิง{' '}
            <code className="bg-[var(--color-surface-alt)] px-1 rounded">/api/health</code>{' '}
            ทุก 5 นาที แล้วแจ้งเตือนเมื่อได้ค่าที่ไม่ใช่ 200 —{' '}
            <strong>อย่าตั้งเป็น cron ของ Vercel เอง</strong>{' '}
            เพราะตัวตรวจที่รันอยู่ในระบบเดียวกับที่ถูกตรวจ จะเงียบสนิทในวันที่ระบบล่ม
            ซึ่งเป็นวันเดียวที่มันมีประโยชน์
          </p>
        </div>
        <div>
          <p className="font-semibold">สำรองข้อมูล</p>
          <p className="text-[var(--color-muted)]">
            Supabase แพ็กเกจ Free <strong>ไม่สำรองให้อัตโนมัติ</strong>{' '}
            สคริปต์ในโปรเจกต์จึงเป็นสำเนาเดียวที่มี · รัน{' '}
            <code className="bg-[var(--color-surface-alt)] px-1 rounded">npm run backup</code>{' '}
            · ไฟล์แนบและรูปถ่ายอยู่ใน Supabase Storage <strong>ไม่ได้อยู่ในไฟล์สำรองนี้</strong>{' '}
            ต้องคัดลอกแยก
          </p>
        </div>
        <div>
          <p className="font-semibold">วันหยุด</p>
          <p className="text-[var(--color-muted)]">
            วันจันทรคติ (มาฆบูชา วิสาขบูชา อาสาฬหบูชา เข้าพรรษา) เปลี่ยนทุกปี ระบบไม่เดาให้{' '}
            <Link
              href="/settings/holidays"
              className="underline text-[var(--color-brand-blue-600)]"
            >
              เพิ่มวันหยุด
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
