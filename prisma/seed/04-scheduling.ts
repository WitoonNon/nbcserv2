import { prisma, utcDate } from './client.js';
import type { ServiceCategory } from '../../src/generated/prisma/index.js';

/**
 * Zones, quota rules and holidays.
 *
 * @client-confirm C3 — one default zone is seeded. Adding the client's real
 * service areas is inserting rows; no schema change and no code change.
 */

const ZONES = [
  {
    code: 'BKK-METRO',
    nameTh: 'กรุงเทพฯ และปริมณฑล',
    nameEn: 'Bangkok & Vicinity',
    provinces: ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'],
  },
];

/**
 * Daily caps — our design, since the client delegated the decision.
 *
 * IMPORTANT — what the minute axis measures:
 * `maxTechnicianMinutes` holds **crew-minutes**, i.e. elapsed time of the
 * assigned crew, because the published service durations (30/40/60/90 min per
 * unit) are elapsed times for a crew, not per-person effort.
 *
 * Total daily capacity = 3 crews x 420 productive minutes = 1,260 crew-minutes.
 * The four categories share those same crews, so their caps are a SPLIT of
 * that total, not four independent full allowances — otherwise the calendar
 * would happily sell four times the company's real capacity.
 *
 *   cleaning/PM 840  +  repair 280  +  inspection 140  =  1,260
 *
 * Installation is capped by job count only; those jobs are quoted and
 * scheduled by hand rather than booked online.
 */
const QUOTA_RULES: {
  name: string;
  category: ServiceCategory;
  maxJobs: number | null;
  maxUnits: number | null;
  /** crew-minutes — see the note above */
  maxMinutes: number | null;
  priority: number;
}[] = [
  {
    name: 'โควตางานล้าง/PM รายวัน (จันทร์–เสาร์)',
    category: 'CLEANING_PM',
    maxJobs: 8,
    maxUnits: 40,
    maxMinutes: 840, // 2 ทีมเต็มวัน
    priority: 10,
  },
  {
    name: 'โควตางานซ่อมรายวัน',
    category: 'REPAIR',
    maxJobs: 4,
    maxUnits: 8,
    maxMinutes: 280,
    priority: 10,
  },
  {
    name: 'โควตางานตรวจเช็ค/แจ้งซ่อมรายวัน',
    category: 'INSPECTION_REPAIR',
    maxJobs: 3,
    maxUnits: 6,
    maxMinutes: 140,
    priority: 10,
  },
  {
    name: 'โควตางานติดตั้งรายวัน (นัดด้วยมือ)',
    category: 'INSTALLATION',
    maxJobs: 2,
    maxUnits: 4,
    maxMinutes: null,
    priority: 10,
  },
];

/**
 * @client-confirm C8 — fixed-date Thai public holidays only.
 *
 * Lunar-calendar holidays (มาฆบูชา, วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา) move each
 * year and are deliberately NOT guessed here — the client must supply the
 * official list. Seeding a wrong date would silently close a working day.
 */
const HOLIDAYS_2026 = [
  { m: 1, d: 1, nameTh: 'วันขึ้นปีใหม่', nameEn: "New Year's Day" },
  { m: 4, d: 6, nameTh: 'วันจักรี', nameEn: 'Chakri Day' },
  { m: 4, d: 13, nameTh: 'วันสงกรานต์', nameEn: 'Songkran' },
  { m: 4, d: 14, nameTh: 'วันสงกรานต์', nameEn: 'Songkran' },
  { m: 4, d: 15, nameTh: 'วันสงกรานต์', nameEn: 'Songkran' },
  { m: 5, d: 1, nameTh: 'วันแรงงานแห่งชาติ', nameEn: 'Labour Day' },
  { m: 6, d: 3, nameTh: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี', nameEn: "Queen's Birthday" },
  { m: 7, d: 28, nameTh: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', nameEn: "King's Birthday" },
  { m: 8, d: 12, nameTh: 'วันแม่แห่งชาติ', nameEn: "Mother's Day" },
  { m: 10, d: 13, nameTh: 'วันนวมินทรมหาราช', nameEn: 'King Bhumibol Memorial Day' },
  { m: 10, d: 23, nameTh: 'วันปิยมหาราช', nameEn: 'Chulalongkorn Day' },
  { m: 12, d: 5, nameTh: 'วันพ่อแห่งชาติ', nameEn: "Father's Day" },
  { m: 12, d: 10, nameTh: 'วันรัฐธรรมนูญ', nameEn: 'Constitution Day' },
  { m: 12, d: 31, nameTh: 'วันสิ้นปี', nameEn: "New Year's Eve" },
];

export async function seedScheduling() {
  for (const z of ZONES) {
    await prisma.zone.upsert({
      where: { code: z.code },
      create: z,
      update: { nameTh: z.nameTh, provinces: z.provinces },
    });
  }

  const zone = await prisma.zone.findUniqueOrThrow({ where: { code: 'BKK-METRO' } });
  const effectiveFrom = utcDate(2026, 1, 1);

  for (const r of QUOTA_RULES) {
    const existing = await prisma.quotaRule.findFirst({ where: { name: r.name } });
    const data = {
      name: r.name,
      scopeType: 'WEEKDAY' as const,
      effectiveFrom,
      weekdayMask: 126, // Mon–Sat
      zoneId: zone.id,
      category: r.category,
      maxJobs: r.maxJobs,
      maxUnits: r.maxUnits,
      maxTechnicianMinutes: r.maxMinutes,
      priority: r.priority,
    };
    if (existing) {
      await prisma.quotaRule.update({ where: { id: existing.id }, data });
    } else {
      await prisma.quotaRule.create({ data });
    }
  }

  for (const h of HOLIDAYS_2026) {
    const date = utcDate(2026, h.m, h.d);
    await prisma.holiday.upsert({
      where: { date },
      create: { date, nameTh: h.nameTh, nameEn: h.nameEn },
      update: { nameTh: h.nameTh },
    });
  }

  console.log(`  scheduling: ${ZONES.length} zone, ${QUOTA_RULES.length} quota rules, ${HOLIDAYS_2026.length} holidays (fixed-date only)`);
}
