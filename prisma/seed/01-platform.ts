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
  /**
   * Push `value` over what is already in the database.
   *
   * Off by default, and that default is right: the office edits these at
   * /settings/assumptions, and a reseed that overwrote their work would undo
   * it silently. But it also means a seeded value that turns out to be WRONG
   * can never be corrected — the fix lives in the file and the database keeps
   * the mistake, with a passing build either way.
   *
   * That happened here. The scan-point coordinate was corrected in code on
   * 31 ส.ค. after being measured 4.84 km from the client's address; production
   * kept the original, so the geofence sat 4.84 km from the office with a
   * 300 m radius and would have flagged every punch ever made.
   *
   * Set it deliberately, in the same commit as the corrected value, and clear
   * it once the correction has been deployed everywhere.
   */
  correctValue?: boolean;
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
  // The client dropped a pin on the mounting point and sent it on 31 ส.ค. 2569:
  //   https://maps.google.com/maps?q=13.938398,100.438665
  // They also settled the address question — 74/1 หมู่ 3 is the office; the
  // 105/26 หมู่ 2 on the work-order letterhead is where the company was
  // registered and nobody works there.
  //
  // This is no longer an assumption, and the history is worth keeping because
  // both earlier guesses were badly wrong in a way nothing would have caught:
  // the ต.ละหาร centroid was 4.96 km from this pin, and the หมู่ 3 village
  // centre that replaced it was still 3.68 km away. Against any sane radius
  // both would have flagged every punch ever made — and a review queue that is
  // always full is one nobody reads, so the check would have been switched off
  // within a week and the clock would have been measuring nothing.
  {
    key: 'office.location.lat',
    value: 13.938398,
    description:
      'ละติจูดจุดสแกนเข้างาน — พิกัดจริงจากหมุดที่ลูกค้าปักให้ 31 ส.ค. 2569 ตรงจุดที่จะติด QR',
    isAssumption: false,
    correctValue: true,
  },
  {
    key: 'office.location.lng',
    value: 100.438665,
    description:
      'ลองจิจูดจุดสแกนเข้างาน — พิกัดจริงจากหมุดที่ลูกค้าปักให้ 31 ส.ค. 2569',
    isAssumption: false,
    correctValue: true,
  },
  {
    key: 'office.location.radiusMetres',
    value: 150,
    description:
      'รัศมีที่ยอมรับว่าอยู่ที่จุดสแกน 150 ม. — แคบลงได้เพราะพิกัดเป็นของจริงแล้ว ไม่ใช่ค่าประมาณระดับหมู่บ้าน · GPS ในอาคารคลาดเคลื่อนได้ แต่กรณีนั้นระบบตัดสินเป็น UNRELIABLE ให้หัวหน้าตรวจ ไม่ใช่ปล่อยผ่าน',
    isAssumption: false,
    correctValue: true,
  },
  {
    key: 'office.address',
    value: '74/1 หมู่ 3 ต.ละหาร อ.บางบัวทอง จ.นนทบุรี 11110',
    description:
      'ที่ตั้งออฟฟิศจริงและจุดสแกนเข้างาน ลูกค้ายืนยัน 31 ส.ค. 2569 — ส่วน 105/26 หมู่ 2 บนหัวใบงานคือที่อยู่จดทะเบียนบริษัท ไม่มีคนทำงานที่นั่น',
    isAssumption: false,
    correctValue: true,
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

/**
 * What is in this build and what is not — a scope list, not a control panel.
 *
 * These were written as switches and never wired to anything: no feature has
 * ever checked one before running. The proof was `feature.lineNotifications`
 * sitting at `false` while LINE had been delivering real messages since
 * 25 ส.ค. A switch that reads "off" for something that is on is worse than no
 * switch, because somebody eventually trusts it.
 *
 * They are useful as a statement of scope — invoicing and parts stock are
 * genuinely out of this phase and the client asks about both — so the screen
 * now renders them as status, with no button. `enabled` means "this build
 * does it", which is a fact about the code and belongs in the code.
 *
 * If a real kill switch is ever wanted, it needs the feature to consult it and
 * a test proving the off state actually stops the work. Until then, nothing
 * here should look pressable.
 */
const FLAGS = [
  { key: 'feature.assetRegistry', enabled: true, description: 'ทะเบียนเครื่องปรับอากาศรายเครื่อง — ใช้งานได้' },
  { key: 'feature.pmAutoSchedule', enabled: true, description: 'เสนอนัด PM อัตโนมัติจากวันครบกำหนดในทะเบียนเครื่อง — ใช้งานได้' },
  // Corrected 31 ส.ค.: live since 25 ส.ค., sending to the real @nbcservice account.
  { key: 'feature.lineNotifications', enabled: true, description: 'แจ้งเตือนผ่าน LINE — ใช้งานได้ ส่งเข้าไลน์จริงแล้ว' },
  { key: 'feature.timeClock', enabled: true, description: 'ลงเวลาเข้า-ออกด้วย QR + ตรวจพิกัด — ใช้งานได้' },
  { key: 'feature.payroll', enabled: true, description: 'โอที ลา และสรุปเงินเดือน — ใช้งานได้' },
  { key: 'feature.customerPortal', enabled: true, description: 'พอร์ทัลลูกค้า จองคิวและติดตามงาน — ใช้งานได้' },
  { key: 'feature.invoicing', enabled: false, description: 'ออกใบแจ้งหนี้/e-Tax — ไม่รวมในขอบเขตงาน ส่งต่อฝ่ายบัญชี' },
  { key: 'feature.partsInventory', enabled: false, description: 'สต๊อกอะไหล่ในรถช่าง — ไม่รวมในขอบเขตงาน บันทึกการใช้อะไหล่อย่างเดียว' },
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
      update: {
        description: c.description,
        isAssumption: c.isAssumption,
        // Only when the entry asks for it — see `correctValue`.
        ...(c.correctValue ? { value: c.value as never } : {}),
      },
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
