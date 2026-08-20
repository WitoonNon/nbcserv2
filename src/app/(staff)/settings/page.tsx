import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

async function loadCounts() {
  try {
    const [users, services, parts, assumptions, forms, quotaRules] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.serviceCatalogItem.count({ where: { isActive: true } }),
      prisma.part.count({ where: { isActive: true } }),
      prisma.appConfig.count({ where: { isAssumption: true } }),
      prisma.formTemplate.count({ where: { isActive: true } }),
      prisma.quotaRule.count({ where: { isActive: true } }),
    ]);
    return { users, services, parts, assumptions, forms, quotaRules };
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  await requirePermission('admin.config', '/settings');
  const counts = await loadCounts();

  const CARDS = [
    {
      href: '/settings/quota',
      title: 'โควตาการรับงานรายวัน',
      desc: 'กำหนดจำนวนงาน จำนวนเครื่อง และเวลาช่างที่รับได้ต่อวัน แยกตามประเภทงานและเขต',
      meta: counts ? `${counts.quotaRules} กฎ` : null,
    },
    {
      href: '/settings/users',
      title: 'ผู้ใช้งานและสิทธิ์',
      desc: 'บัญชีพนักงาน บทบาท และสิทธิ์การเข้าถึงแต่ละหน้าจอ',
      meta: counts ? `${counts.users} บัญชี` : null,
    },
    {
      href: '/settings/pricing',
      title: 'ราคาบริการและอะไหล่',
      desc: 'ตารางราคา 2 ระดับ (ในสัญญา/ทั่วไป) เวลามาตรฐานต่อเครื่อง และราคาอะไหล่',
      meta: counts ? `${counts.services} บริการ · ${counts.parts} อะไหล่` : null,
    },
    {
      href: '/settings/fees',
      title: 'ค่าเข้าตรวจเช็คและส่วนลด',
      desc: 'จำนวนเงิน กฎการหักคืนเมื่อลูกค้าตกลงซ่อม และสิทธิ์ยกเว้นของลูกค้าในสัญญา',
      meta: 'รอลูกค้ายืนยัน',
      warn: true,
    },
    {
      href: '/work-orders/templates',
      title: 'แบบฟอร์มใบงาน',
      desc: 'ใบตรวจเช็ค/แจ้งซ่อม · ใบล้าง/PM · ใบซ่อม พร้อมการจัดการเวอร์ชัน',
      meta: counts ? `${counts.forms} ฟอร์ม` : null,
    },
    {
      href: '/settings/notifications',
      title: 'การแจ้งเตือนลูกค้า',
      desc: 'ดูว่าข้อความไหนส่งถึงลูกค้าแล้ว ข้อความไหนส่งไม่ได้ และโควตาคงเหลือของเดือนนี้',
      meta: 'LINE',
    },
    {
      href: '/settings/capture',
      title: 'ข้อมูลที่เก็บจากรูปถ่ายหน้างาน',
      desc: 'เลือกเปิด-ปิดการบันทึกเวลาถ่ายรูป และพิกัด GPS ของรูปที่ช่างถ่าย',
      meta: 'PDPA',
      warn: true,
    },
    {
      href: '/settings/assumptions',
      title: 'ค่าสมมติที่รอลูกค้ายืนยัน',
      desc: 'ค่าตั้งต้นทั้งหมดที่ระบบใช้อยู่ระหว่างรอข้อมูลจริง แก้ได้โดยไม่ต้องแก้โค้ด',
      meta: counts ? `${counts.assumptions} รายการ` : null,
      warn: true,
    },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl">ตั้งค่าระบบ</h1>

      {!counts && (
        <div className="card p-4 bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/40 text-sm">
          ยังเชื่อมต่อฐานข้อมูลไม่ได้ — เข้าดูแต่ละหน้าได้ แต่ตัวเลขและการบันทึกจะทำงานเมื่อต่อ DB แล้ว
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href}
            className="card p-4 hover:border-[var(--color-brand-blue)] transition-colors">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base">{c.title}</h2>
              {c.meta && (
                <span className={c.warn ? 'assumption-badge' : 'text-[11px] text-[var(--color-muted)] whitespace-nowrap'}>
                  {c.meta}
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--color-muted)] mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
