import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';
import { getQuotaRules } from '@/modules/scheduling/schedule.service';
import { dateOnly } from '@/modules/scheduling/quota.service';
import {
  QuotaRuleManager,
  type QuotaRuleView,
  type ZoneOption,
} from '@/components/settings/QuotaRuleManager';

export const dynamic = 'force-dynamic';

async function load() {
  try {
    const [rules, zones] = await Promise.all([
      getQuotaRules(),
      prisma.zone.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    ]);

    const ruleViews: QuotaRuleView[] = rules.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      zoneId: r.zoneId,
      zoneName: r.zone?.nameTh ?? null,
      weekdayMask: r.weekdayMask,
      maxJobs: r.maxJobs,
      maxUnits: r.maxUnits,
      maxTechnicianMinutes: r.maxTechnicianMinutes,
      effectiveFrom: dateOnly(r.effectiveFrom).toISOString().slice(0, 10),
      effectiveTo: r.effectiveTo ? dateOnly(r.effectiveTo).toISOString().slice(0, 10) : null,
      priority: r.priority,
    }));

    const zoneOptions: ZoneOption[] = zones.map((z) => ({ id: z.id, nameTh: z.nameTh }));
    return { ruleViews, zoneOptions };
  } catch {
    return null;
  }
}

export default async function QuotaSettingsPage() {
  await requirePermission('admin.config', '/settings/quota');
  const data = await load();

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl">โควตาการรับงานรายวัน</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          กำหนดว่าแต่ละวันรับงานได้เท่าไร แยกตามประเภทงานและเขตพื้นที่ ·
          เมื่อเต็มแล้วระบบจะปิดไม่ให้ลูกค้าเลือกวันนั้นอัตโนมัติ
        </p>
      </div>

      <div className="card p-4 text-sm space-y-2 bg-[var(--color-surface-alt)]">
        <h2 className="text-base">ระบบคิดจากกำลังช่างที่ใช้จริง</h2>
        <p className="text-[13px]">
          โควตาคุม <strong>3 แกนพร้อมกัน</strong> — จำนวนงาน · จำนวนเครื่อง · <strong>เวลาช่าง</strong>
          {' '}แกนสุดท้ายสำคัญที่สุด เพราะงานล้างแอร์ติดผนัง 10 เครื่อง
          กับงานแอร์ซ่อนในฝ้า 10 เครื่อง กินกำลังช่างต่างกันสามเท่า
          การกำหนดแค่ &ldquo;วันละ 10 งาน&rdquo; จึงไม่สะท้อนความจริง
        </p>
        <div className="overflow-x-auto">
          <table className="text-[13px] min-w-[420px]">
            <caption className="text-left text-[11px] text-[var(--color-muted)] mb-1">
              ตัวอย่าง: ตั้งเวลาช่าง 480 นาที (ทีมช่าง 1 ทีมเต็มวัน)
            </caption>
            <tbody>
              <tr className="border-b border-[var(--color-line)]">
                <td className="py-1.5 pr-4">ล้างแอร์ติดผนัง 30 นาที/เครื่อง</td>
                <td className="py-1.5 pr-4 font-mono text-xs">480 ÷ 30</td>
                <td className="py-1.5">รับได้ 16 เครื่อง</td>
              </tr>
              <tr className="border-b border-[var(--color-line)]">
                <td className="py-1.5 pr-4">แอร์ซ่อนในฝ้าใหญ่ 90 นาที/เครื่อง</td>
                <td className="py-1.5 pr-4 font-mono text-xs">480 ÷ 90</td>
                <td className="py-1.5">รับได้ 5 เครื่อง</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4">งานโรงงาน 40 เครื่อง × 90 นาที</td>
                <td className="py-1.5 pr-4 font-mono text-xs">3,600 &gt; 480</td>
                <td className="py-1.5">
                  <strong>เคสเดียวเต็มวัน</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          ระบบจงใจไม่แยกช่องตามขนาดงาน เพราะช่างทีมเดียวกันทำทั้งงานเล็กงานใหญ่ —
          ถ้าแยกช่อง วันหนึ่งอาจขึ้นว่า &ldquo;ยังว่าง&rdquo; สำหรับงานเล็ก ทั้งที่ช่างถูกจองหมดแล้ว
        </p>
      </div>

      {data === null ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          ยังเชื่อมต่อฐานข้อมูลไม่ได้ — ตั้งค่า DATABASE_URL แล้วรัน migrate + seed ก่อน
        </div>
      ) : (
        <QuotaRuleManager rules={data.ruleViews} zones={data.zoneOptions} />
      )}

      <p className="text-[11px] text-[var(--color-muted)]">
        ต้องการปรับเฉพาะวันใดวันหนึ่ง (เช่น เสาร์นี้มีช่างแค่ 2 ทีม) ทำได้ที่{' '}
        <Link href="/schedule" className="underline underline-offset-2">
          ตารางงานและโควตา
        </Link>{' '}
        โดยคลิกที่วันนั้น
      </p>
    </div>
  );
}
