import { prisma } from './client.js';

/**
 * Runtime configuration.
 *
 * Every row with isAssumption = true is a placeholder standing in for an
 * answer we do not have yet. `npm run client-confirm` lists them, and the admin
 * UI shows them with a warning badge so nobody mistakes them for confirmed
 * business rules.
 */
const CONFIG: {
  key: string;
  value: unknown;
  description: string;
  isAssumption: boolean;
}[] = [
  // --- Fees -----------------------------------------------------------
  {
    key: 'inspection.fee.default',
    value: 500,
    description: 'ค่าเข้าตรวจเช็คหน้างานมาตรฐาน (บาท) — @client-confirm B1',
    isAssumption: true,
  },
  {
    key: 'inspection.fee.creditMode',
    value: 'FULL',
    description: 'หักคืนเต็มจำนวนเมื่อลูกค้าตกลงซ่อม — @client-confirm B3',
    isAssumption: true,
  },
  {
    key: 'inspection.fee.minJobValueForCredit',
    value: 0,
    description: 'มูลค่างานขั้นต่ำก่อนได้ส่วนลด (0 = ไม่กำหนด) — @client-confirm B4',
    isAssumption: true,
  },

  // --- Working calendar -----------------------------------------------
  {
    key: 'workday.start',
    value: '08:00',
    description: 'เวลาเริ่มงาน — จากหน้าเว็บบริษัท (08:00–17:00) — @client-confirm C5',
    isAssumption: true,
  },
  { key: 'workday.end', value: '17:00', description: 'เวลาเลิกงาน — @client-confirm C5', isAssumption: true },
  {
    key: 'workday.weekdayMask',
    value: 126,
    description: 'บิตมาสก์วันทำงาน 126 = จันทร์–เสาร์ — @client-confirm C5',
    isAssumption: true,
  },
  {
    key: 'workday.productiveMinutes',
    value: 480,
    description: 'นาทีทำงานสุทธิต่อช่างต่อวัน — @client-confirm C1',
    isAssumption: true,
  },
  {
    key: 'travel.bufferMinutes',
    value: 30,
    description: 'เวลาเดินทางเผื่อระหว่างงาน — @client-confirm C11',
    isAssumption: true,
  },

  // --- Booking ---------------------------------------------------------
  {
    key: 'booking.minLeadDays',
    value: 3,
    description: 'จองล่วงหน้าอย่างน้อยกี่วัน — เว็บไซต์ระบุ 3–7 วัน — @client-confirm C6',
    isAssumption: true,
  },
  {
    key: 'booking.horizonDays',
    value: 90,
    description: 'เปิดให้จองล่วงหน้าได้ไกลสุดกี่วัน — @client-confirm C7',
    isAssumption: true,
  },
  { key: 'quota.holdTtlMinutes', value: 10, description: 'อายุการจองชั่วคราวขณะกรอกฟอร์ม', isAssumption: false },

  // --- Documents -------------------------------------------------------
  {
    key: 'date.era',
    value: 'BE',
    description: 'ปีบนเอกสาร: BE = พ.ศ., CE = ค.ศ. — @client-confirm A10',
    isAssumption: true,
  },
  { key: 'vat.rate', value: 7, description: 'อัตราภาษีมูลค่าเพิ่ม', isAssumption: false },
  {
    key: 'vat.priceInclusive',
    value: false,
    description: 'ราคาที่บันทึกยังไม่รวม VAT — @client-confirm B7',
    isAssumption: true,
  },

  // --- Field work ------------------------------------------------------
  {
    key: 'workorder.minPhotosBefore',
    value: 1,
    description: 'จำนวนรูปก่อนทำงานขั้นต่ำ — @client-confirm A11',
    isAssumption: true,
  },
  {
    key: 'workorder.minPhotosAfter',
    value: 1,
    description: 'จำนวนรูปหลังทำงานขั้นต่ำ — @client-confirm A11',
    isAssumption: true,
  },
  {
    key: 'sla.responseHours',
    value: 24,
    description: 'ถึงหน้างานภายใน 1 วันทำการ — คำสัญญาบนเว็บไซต์บริษัท',
    isAssumption: false,
  },
  {
    key: 'crew.defaultSize',
    value: 2,
    description: 'จำนวนช่างต่อทีมสำหรับงานล้าง — @client-confirm F2',
    isAssumption: true,
  },
];

const FLAGS = [
  { key: 'feature.assetRegistry', enabled: true, description: 'ทะเบียนเครื่องปรับอากาศรายเครื่อง' },
  { key: 'feature.pmAutoSchedule', enabled: false, description: 'นัด PM ครั้งถัดไปอัตโนมัติ — @client-confirm H3' },
  { key: 'feature.lineNotifications', enabled: false, description: 'แจ้งเตือนผ่าน LINE — @client-confirm G3' },
  { key: 'feature.invoicing', enabled: false, description: 'ออกใบแจ้งหนี้/e-Tax — @client-confirm H1' },
  { key: 'feature.partsInventory', enabled: false, description: 'สต๊อกอะไหล่ในรถช่าง — @client-confirm H2' },
  { key: 'feature.customerPortal', enabled: true, description: 'พอร์ทัลลูกค้า' },
];

/** @client-confirm A9 — document number formats. */
const SEQUENCES = [
  { code: 'JOB', format: 'NBC-JOB-{BE}-{SEQ:05}', resetPolicy: 'YEARLY' as const },
  { code: 'INSPECTION_REQUEST', format: 'NBC-CHK-{BE}-{SEQ:05}', resetPolicy: 'YEARLY' as const },
  { code: 'CLEANING_PM', format: 'NBC-PM-{BE}-{SEQ:05}', resetPolicy: 'YEARLY' as const },
  { code: 'REPAIR', format: 'NBC-REP-{BE}-{SEQ:05}', resetPolicy: 'YEARLY' as const },
  { code: 'QUOTATION', format: 'NBC-QT-{BE}-{SEQ:05}', resetPolicy: 'YEARLY' as const },
  { code: 'CUSTOMER', format: 'CUS-{SEQ:05}', resetPolicy: 'NEVER' as const },
];

export async function seedPlatform() {
  for (const c of CONFIG) {
    await prisma.appConfig.upsert({
      where: { key: c.key },
      create: { key: c.key, value: c.value as never, description: c.description, isAssumption: c.isAssumption },
      update: { description: c.description, isAssumption: c.isAssumption },
    });
  }

  for (const f of FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: f,
      update: { description: f.description },
    });
  }

  for (const s of SEQUENCES) {
    await prisma.documentSequence.upsert({
      where: { code: s.code },
      create: s,
      update: { format: s.format, resetPolicy: s.resetPolicy },
    });
  }

  const assumptions = CONFIG.filter((c) => c.isAssumption).length;
  console.log(`  platform: ${CONFIG.length} config (${assumptions} assumptions), ${FLAGS.length} flags, ${SEQUENCES.length} sequences`);
}
