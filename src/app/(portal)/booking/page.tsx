import { prisma } from '@/lib/db';
import { getAvailability } from '@/modules/scheduling/quota.service';
import { formatTHB } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Customer booking calendar.
 *
 * The governing rule: a customer never sees a date whose quota is exhausted.
 * The calendar IS the quota, rendered — closed days are visibly closed rather
 * than failing at submit time.
 */
async function loadCalendar() {
  try {
    const zone = await prisma.zone.findFirst({ where: { code: 'BKK-METRO' } });
    if (!zone) return null;

    // @client-confirm C6 — minimum lead time assumed 3 days.
    const from = new Date(Date.now() + 3 * 86_400_000);
    const to = new Date(Date.now() + 31 * 86_400_000);

    const days = await getAvailability({
      from,
      to,
      zoneId: zone.id,
      category: 'CLEANING_PM',
      jobSize: 'S',
      requiredUnits: 1,
      requiredMinutes: 30,
    });
    return days;
  } catch {
    return null;
  }
}

const CATEGORIES = [
  { code: 'CLEANING_PM', th: 'ล้างแอร์ / PM', desc: 'ล้างทำความสะอาด บำรุงรักษาตามรอบ', from: 500 },
  { code: 'INSPECTION_REPAIR', th: 'ตรวจเช็ค / แจ้งซ่อม', desc: 'ช่างเข้าตรวจหน้างาน วิเคราะห์อาการ', from: 500 },
  { code: 'REPAIR', th: 'ซ่อม', desc: 'แก้ไขอาการเสีย เปลี่ยนอะไหล่', from: 800 },
];

export default async function BookingPage() {
  const days = await loadCalendar();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">จองคิวช่าง</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          เลือกประเภทงานและวันที่ต้องการ ระบบจะแสดงเฉพาะวันที่ยังรับงานได้
        </p>
      </div>

      <section>
        <h2 className="text-base mb-2">1. เลือกประเภทงาน</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c, i) => (
            <button
              key={c.code}
              type="button"
              className={`card p-4 text-left transition-colors ${
                i === 0
                  ? 'border-[var(--color-brand-orange)] ring-1 ring-[var(--color-brand-orange)]'
                  : 'hover:border-[var(--color-brand-blue)]'
              }`}
            >
              <p className="font-semibold text-[var(--color-brand-teal)]">{c.th}</p>
              <p className="text-xs text-[var(--color-muted)] mt-1 min-h-[32px]">{c.desc}</p>
              <p className="text-sm mt-2 text-[var(--color-brand-orange)] font-semibold">
                เริ่มต้น {formatTHB(c.from)}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base mb-2">2. เลือกวันที่</h2>

        {days === null ? (
          <div className="card p-6 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40">
            <p className="text-sm">
              ยังเชื่อมต่อฐานข้อมูลไม่ได้ ปฏิทินจะแสดงวันว่างจริงหลังรัน migrate + seed
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {days.map((d) => {
                const date = new Date(d.date);
                const closed = !d.available;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={closed}
                    className={`card p-2 text-center ${
                      closed
                        ? 'opacity-40 cursor-not-allowed bg-[var(--color-surface-alt)]'
                        : 'hover:border-[var(--color-brand-orange)] cursor-pointer'
                    }`}
                  >
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][date.getUTCDay()]}
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
            <p className="text-xs text-[var(--color-muted)] mt-3">
              จองล่วงหน้าอย่างน้อย 3 วัน · วันที่เต็มโควตาหรือเป็นวันหยุดจะปิดรับอัตโนมัติ
            </p>
          </>
        )}
      </section>
    </div>
  );
}
