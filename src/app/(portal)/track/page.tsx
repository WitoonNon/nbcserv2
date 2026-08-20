import type { Metadata } from 'next';
import Link from 'next/link';
import { trackJob } from '@/modules/jobs/tracking.service';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CATEGORY_LABEL } from '@/lib/labels';
import { formatThaiDate } from '@/lib/date/buddhist';
import { formatTHB } from '@/lib/utils';
import type { ServiceCategory } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

/**
 * The empty form is a useful page to find; a result is somebody's job number,
 * phone number and address sitting in a URL.
 *
 * robots.txt already refuses to crawl the query form, but that only asks a
 * crawler not to look. Someone pasting their tracking link into a public group
 * is a different route in, and this is what stops that page being kept.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const isResult = Boolean(sp.jobNo || sp.phone);

  return {
    title: 'ติดตามสถานะงาน',
    ...(isResult ? { robots: { index: false, follow: false } } : {}),
  };
}

const inputCls =
  'w-full border border-[var(--color-line)] rounded-[3px] px-3 py-2 text-sm bg-white ' +
  'focus:outline-none focus:border-[var(--color-brand-blue)]';

interface Search {
  jobNo?: string;
  phone?: string;
  /** Where the LINE link attempt ended up. Set by /api/line/callback. */
  line?: string;
}

/**
 * What to say after a LINE link attempt.
 *
 * `declined` is deliberately not phrased as a failure. A customer who pressed
 * cancel on LINE's consent screen made a choice, and their booking is
 * unaffected — telling them something went wrong would be both untrue and a
 * reason to worry about a job that is perfectly fine.
 */
const LINE_RESULT: Record<string, { tone: 'ok' | 'warn'; title: string; detail: string }> = {
  ok: {
    tone: 'ok',
    title: 'เชื่อมต่อ LINE เรียบร้อยแล้ว',
    detail: 'เราจะแจ้งเตือน 2 ครั้ง — ตอนยืนยันการจอง และตอนช่างถึงหน้างานครับ',
  },
  already: {
    tone: 'ok',
    title: 'บัญชี LINE นี้เชื่อมต่อไว้อยู่แล้ว',
    detail: 'ไม่ต้องทำอะไรเพิ่มครับ งานนี้จะแจ้งเตือนไปที่บัญชีเดิม',
  },
  declined: {
    tone: 'warn',
    title: 'ยังไม่ได้เชื่อมต่อ LINE',
    detail:
      'การจองของคุณเรียบร้อยดีทุกอย่างครับ ถ้าอยากรับแจ้งเตือน กดเชื่อมต่อใหม่ได้จากหน้ายืนยันการจอง',
  },
  failed: {
    tone: 'warn',
    title: 'เชื่อมต่อ LINE ไม่สำเร็จ',
    detail: 'การจองไม่ได้รับผลกระทบครับ ลองใหม่อีกครั้ง หรือโทร 02-000-7332 ต่อ 1-3',
  },
  expired: {
    tone: 'warn',
    title: 'ลิงก์เชื่อมต่อหมดอายุแล้ว',
    detail: 'กรุณาจองใหม่หรือติดต่อเจ้าหน้าที่ เพื่อขอลิงก์เชื่อมต่ออีกครั้งครับ',
  },
  unavailable: {
    tone: 'warn',
    title: 'ระบบแจ้งเตือน LINE ยังไม่พร้อมใช้งาน',
    detail: 'การจองของคุณเรียบร้อยดีครับ เจ้าหน้าที่จะติดต่อกลับทางโทรศัพท์ตามปกติ',
  },
};

/**
 * Public job tracking.
 *
 * A GET form rather than a server action so the result is a shareable,
 * refreshable URL — a customer who bookmarks it can come back tomorrow. The
 * phone number in the query string is the price of that; it is the customer's
 * own number, entered by them, and the alternative is asking them to re-type it
 * on every visit.
 */
export default async function TrackPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const jobNo = (sp.jobNo ?? '').trim();
  const phone = (sp.phone ?? '').trim();
  const searched = Boolean(jobNo && phone);
  const lineResult = sp.line ? LINE_RESULT[sp.line] : undefined;

  let job = null;
  let dbDown = false;
  if (searched) {
    try {
      job = await trackJob({ jobNo, phone });
    } catch {
      dbDown = true;
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl">ติดตามสถานะงาน</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          กรอกเลขที่งานและเบอร์โทรที่ใช้แจ้งงาน เพื่อดูความคืบหน้า
        </p>
      </div>

      <form method="get" className="card p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="block text-[13px] mb-1">เลขที่งาน</span>
          <input name="jobNo" required defaultValue={jobNo} placeholder="JOB-2569-0001" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-[13px] mb-1">เบอร์โทร</span>
          <input name="phone" required inputMode="tel" defaultValue={phone} placeholder="0812345678" className={inputCls} />
        </label>
        <button className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-6 py-2 text-sm font-semibold h-[38px]">
          ค้นหา
        </button>
      </form>

      {lineResult && (
        <div
          className={
            'card p-4 text-sm ' +
            (lineResult.tone === 'ok'
              ? 'bg-[#06C755]/8 border-[#06C755]/40'
              : 'bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40')
          }
        >
          <p className="font-semibold">
            {lineResult.tone === 'ok' ? '✓ ' : ''}
            {lineResult.title}
          </p>
          <p className="text-[var(--color-muted)] mt-1 text-[13px]">{lineResult.detail}</p>
        </div>
      )}

      {dbDown && (
        <div className="card p-4 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง หรือโทร 02-000-7332 ต่อ 1-3
        </div>
      )}

      {searched && !dbDown && !job && (
        <div className="card p-4 text-sm">
          <p>ไม่พบงานที่ตรงกับข้อมูลนี้</p>
          <p className="text-[var(--color-muted)] mt-1 text-[13px]">
            ตรวจสอบว่าเลขที่งานและเบอร์โทรตรงกับที่ใช้ตอนแจ้งงาน
            หากยังไม่พบ กรุณาโทร 02-000-7332 ต่อ 1-3
          </p>
        </div>
      )}

      {job && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[11px] text-[var(--color-muted)]">เลขที่งาน</p>
                <p className="font-mono text-lg text-[var(--color-brand-orange)]">{job.jobNo}</p>
              </div>
              <StatusBadge status={job.status} />
            </div>

            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 mt-3 text-sm">
              <div>
                <dt className="text-[11px] text-[var(--color-muted)]">ประเภทงาน</dt>
                <dd>
                  {CATEGORY_LABEL[job.category as ServiceCategory]} · {job.unitCount} เครื่อง
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-muted)]">วันนัดหมาย</dt>
                <dd>
                  {job.scheduledDate
                    ? formatThaiDate(new Date(`${job.scheduledDate}T00:00:00Z`), 'long')
                    : 'รอเจ้าหน้าที่นัดหมาย'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] text-[var(--color-muted)]">หน้างาน</dt>
                <dd>{job.address}</dd>
              </div>
              {job.problemDescription && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-[var(--color-muted)]">อาการที่แจ้ง</dt>
                  <dd>{job.problemDescription}</dd>
                </div>
              )}
              {job.crewName && (
                <div>
                  <dt className="text-[11px] text-[var(--color-muted)]">ทีมช่างที่รับผิดชอบ</dt>
                  <dd>{job.crewName}</dd>
                </div>
              )}
            </dl>
          </div>

          {job.charges.length > 0 && (
            <div className="card overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
                <h2 className="text-base">ค่าใช้จ่ายที่เกิดขึ้นแล้ว</h2>
              </header>
              <table className="w-full text-sm">
                <tbody>
                  {job.charges.map((c, i) => (
                    <tr key={i} className="border-b border-[var(--color-line)]">
                      <td className="px-4 py-2">{c.description}</td>
                      <td
                        className={`px-4 py-2 text-right font-mono text-xs ${
                          c.amount < 0 ? 'text-[var(--color-status-done)]' : ''
                        }`}
                      >
                        {formatTHB(c.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--color-surface-alt)]">
                    <td className="px-4 py-2 font-semibold">ยอดสุทธิ</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">
                      {formatTHB(job.balance)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-[var(--color-muted)]">
                ยอดนี้เป็นค่าใช้จ่ายที่บันทึกแล้ว ราคางานซ่อมจริงจะแจ้งอีกครั้งหลังช่างตรวจหน้างาน
              </p>
            </div>
          )}

          <div className="card p-4">
            <h2 className="text-base mb-3">ความคืบหน้า</h2>
            <ol className="space-y-3">
              {job.timeline.map((e, i) => {
                const at = new Date(e.at);
                const latest = i === job.timeline.length - 1;
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`size-2.5 rounded-full mt-1.5 ${
                          latest ? 'bg-[var(--color-brand-orange)]' : 'bg-[var(--color-line)]'
                        }`}
                      />
                      {!latest && <span className="w-px flex-1 bg-[var(--color-line)] my-1" />}
                    </div>
                    <div className="pb-1">
                      <StatusBadge status={e.status} />
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">
                        {formatThaiDate(at)}{' '}
                        {at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {e.note && <p className="text-[13px] mt-0.5">{e.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="card p-4 text-sm">
            <p className="font-semibold">ต้องการเลื่อนนัดหรือยกเลิก?</p>
            <p className="text-[13px] text-[var(--color-muted)] mt-1">
              กรุณาโทร 02-000-7332 ต่อ 1-3 หรือ 097-094-4419 พร้อมแจ้งเลขที่งาน{' '}
              <strong className="font-mono">{job.jobNo}</strong> — เจ้าหน้าที่จะจัดคิวใหม่ให้
              และคืนโควตาวันเดิมให้ลูกค้าท่านอื่นทันที
            </p>
          </div>
        </div>
      )}

      {!searched && (
        <p className="text-[13px] text-[var(--color-muted)]">
          ยังไม่มีเลขที่งาน?{' '}
          <Link href="/booking" className="underline underline-offset-2">
            จองคิวช่าง
          </Link>
        </p>
      )}
    </div>
  );
}
