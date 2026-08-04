import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatTHB } from '@/lib/utils';
import { formatThaiDate } from '@/lib/date/buddhist';
import { dateOnly } from '@/modules/scheduling/quota.service';

export const dynamic = 'force-dynamic';

interface Stats {
  customers: number;
  sites: number;
  assets: number;
  technicians: number;
  crews: number;
  services: number;
  parts: number;
  openQuotaDays: number;
  assumptions: number;
  jobsToday: number;
}

async function loadStats(): Promise<Stats | null> {
  try {
    const [
      customers, sites, assets, technicians, crews, services, parts, openQuotaDays, assumptions, jobsToday,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customerSite.count(),
      prisma.asset.count(),
      prisma.technician.count(),
      prisma.crew.count(),
      prisma.serviceCatalogItem.count(),
      prisma.part.count(),
      prisma.quotaDay.count({ where: { status: 'OPEN' } }),
      prisma.appConfig.count({ where: { isAssumption: true } }),
      // UTC midnight — @db.Date columns are stored that way; local midnight in
      // Bangkok would land on the previous day and always count zero.
      prisma.job.count({ where: { scheduledDate: dateOnly(new Date()) } }),
    ]);
    return { customers, sites, assets, technicians, crews, services, parts, openQuotaDays, assumptions, jobsToday };
  } catch {
    return null;
  }
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="font-[family-name:var(--font-heading)] text-2xl text-[var(--color-brand-teal)] mt-1">
        {value}
      </p>
      {sub && <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await loadStats();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl">ภาพรวมระบบ</h1>
          <p className="text-sm text-[var(--color-muted)]">{formatThaiDate(new Date(), 'long')}</p>
        </div>
        <span className="text-xs text-[var(--color-muted)]">
          โครงระบบเวอร์ชัน 0.1 · ข้อมูลตัวอย่างสำหรับการพัฒนา
        </span>
      </div>

      {!stats ? (
        <div className="card p-6 border-[var(--color-brand-orange)] bg-[var(--color-brand-orange-50)]">
          <h2 className="text-base text-[var(--color-brand-orange-600)]">ยังเชื่อมต่อฐานข้อมูลไม่ได้</h2>
          <p className="text-sm mt-2 text-[var(--color-ink)]">
            ตั้งค่า <code className="bg-white px-1 rounded">DATABASE_URL</code> ในไฟล์{' '}
            <code className="bg-white px-1 rounded">.env</code> แล้วรัน:
          </p>
          <pre className="mt-3 bg-white rounded p-3 text-xs overflow-x-auto border border-[var(--color-line)]">
{`npx prisma migrate deploy
npm run db:seed`}
          </pre>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-sm mb-2 text-[var(--color-muted)] font-normal">ข้อมูลหลัก</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
              <Tile label="ลูกค้า" value={stats.customers} />
              <Tile label="หน้างาน" value={stats.sites} />
              <Tile label="เครื่องปรับอากาศ" value={stats.assets} sub="ในทะเบียน" />
              <Tile label="ช่าง" value={stats.technicians} sub={`${stats.crews} ทีม`} />
              <Tile label="งานวันนี้" value={stats.jobsToday} />
            </div>
          </section>

          <section>
            <h2 className="text-sm mb-2 text-[var(--color-muted)] font-normal">ข้อมูลอ้างอิง</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Tile label="รายการบริการ" value={stats.services} sub="จากตารางราคาบนเว็บไซต์" />
              <Tile label="อะไหล่" value={stats.parts} sub="ค่าตั้งต้น" />
              <Tile label="วันที่เปิดรับจอง" value={stats.openQuotaDays} sub="ใน 90 วันข้างหน้า" />
              <Tile label="ราคาเริ่มต้น" value={formatTHB(500)} sub="ล้างแอร์ติดผนัง (ในสัญญา)" />
            </div>
          </section>

          <section className="card p-4 border-[var(--color-brand-orange)]/40 bg-[var(--color-brand-orange-50)]/40">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base">
                  มีค่าสมมติ {stats.assumptions} รายการที่รอลูกค้ายืนยัน
                </h2>
                <p className="text-sm text-[var(--color-ink)] mt-1 max-w-2xl">
                  ระบบใช้ค่าตั้งต้นไปก่อนเพื่อให้พัฒนาต่อได้ ทุกค่าเก็บเป็นข้อมูลในฐานข้อมูล
                  ไม่ได้ฝังไว้ในโค้ด จึงแก้ไขได้ทันทีเมื่อได้คำตอบจากลูกค้า โดยไม่ต้องแก้โครงสร้าง
                </p>
              </div>
              <Link
                href="/settings/assumptions"
                className="bg-[var(--color-brand-orange)] text-white rounded-[var(--radius-brand)] px-4 py-2 text-sm font-semibold whitespace-nowrap"
              >
                ดูรายการทั้งหมด
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
