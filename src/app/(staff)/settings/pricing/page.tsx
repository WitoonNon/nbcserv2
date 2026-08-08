import Link from 'next/link';
import { prisma } from '@/lib/db';
import { CATEGORY_LABEL } from '@/lib/labels';
import { formatTHB, formatMinutes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function load() {
  try {
    const [services, parts] = await Promise.all([
      prisma.serviceCatalogItem.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      }),
      prisma.part.findMany({
        where: { isActive: true },
        include: { category: true },
        orderBy: [{ categoryId: 'asc' }, { sku: 'asc' }],
      }),
    ]);
    return { services, parts };
  } catch {
    return null;
  }
}

export default async function PricingPage() {
  const data = await load();

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <Link href="/settings" className="text-sm text-[var(--color-brand-blue-600)]">← ตั้งค่าระบบ</Link>
        <h1 className="text-2xl">ราคาบริการและอะไหล่</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">
          ราคาเก็บแบบมีช่วงเวลาใช้งาน (ไม่แก้ทับของเดิม) ใบงานที่ออกไปแล้วจึงยังแสดงราคาตอนนั้นได้ถูกต้องเสมอ
        </p>
      </div>

      <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
        <strong>ค่าตั้งต้นชุดนี้ดึงจากตารางราคาบนเว็บไซต์บริษัท</strong> — ข้อ D1 ในรายการที่ขอลูกค้า
        คือขอตารางราคาฉบับที่ใช้จริงภายใน ซึ่งอาจต่างจากที่ประกาศหน้าเว็บ
      </div>

      {!data ? (
        <div className="card p-5 bg-[var(--color-brand-orange-50)] text-sm">ยังเชื่อมต่อฐานข้อมูลไม่ได้</div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
              <h2 className="text-base">ตารางราคาบริการ ({data.services.length})</h2>
              <p className="text-[11px] text-[var(--color-muted)]">
                ราคายังไม่รวม VAT 7% · เวลามาตรฐานใช้เป็นฐานคำนวณโควตาเป็นนาทีช่าง
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                <strong>ต่ำสุด–สูงสุด คือช่วงราคาที่ใช้เสนอลูกค้า ไม่ใช่ราคาแยกตามประเภทลูกค้า</strong> —
                ราคาจริงขึ้นกับสภาพหน้างาน ความยากง่าย ความสูง และจำนวนเครื่อง (จำนวนมากราคาต่อเครื่องลดลง)
                ระบบจึงไม่เลือกตัวเลขให้เอง เจ้าหน้าที่เป็นผู้ระบุราคาที่ตกลงกับลูกค้า
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                    <th className="px-3 py-2 font-normal">รหัส</th>
                    <th className="px-3 py-2 font-normal">รายการ</th>
                    <th className="px-3 py-2 font-normal">ประเภทงาน</th>
                    <th className="px-3 py-2 font-normal text-right">เวลา</th>
                    <th className="px-3 py-2 font-normal text-center">ช่าง</th>
                    <th className="px-3 py-2 font-normal text-right">ราคาต่ำสุด</th>
                    <th className="px-3 py-2 font-normal text-right">ราคาสูงสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => {
                    const noPrice = Number(s.priceMax) === 0;
                    return (
                      <tr key={s.id} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="px-3 py-2 font-mono text-[11px] text-[var(--color-brand-blue-600)]">{s.code}</td>
                        <td className="px-3 py-2">{s.nameTh}</td>
                        <td className="px-3 py-2 text-xs">{CATEGORY_LABEL[s.category]}</td>
                        <td className="px-3 py-2 text-right text-xs">{formatMinutes(s.standardDurationMin)}</td>
                        <td className="px-3 py-2 text-center text-xs">{s.crewSize}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {noPrice ? <span className="assumption-badge">รอราคา</span> : formatTHB(Number(s.priceMin))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {noPrice ? '—' : formatTHB(Number(s.priceMax))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[var(--color-line)]">
              <h2 className="text-base">ราคาอะไหล่ ({data.parts.length})</h2>
              <p className="text-[11px] text-[var(--color-muted)]">
                ราคาเป็นค่าตั้งต้น รอรายการจริงจากลูกค้า (ข้อ D5/D6)
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-line)] bg-[var(--color-surface-alt)]">
                    <th className="px-3 py-2 font-normal">SKU</th>
                    <th className="px-3 py-2 font-normal">ชื่ออะไหล่</th>
                    <th className="px-3 py-2 font-normal">หมวด</th>
                    <th className="px-3 py-2 font-normal">หน่วย</th>
                    <th className="px-3 py-2 font-normal text-center">รับประกัน</th>
                    <th className="px-3 py-2 font-normal text-right">ราคา</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parts.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px] text-[var(--color-brand-blue-600)]">{p.sku}</td>
                      <td className="px-3 py-2">{p.nameTh}</td>
                      <td className="px-3 py-2 text-xs">{p.category?.nameTh ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">{p.unit}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {p.warrantyMonths ? `${p.warrantyMonths} เดือน` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{formatTHB(Number(p.defaultPrice))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
