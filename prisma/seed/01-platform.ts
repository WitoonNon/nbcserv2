import { prisma } from './client.js';

/**
 * Runtime configuration.
 *
 * The client delegated these decisions to us rather than answering the
 * questionnaire, so each value below is a DECISION with a stated rationale —
 * not a placeholder. They still live in the database rather than in code, so
 * the office can change any of them later without a developer.
 *
 * `isAssumption` now means only one thing: "we invented this number and the
 * business has never validated it against reality". A handful of operational
 * numbers (daily capacity, crew size) stay flagged because only NBC can tell
 * us whether they match how the company actually runs.
 */
const CONFIG: {
  key: string;
  value: unknown;
  description: string;
  isAssumption: boolean;
}[] = [
  // --- Fees ------------------------------------------------------------
  {
    key: 'inspection.fee.default',
    value: 500,
    description:
      'ค่าเข้าตรวจเช็คหน้างาน 500 บาท — ตั้งให้เท่าราคาล้างแอร์ติดผนัง 1 เครื่อง ลูกค้าจึงรู้สึกว่าสมเหตุสมผล และหักคืนได้พอดีเมื่อตกลงซ่อม',
    isAssumption: false,
  },
  {
    key: 'inspection.fee.creditMode',
    value: 'FULL',
    description:
      'หักคืนเต็มจำนวนเมื่อลูกค้าตกลงซ่อม — ทำให้พนักงานอธิบายลูกค้าได้ง่ายที่สุด ไม่ต้องคิดเปอร์เซ็นต์หน้างาน',
    isAssumption: false,
  },
  {
    key: 'inspection.fee.minJobValueForCredit',
    value: 1000,
    description:
      'หักคืนเฉพาะงานซ่อมตั้งแต่ 1,000 บาทขึ้นไป — ป้องกันกรณีหักคืน 500 บาทจากงาน 600 บาท ซึ่งทำให้ค่าแรงช่างที่เดินทางไปไม่คุ้ม',
    isAssumption: false,
  },

  // --- Working calendar -------------------------------------------------
  {
    key: 'workday.start',
    value: '08:00',
    description: 'เวลาเริ่มงาน — ตรงกับที่บริษัทประกาศบนเว็บไซต์',
    isAssumption: false,
  },
  {
    key: 'workday.end',
    value: '17:00',
    description: 'เวลาเลิกงาน — ตรงกับที่บริษัทประกาศบนเว็บไซต์',
    isAssumption: false,
  },
  {
    key: 'workday.weekdayMask',
    value: 126,
    description:
      'ทำงานจันทร์–เสาร์ (บิตมาสก์ 126) — มาตรฐานของธุรกิจรับเหมางานระบบในไทย หยุดอาทิตย์วันเดียว',
    isAssumption: false,
  },
  {
    key: 'workday.productiveMinutes',
    value: 420,
    description:
      'เวลาทำงานสุทธิ 420 นาที/ช่าง/วัน — จาก 9 ชั่วโมง (08:00–17:00) หัก 1 ชม.พักเที่ยง และหักอีก 1 ชม.สำหรับเตรียมของ เก็บของ และเอกสาร',
    isAssumption: false,
  },
  {
    key: 'travel.bufferMinutes',
    value: 45,
    description:
      'เผื่อเวลาเดินทางระหว่างงาน 45 นาที — สภาพจราจรกรุงเทพฯ–ปริมณฑล 30 นาทีมักไม่พอและทำให้งานสุดท้ายของวันสาย',
    isAssumption: false,
  },

  // --- Booking ----------------------------------------------------------
  {
    key: 'booking.minLeadDays',
    value: 3,
    description: 'ลูกค้าต้องจองล่วงหน้าอย่างน้อย 3 วัน — ตรงกับที่เว็บไซต์บริษัทระบุ (3–7 วัน)',
    isAssumption: false,
  },
  {
    key: 'booking.horizonDays',
    value: 90,
    description:
      'เปิดให้จองล่วงหน้าได้ 90 วัน — ครอบคลุมรอบ PM รายไตรมาสของลูกค้าโรงงาน โดยไม่ต้องสร้างช่องโควตาไกลเกินจำเป็น',
    isAssumption: false,
  },
  {
    key: 'quota.holdTtlMinutes',
    value: 10,
    description: 'จองคิวชั่วคราวไว้ 10 นาทีระหว่างลูกค้ากรอกฟอร์ม แล้วปล่อยคืนอัตโนมัติ',
    isAssumption: false,
  },

  // --- Job sizing (was question C4) -------------------------------------
  {
    key: 'jobSize.bands',
    value: {
      S: { maxUnits: 5, label: 'บ้าน / คอนโด / ร้านเล็ก' },
      M: { maxUnits: 15, label: 'สำนักงาน / ร้านอาหาร' },
      L: { maxUnits: 40, label: 'โรงแรม / โรงงานขนาดกลาง' },
      XL: { maxUnits: null, label: 'โครงการใหญ่ / ระบบ Chiller-AHU-VRF' },
    },
    description:
      'เกณฑ์แบ่งขนาดงานตามจำนวนเครื่อง S≤5 M≤15 L≤40 XL>40 หรือเป็นระบบใหญ่ — ใช้จำนวนเครื่องเป็นเกณฑ์เพราะเป็นตัวเลขที่รู้ตั้งแต่ตอนรับแจ้ง ไม่ต้องรอช่างประเมิน',
    isAssumption: false,
  },

  // --- Documents --------------------------------------------------------
  {
    key: 'date.era',
    value: 'BE',
    description: 'เอกสารทั้งหมดใช้ปี พ.ศ. — ตรงกับเอกสารราชการและใบกำกับภาษีไทย',
    isAssumption: false,
  },
  { key: 'vat.rate', value: 7, description: 'อัตราภาษีมูลค่าเพิ่มตามกฎหมาย', isAssumption: false },
  {
    key: 'vat.priceInclusive',
    value: false,
    description: 'ราคาที่บันทึกยังไม่รวม VAT แล้วคำนวณเพิ่มตอนออกเอกสาร — มาตรฐานงานนิติบุคคลไทย',
    isAssumption: false,
  },

  // --- Field work -------------------------------------------------------
  {
    key: 'workorder.minPhotosBefore',
    value: 2,
    description:
      'บังคับถ่ายรูปก่อนทำงานอย่างน้อย 2 รูป — รูปเดียวมักไม่พอเวลาลูกค้าโต้แย้งเรื่องความเสียหายที่มีอยู่เดิม',
    isAssumption: false,
  },
  {
    key: 'workorder.minPhotosAfter',
    value: 2,
    description: 'บังคับถ่ายรูปหลังทำงานอย่างน้อย 2 รูป — ใช้ยืนยันว่างานเสร็จจริงเมื่อลูกค้าไม่อยู่หน้างาน',
    isAssumption: false,
  },
  {
    key: 'sla.responseHours',
    value: 24,
    description: 'ถึงหน้างานภายใน 1 วันทำการ — คำสัญญาที่บริษัทประกาศบนเว็บไซต์',
    isAssumption: false,
  },
  {
    key: 'approval.technicianMaxAmount',
    value: 2000,
    description:
      'หัวหน้าทีมช่างอนุมัติงานเพิ่มหน้างานเองได้ไม่เกิน 2,000 บาท — ครอบคลุมงานเปลี่ยนคาปาซิเตอร์/เติมน้ำยาที่พบบ่อย โดยไม่ต้องรอหัวหน้างาน',
    isAssumption: false,
  },

  // --- Still genuinely unvalidated -------------------------------------
  // These are the only numbers we truly cannot invent: they describe how many
  // people NBC actually has and how much work they can actually absorb.
  {
    key: 'crew.defaultSize',
    value: 2,
    description:
      'ช่าง 2 คนต่อทีมสำหรับงานล้าง — ยังไม่ได้ยืนยันกับหน้างานจริง แก้ได้ที่หน้าตั้งค่าเมื่อทราบ',
    isAssumption: true,
  },
  {
    key: 'quota.dailyCapacityValidated',
    value: false,
    description:
      'เพดานงานต่อวันคำนวณจากทีมช่างที่มีในระบบ ยังไม่ได้เทียบกับปริมาณงานจริงของบริษัท — ควรตรวจอัตราการใช้โควตาหลังใช้งานจริง 1 เดือนแล้วปรับ',
    isAssumption: true,
  },
];

const FLAGS = [
  { key: 'feature.assetRegistry', enabled: true, description: 'ทะเบียนเครื่องปรับอากาศรายเครื่อง' },
  { key: 'feature.pmAutoSchedule', enabled: true, description: 'นัด PM ครั้งถัดไปอัตโนมัติตามรอบ 2/3/4 ครั้งต่อปี' },
  { key: 'feature.lineNotifications', enabled: false, description: 'แจ้งเตือนผ่าน LINE — รอสิทธิ์ Messaging API ของ @nbcservice' },
  { key: 'feature.invoicing', enabled: false, description: 'ออกใบแจ้งหนี้/e-Tax — นอกขอบเขตเฟสนี้ ส่งต่อฝ่ายบัญชี' },
  { key: 'feature.partsInventory', enabled: false, description: 'สต๊อกอะไหล่ในรถช่าง — นอกขอบเขตเฟสนี้ บันทึกการใช้อะไหล่อย่างเดียว' },
  { key: 'feature.customerPortal', enabled: true, description: 'พอร์ทัลลูกค้า จองคิวและติดตามงาน' },
];

/** Document number formats. NBC-{FORM}-{ปี พ.ศ.}-{ลำดับ 5 หลัก} */
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
      update: { description: f.description, enabled: f.enabled },
    });
  }

  for (const s of SEQUENCES) {
    await prisma.documentSequence.upsert({
      where: { code: s.code },
      create: s,
      update: { format: s.format, resetPolicy: s.resetPolicy },
    });
  }

  const open = CONFIG.filter((c) => c.isAssumption).length;
  console.log(
    `  platform: ${CONFIG.length} config (${CONFIG.length - open} decided, ${open} awaiting real-world validation), ` +
      `${FLAGS.length} flags, ${SEQUENCES.length} sequences`,
  );
}
