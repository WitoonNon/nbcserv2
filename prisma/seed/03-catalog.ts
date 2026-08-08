import { prisma } from './client.js';
import type { AcType, JobSize, ServiceCategory } from '../../src/generated/prisma/index.js';

/**
 * Service catalogue seeded from NBC's OWN PUBLISHED PRICE LIST
 * (nbcgroup.co.th → ค่าบริการบำรุงรักษา).
 *
 * This is deliberately real data rather than lorem ipsum: the skeleton is
 * demoable to the client on day one, and every placeholder is a number they
 * will recognise as their own.
 *
 * priceMin/priceMax are a QUOTATION BAND, not a customer-tier split. The
 * client confirmed on 9 ส.ค. 2569 that the final figure depends on the site —
 * access difficulty, working height, and total quantity, with a bigger job
 * costing LESS per unit. Nothing in this file should ever be read as "contract
 * customers pay priceMin".
 *
 * @client-confirm D1 — replace with the internal price list actually in use.
 * @client-confirm D3 — confirm the standard durations.
 * @client-confirm D6 — how the volume discount is actually calculated. The
 *                      client says bulk lowers the per-unit price but has not
 *                      given the thresholds, so the system quotes the band and
 *                      leaves the final number to the office.
 * @client-confirm C4 — jobSize mapping is our assumption; the client defines
 *                      their own size bands.
 */

interface CatalogRow {
  code: string;
  category: ServiceCategory;
  acType: AcType;
  jobSize: JobSize;
  btuMin: number | null;
  btuMax: number | null;
  nameTh: string;
  nameEn: string;
  durationMin: number;
  priceMin: number;
  priceMax: number;
  crewSize: number;
}

const CLEANING: CatalogRow[] = [
  // --- แอร์ติดผนัง / Wall type — 30 min ---
  {
    code: 'CLEAN-WALL-24K', category: 'CLEANING_PM', acType: 'WALL', jobSize: 'S',
    btuMin: 0, btuMax: 24000,
    nameTh: 'ล้างแอร์ติดผนัง 0–24,000 BTU', nameEn: 'Clean wall type 0–24,000 BTU',
    durationMin: 30, priceMin: 500, priceMax: 650, crewSize: 2,
  },
  {
    code: 'CLEAN-WALL-36K', category: 'CLEANING_PM', acType: 'WALL', jobSize: 'S',
    btuMin: 24001, btuMax: 36000,
    nameTh: 'ล้างแอร์ติดผนัง 24,001–36,000 BTU', nameEn: 'Clean wall type 24,001–36,000 BTU',
    durationMin: 30, priceMin: 500, priceMax: 650, crewSize: 2,
  },

  // --- แอร์แขวน / Ceiling type — 40 min ---
  // Client-confirmed 5 ส.ค. 2569: ฿900–1,100 flat, no BTU banding.
  {
    code: 'CLEAN-CEIL-24K', category: 'CLEANING_PM', acType: 'CEILING', jobSize: 'M',
    btuMin: 0, btuMax: 24000,
    nameTh: 'ล้างแอร์แขวน 0–24,000 BTU', nameEn: 'Clean ceiling type 0–24,000 BTU',
    durationMin: 40, priceMin: 900, priceMax: 1100, crewSize: 2,
  },
  {
    code: 'CLEAN-CEIL-36K', category: 'CLEANING_PM', acType: 'CEILING', jobSize: 'M',
    btuMin: 24001, btuMax: 36000,
    nameTh: 'ล้างแอร์แขวน 24,001–36,000 BTU', nameEn: 'Clean ceiling type 24,001–36,000 BTU',
    durationMin: 40, priceMin: 900, priceMax: 1100, crewSize: 2,
  },
  {
    code: 'CLEAN-CEIL-40KUP', category: 'CLEANING_PM', acType: 'CEILING', jobSize: 'M',
    btuMin: 40001, btuMax: null,
    nameTh: 'ล้างแอร์แขวน 40,001 BTU ขึ้นไป', nameEn: 'Clean ceiling type 40,001 BTU+',
    durationMin: 40, priceMin: 900, priceMax: 1100, crewSize: 2,
  },

  // --- แอร์ตู้ตั้ง / Standing type — 40 min ---
  // Client-confirmed 5 ส.ค. 2569: ฿900–1,200.
  {
    code: 'CLEAN-STAND-24K', category: 'CLEANING_PM', acType: 'STANDING', jobSize: 'M',
    btuMin: 0, btuMax: 24000,
    nameTh: 'ล้างแอร์ตู้ตั้ง 0–24,000 BTU', nameEn: 'Clean standing type 0–24,000 BTU',
    durationMin: 40, priceMin: 900, priceMax: 1200, crewSize: 2,
  },
  {
    code: 'CLEAN-STAND-36K', category: 'CLEANING_PM', acType: 'STANDING', jobSize: 'M',
    btuMin: 24001, btuMax: 36000,
    nameTh: 'ล้างแอร์ตู้ตั้ง 24,001–36,000 BTU', nameEn: 'Clean standing type 24,001–36,000 BTU',
    durationMin: 40, priceMin: 900, priceMax: 1200, crewSize: 2,
  },
  {
    code: 'CLEAN-STAND-40KUP', category: 'CLEANING_PM', acType: 'STANDING', jobSize: 'M',
    btuMin: 40001, btuMax: null,
    nameTh: 'ล้างแอร์ตู้ตั้ง 40,001 BTU ขึ้นไป', nameEn: 'Clean standing type 40,001 BTU+',
    durationMin: 40, priceMin: 900, priceMax: 1200, crewSize: 2,
  },

  // --- แอร์ฝังฝ้า 4 ทิศทาง / Cassette 4-way — 60 min ---
  // Client-confirmed 5 ส.ค. 2569: ฿900–1,400.
  {
    code: 'CLEAN-CAS4', category: 'CLEANING_PM', acType: 'CASSETTE_4WAY', jobSize: 'M',
    btuMin: null, btuMax: null,
    nameTh: 'ล้างแอร์ฝังฝ้า 4 ทิศทาง', nameEn: 'Clean cassette 4-way',
    durationMin: 60, priceMin: 900, priceMax: 1400, crewSize: 2,
  },

  // --- แอร์ฝังฝ้าทิศทางเดียว / Cassette 1-way — 60 min ---
  // Client-confirmed 5 ส.ค. 2569: ฿900–1,100.
  {
    code: 'CLEAN-CAS1', category: 'CLEANING_PM', acType: 'CASSETTE_1WAY', jobSize: 'M',
    btuMin: null, btuMax: null,
    nameTh: 'ล้างแอร์ฝังฝ้าทิศทางเดียว', nameEn: 'Clean cassette 1-way',
    durationMin: 60, priceMin: 900, priceMax: 1100, crewSize: 2,
  },

  // --- แอร์เปลือยซ่อนฝ้า / Concealed ducted — 90 min ---
  // Client-confirmed 9 ส.ค. 2569: ฿800–1,100.
  {
    code: 'CLEAN-CONC', category: 'CLEANING_PM', acType: 'CONCEALED', jobSize: 'L',
    btuMin: null, btuMax: null,
    nameTh: 'ล้างแอร์เปลือยซ่อนฝ้า', nameEn: 'Clean concealed ducted',
    durationMin: 90, priceMin: 800, priceMax: 1100, crewSize: 2,
  },

  // แอร์ซ่อนในฝ้า เล็ก/ใหญ่ (CLEAN-CONC-SM-24K, CLEAN-CONC-LG-36K,
  // CLEAN-CONC-LG-40KUP) were withdrawn by the client on 5 ส.ค. 2569 in favour
  // of เปลือยซ่อนฝ้า above. They are deliberately absent from this list rather
  // than listed-but-inactive: seedCatalog() deactivates whatever is missing, so
  // the list stays a statement of what is currently sold. The rows survive in
  // the database for jobs that already used them, and their AcType enum values
  // survive with them.

  // --- ระบบใหญ่ ---
  // Client-confirmed 5 ส.ค. 2569: AHU ฿1,800–6,500.
  {
    code: 'CLEAN-AHU', category: 'CLEANING_PM', acType: 'AHU', jobSize: 'XL',
    btuMin: null, btuMax: null,
    nameTh: 'ล้าง/บำรุงรักษา AHU', nameEn: 'AHU cleaning & maintenance',
    durationMin: 240, priceMin: 1800, priceMax: 6500, crewSize: 3,
  },
  {
    code: 'CLEAN-CHILLER', category: 'CLEANING_PM', acType: 'CHILLER', jobSize: 'XL',
    btuMin: null, btuMax: null,
    nameTh: 'ล้าง/บำรุงรักษา Chiller', nameEn: 'Chiller cleaning & maintenance',
    durationMin: 480, priceMin: 0, priceMax: 0, crewSize: 3,
  },
  {
    code: 'CLEAN-VRF', category: 'CLEANING_PM', acType: 'VRV_VRF', jobSize: 'XL',
    btuMin: null, btuMax: null,
    nameTh: 'ล้าง/บำรุงรักษาระบบ VRV/VRF', nameEn: 'VRV/VRF cleaning & maintenance',
    durationMin: 180, priceMin: 0, priceMax: 0, crewSize: 3,
  },
];

/** @client-confirm B1 / D4 — inspection and repair labour are placeholders. */
const OTHER_SERVICES: CatalogRow[] = [
  {
    code: 'INSPECT-STANDARD', category: 'INSPECTION_REPAIR', acType: 'OTHER', jobSize: 'S',
    btuMin: null, btuMax: null,
    nameTh: 'ตรวจเช็คหน้างาน', nameEn: 'On-site inspection',
    durationMin: 60, priceMin: 0, priceMax: 500, crewSize: 1,
  },
  {
    code: 'REPAIR-LABOUR-BASIC', category: 'REPAIR', acType: 'OTHER', jobSize: 'S',
    btuMin: null, btuMax: null,
    nameTh: 'ค่าแรงซ่อมทั่วไป', nameEn: 'Standard repair labour',
    durationMin: 90, priceMin: 800, priceMax: 1000, crewSize: 2,
  },
  {
    code: 'REPAIR-LABOUR-MAJOR', category: 'REPAIR', acType: 'OTHER', jobSize: 'L',
    btuMin: null, btuMax: null,
    nameTh: 'ค่าแรงซ่อมใหญ่ (คอมเพรสเซอร์/ระบบน้ำยา)', nameEn: 'Major repair labour',
    durationMin: 240, priceMin: 2500, priceMax: 3000, crewSize: 2,
  },
  {
    code: 'INSTALL-WALL-STD', category: 'INSTALLATION', acType: 'WALL', jobSize: 'M',
    btuMin: 0, btuMax: 24000,
    nameTh: 'ติดตั้งแอร์ติดผนัง (ท่อน้ำยา 4 เมตร)', nameEn: 'Wall type installation (4m line set)',
    durationMin: 180, priceMin: 3000, priceMax: 3000, crewSize: 2,
  },
];

/** @client-confirm D5/D6 — placeholder parts with placeholder prices. */
const PART_CATEGORIES = [
  { code: 'ELECTRICAL', nameTh: 'อุปกรณ์ไฟฟ้า', nameEn: 'Electrical' },
  { code: 'MECHANICAL', nameTh: 'อุปกรณ์กลไก', nameEn: 'Mechanical' },
  { code: 'REFRIGERANT', nameTh: 'ระบบน้ำยา', nameEn: 'Refrigerant system' },
  { code: 'CONSUMABLE', nameTh: 'วัสดุสิ้นเปลือง', nameEn: 'Consumables' },
];

const PARTS = [
  { sku: 'CAP-35UF', cat: 'ELECTRICAL', nameTh: 'คาปาซิเตอร์ 35uF', price: 350, warranty: 6 },
  { sku: 'CAP-45UF', cat: 'ELECTRICAL', nameTh: 'คาปาซิเตอร์ 45uF', price: 420, warranty: 6 },
  { sku: 'CONTACTOR-25A', cat: 'ELECTRICAL', nameTh: 'แมกเนติกคอนแทกเตอร์ 25A', price: 850, warranty: 6 },
  { sku: 'OVERLOAD-PROT', cat: 'ELECTRICAL', nameTh: 'โอเวอร์โหลดโพรเทกเตอร์', price: 450, warranty: 6 },
  { sku: 'PCB-INDOOR', cat: 'ELECTRICAL', nameTh: 'แผงวงจรคอยล์เย็น', price: 2800, warranty: 6 },
  { sku: 'THERMISTOR', cat: 'ELECTRICAL', nameTh: 'เซ็นเซอร์อุณหภูมิ', price: 380, warranty: 6 },
  { sku: 'REMOTE-UNIV', cat: 'ELECTRICAL', nameTh: 'รีโมทคอนโทรล (ยูนิเวอร์แซล)', price: 550, warranty: 3 },
  { sku: 'FANMOTOR-IN', cat: 'MECHANICAL', nameTh: 'มอเตอร์พัดลมคอยล์เย็น', price: 2200, warranty: 12 },
  { sku: 'FANMOTOR-OUT', cat: 'MECHANICAL', nameTh: 'มอเตอร์พัดลมคอยล์ร้อน', price: 2500, warranty: 12 },
  { sku: 'BLOWER-WHEEL', cat: 'MECHANICAL', nameTh: 'ใบพัดโบลเวอร์', price: 900, warranty: 6 },
  { sku: 'DRAIN-PUMP', cat: 'MECHANICAL', nameTh: 'ปั๊มน้ำทิ้ง', price: 1600, warranty: 6 },
  { sku: 'COMP-24K', cat: 'MECHANICAL', nameTh: 'คอมเพรสเซอร์ 24,000 BTU', price: 9500, warranty: 12 },
  { sku: 'REF-R32-KG', cat: 'REFRIGERANT', nameTh: 'น้ำยาแอร์ R32 (ต่อกิโลกรัม)', price: 750, warranty: 0 },
  { sku: 'REF-R410A-KG', cat: 'REFRIGERANT', nameTh: 'น้ำยาแอร์ R410A (ต่อกิโลกรัม)', price: 850, warranty: 0 },
  { sku: 'FILTER-DRIER', cat: 'REFRIGERANT', nameTh: 'ไดเออร์กรองความชื้น', price: 320, warranty: 6 },
  { sku: 'EXPANSION-VALVE', cat: 'REFRIGERANT', nameTh: 'วาล์วลดแรงดัน', price: 1400, warranty: 6 },
  { sku: 'AIR-FILTER', cat: 'CONSUMABLE', nameTh: 'แผ่นกรองอากาศ', price: 250, warranty: 0 },
  { sku: 'PIPE-INSUL-M', cat: 'CONSUMABLE', nameTh: 'ฉนวนหุ้มท่อ (ต่อเมตร)', price: 85, warranty: 0 },
  { sku: 'COPPER-PIPE-M', cat: 'CONSUMABLE', nameTh: 'ท่อทองแดง (ต่อเมตร)', price: 180, warranty: 0 },
  { sku: 'DRAIN-HOSE-M', cat: 'CONSUMABLE', nameTh: 'ท่อน้ำทิ้ง (ต่อเมตร)', price: 45, warranty: 0 },
];

export async function seedCatalog() {
  const activeFrom = new Date(Date.UTC(2026, 0, 1));

  for (const row of [...CLEANING, ...OTHER_SERVICES]) {
    await prisma.serviceCatalogItem.upsert({
      where: { code_activeFrom: { code: row.code, activeFrom } },
      create: {
        code: row.code,
        category: row.category,
        acType: row.acType,
        jobSize: row.jobSize,
        btuMin: row.btuMin,
        btuMax: row.btuMax,
        nameTh: row.nameTh,
        nameEn: row.nameEn,
        standardDurationMin: row.durationMin,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        crewSize: row.crewSize,
        activeFrom,
      },
      update: {
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        standardDurationMin: row.durationMin,
      },
    });
  }

  // Retire catalogue rows the price list no longer contains.
  //
  // Without this the seed only ever adds: renaming CLEAN-CAS4-40KUP to
  // CLEAN-CAS4 left both rows active for the same acType, and resolvePrice()
  // picks whichever the database returns first — so the quoted price for a
  // 4-way cassette silently depended on row order. Deactivating is safe for
  // history because charges snapshot their own price when they are written.
  const currentCodes = [...CLEANING, ...OTHER_SERVICES].map((r) => r.code);
  const retired = await prisma.serviceCatalogItem.updateMany({
    where: { code: { notIn: currentCodes }, isActive: true },
    data: { isActive: false, activeTo: activeFrom },
  });

  for (const c of PART_CATEGORIES) {
    await prisma.partCategory.upsert({ where: { code: c.code }, create: c, update: {} });
  }

  for (const p of PARTS) {
    const cat = await prisma.partCategory.findUniqueOrThrow({ where: { code: p.cat } });
    await prisma.part.upsert({
      where: { sku: p.sku },
      create: {
        sku: p.sku,
        categoryId: cat.id,
        nameTh: p.nameTh,
        defaultPrice: p.price,
        warrantyMonths: p.warranty || null,
      },
      update: { defaultPrice: p.price },
    });
  }

  console.log(
    `  catalog: ${CLEANING.length + OTHER_SERVICES.length} services (from NBC published price list), ` +
      `${PARTS.length} parts` +
      (retired.count ? `, ${retired.count} retired` : ''),
  );
}
