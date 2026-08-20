import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guard';
import {
  notificationSummary,
  recentNotifications,
  type NotificationRow,
} from '@/modules/notifications/notification-report.service';
import { messageQuota } from '@/lib/notify/line';
import { env } from '@/lib/env';
import { formatThaiDate } from '@/lib/date/buddhist';

export const dynamic = 'force-dynamic';

/**
 * "The customer says they never got the message."
 *
 * That call is the reason this screen exists, so it is laid out to answer it
 * in the order the question is actually asked: did they link an account, did
 * we try, and what did LINE say.
 */

const TEMPLATE_LABEL: Record<string, string> = {
  JOB_CONFIRMED: 'ยืนยันการจอง',
  TECH_EN_ROUTE: 'ช่างกำลังเดินทาง',
  TECH_ON_SITE: 'ช่างถึงหน้างาน',
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${formatThaiDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Row({ row }: { row: NotificationRow }) {
  const failed = row.status === 'FAILED';
  // The sender marks a failure it believes could still succeed. That single
  // distinction is what separates "try again later" from "this will never
  // work, go and telephone them".
  const retryable = row.error?.startsWith('[retryable]') ?? false;

  return (
    <tr className="border-b border-[var(--color-line)] align-top">
      <td className="py-2 pr-3 whitespace-nowrap text-[var(--color-muted)]">
        {timeOf(row.createdAt)}
      </td>
      <td className="py-2 pr-3">{TEMPLATE_LABEL[row.templateCode ?? ''] ?? row.templateCode}</td>
      <td className="py-2 pr-3">
        {row.customerName ?? '—'}
        {row.jobNo && (
          <span className="block text-[11px] font-mono text-[var(--color-muted)]">{row.jobNo}</span>
        )}
      </td>
      <td className="py-2 pr-3 font-mono text-[11px] text-[var(--color-muted)]">
        {row.recipientHint}
      </td>
      <td className="py-2">
        {failed ? (
          <>
            <span
              className={
                'inline-block rounded-[3px] px-2 py-0.5 text-[11px] ' +
                (retryable
                  ? 'bg-[var(--color-brand-orange-50)] text-[var(--color-brand-orange-600)]'
                  : 'bg-red-50 text-[#b42318]')
              }
            >
              {retryable ? 'ส่งไม่ได้ — ลองใหม่ได้' : 'ส่งไม่ได้ถาวร'}
            </span>
            <span className="block text-[11px] text-[var(--color-muted)] mt-0.5 max-w-[46ch]">
              {row.error?.replace('[retryable] ', '')}
            </span>
          </>
        ) : (
          <span className="inline-block rounded-[3px] px-2 py-0.5 text-[11px] bg-[#06C755]/12 text-[#05833a]">
            ส่งแล้ว
          </span>
        )}
      </td>
    </tr>
  );
}

async function loadQuota() {
  // Free to call and consumes nothing, but it needs credentials — on a
  // deployment still running the console driver there may be none, and that is
  // not a fault worth showing an error for.
  try {
    if (!env().LINE_CHANNEL_ID || !env().LINE_CHANNEL_SECRET) return null;
    return await messageQuota();
  } catch {
    return null;
  }
}

export default async function NotificationsSettingsPage() {
  await requirePermission('admin.config', '/settings/notifications');

  const [summary, rows, quota] = await Promise.all([
    notificationSummary().catch(() => null),
    recentNotifications({ take: 60 }).catch(() => []),
    loadQuota(),
  ]);

  const driver = env().NOTIFY_DRIVER;

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/settings" className="text-sm text-[var(--color-brand-blue-600)]">
        ← กลับไปตั้งค่าระบบ
      </Link>

      <div>
        <h1 className="text-2xl">การแจ้งเตือนลูกค้า</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          ดูว่าข้อความไหนส่งออกไปแล้ว ข้อความไหนส่งไม่ได้ และเพราะอะไร
        </p>
      </div>

      {driver !== 'line' && (
        <div className="card p-4 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          <p className="font-semibold">ยังไม่ได้เปิดส่งจริง</p>
          <p className="text-[13px] text-[var(--color-muted)] mt-1">
            ตอนนี้ระบบตั้งเป็นโหมดทดสอบ ({driver}) ข้อความจะไม่ถูกส่งเข้า LINE จริง
            ลูกค้าที่ผูกบัญชีไว้แล้วจะยังไม่ได้รับอะไร
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="ลูกค้าที่ผูก LINE แล้ว" value={summary ? String(summary.linkedCustomers) : '—'} />
        <Stat label="ส่งสำเร็จ (30 วัน)" value={summary ? String(summary.sentLast30Days) : '—'} />
        <Stat
          label="ส่งไม่ได้ (30 วัน)"
          value={summary ? String(summary.failedLast30Days) : '—'}
          warn={Boolean(summary && summary.failedLast30Days > 0)}
        />
        <Stat
          label="โควตาคงเหลือเดือนนี้"
          value={quota ? (quota.remaining === null ? 'ไม่จำกัด' : String(quota.remaining)) : '—'}
          hint={quota?.limit ? `จาก ${quota.limit}` : undefined}
          warn={Boolean(quota?.remaining !== null && quota && quota.remaining! < 30)}
        />
      </div>

      {summary && summary.linkedCustomers === 0 && (
        <div className="card p-4 text-sm">
          <p>ยังไม่มีลูกค้าผูกบัญชี LINE</p>
          <p className="text-[13px] text-[var(--color-muted)] mt-1">
            ลูกค้าจะผูกบัญชีเองจากหน้ายืนยันการจอง การเป็นผู้ติดตามบัญชีบริษัทอย่างเดียวยังส่งข้อความหาไม่ได้
            เพราะระบบยังไม่รู้ว่าผู้ติดตามคนไหนคือลูกค้าคนไหน
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-line)]">
          <h2 className="text-base">ประวัติการส่งล่าสุด</h2>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-[var(--color-muted)]">ยังไม่มีการส่งข้อความ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[12px] text-[var(--color-muted)] border-b border-[var(--color-line)]">
                  <th className="py-2 pl-4 pr-3 font-normal">เวลา</th>
                  <th className="py-2 pr-3 font-normal">ข้อความ</th>
                  <th className="py-2 pr-3 font-normal">ลูกค้า / งาน</th>
                  <th className="py-2 pr-3 font-normal">ผู้รับ</th>
                  <th className="py-2 pr-4 font-normal">ผลลัพธ์</th>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
                {rows.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[var(--color-muted)]">
        ระบบไม่บันทึกรายการสำหรับลูกค้าที่ยังไม่ได้ผูกบัญชี LINE
        เพราะเป็นกรณีปกติของลูกค้าส่วนใหญ่ ถ้าบันทึกไว้ด้วยจะกลบรายการที่ส่งไม่ได้จริง ๆ จนหาไม่เจอ
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="card p-3">
      <p className="text-[12px] text-[var(--color-muted)]">{label}</p>
      <p
        className={
          'text-2xl mt-0.5 ' + (warn ? 'text-[var(--color-brand-orange-600)]' : 'text-[var(--color-brand-navy)]')
        }
      >
        {value}
        {hint && <span className="text-[12px] text-[var(--color-muted)] ml-1.5">{hint}</span>}
      </p>
    </div>
  );
}
