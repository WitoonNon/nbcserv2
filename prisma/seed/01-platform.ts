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

  // --- Timeclock: where "at the office" is ------------------------------
  //
  // Answered by the client on 26 ส.ค. 2569: 74/1 หมู่ 3 ต.ละหาร อ.บางบัวทอง
  // นนทบุรี 11110, with a printed QR mounted permanently (no screen variant).
  //
  // The client gave an address, not a coordinate. This value decides whether
  // a scan counts as being at work, which decides whether somebody is paid,
  // and it MUST be replaced by standing at the mounting point and reading the
  // coordinate off a phone.
  //
  // ⚠️ The first seeded value — the ต.ละหาร subdistrict centroid, 13.968264 /
  // 100.404581 — was measured on 31 ส.ค. to be 4.8 km from the addressed
  // area. Against a 300 m fence that flags EVERY punch, which is worse than
  // no check at all: a queue that is always full is a queue nobody reads.
  //
  // Replaced with the geocoded centre of หมู่ 3 ต.ละหาร (OpenStreetMap has no
  // house numbers for this area, so this is the village, not the building).
  // Still a guess — but a guess in the right kilometre — and the radius is
  // widened to match its honest uncertainty rather than pretending to a
  // precision it does not have.
  {
    key: 'office.location.lat',
    value: 13.9391592,
    description:
      'ละติจูดจุดสแกนเข้างาน — ค่าประมาณระดับหมู่บ้าน (หมู่ 3 ต.ละหาร) ยังไม่ใช่พิกัดจริงของจุดติด QR ต้องไปยืนที่จุดนั้นแล้วอ่านพิกัดจากมือถือมาแทน',
    isAssumption: true,
  },
  {
    key: 'office.location.lng',
    value: 100.4379344,
    description:
      'ลองจิจูดจุดสแกนเข้างาน — ค่าประมาณ ต้องแทนด้วยพิกัดจริงเช่นเดียวกับ office.location.lat',
    isAssumption: true,
  },
  {
    key: 'office.location.radiusMetres',
    value: 1500,
    description:
      'รัศมีที่ยอมรับว่าอยู่ที่ออฟฟิศ — ตั้งไว้ 1,500 ม. ชั่วคราวเพราะพิกัดยังเป็นค่าประมาณระดับหมู่บ้าน กว้างขนาดนี้ยังกันการสแกนจากบ้านได้ แต่กันการสแกนจากร้านข้างๆ ไม่ได้ **เมื่อได้พิกัดจริงต้องลดเหลือ 50–100 ม. ทันที** ไม่งั้นการตรวจนี้แทบไม่มีความหมาย',
    isAssumption: true,
  },
  {
    key: 'office.address',
    value: '74/1 หมู่ 3 ต.ละหาร อ.บางบัวทอง จ.นนทบุรี 11110',
    description:
      'ที่ตั้งจุดสแกนเข้างาน ตามที่ลูกค้าแจ้ง 26 ส.ค. 2569 — ไม่ตรงกับที่อยู่บนหัวใบงาน (105/26 หมู่ 2) ซึ่งเป็นที่อยู่จดทะเบียน ยังไม่ได้ยืนยันว่าอันไหนคือจุดสแกนจริง',
    isAssumption: true,
  },

  // --- Leave policy -----------------------------------------------------
  //
  // These are the CLIENT'S stated policy, given on 26 ส.ค. 2569 and confirmed
  // when the discrepancy below was put to them.
  //
  // Recorded plainly because they sit under the figures in พ.ร.บ.คุ้มครองแรงงาน
  // 2541: ม.57 pays sick leave up to 30 working days a year (not 15), ม.34 and
  // ม.57/1 give 3 paid days of ลากิจธุระจำเป็น (not none), and neither section
  // distinguishes monthly-paid staff from daily-paid. They are config rather
  // than constants precisely so the company can raise them without a developer
  // if it revisits the decision.
  {
    key: 'leave.sick.paidDaysPerYear',
    value: 15,
    description:
      'ลาป่วยที่ได้รับค่าจ้าง 15 วัน/ปี ตามที่ลูกค้ากำหนด 26 ส.ค. 2569 — กฎหมายแรงงาน ม.57 กำหนดไม่เกิน 30 วันทำงาน/ปี ค่านี้จึงต่ำกว่าเกณฑ์กฎหมาย ลูกค้ารับทราบและยืนยันแล้ว',
    isAssumption: true,
  },
  {
    key: 'leave.sick.monthlyStaffOnly',
    value: true,
    description:
      'ลาป่วยได้รับค่าจ้างเฉพาะพนักงานรายเดือน ตามที่ลูกค้ากำหนด — กฎหมายไม่ได้แยกรายวัน/รายเดือน ลูกค้ารับทราบและยืนยันแล้ว',
    isAssumption: true,
  },
  {
    key: 'leave.personal.paidDaysPerYear',
    value: 0,
    description:
      'ลากิจไม่ได้รับค่าจ้าง ตามที่ลูกค้ากำหนด 26 ส.ค. 2569 — กฎหมายแรงงาน ม.34/ม.57/1 กำหนดลากิจธุระจำเป็นที่ได้รับค่าจ้าง 3 วันทำงาน/ปี ลูกค้ารับทราบและยืนยันแล้ว',
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
