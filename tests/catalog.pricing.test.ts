import { describe, it, expect, afterAll } from 'vitest';
import type { AcType } from '../src/generated/prisma';
import { prisma } from '../src/lib/db';
import { estimateBooking } from '../src/modules/scheduling/booking.service';

/**
 * The published cleaning price list, as confirmed by the client on
 * 5 ส.ค. 2569.
 *
 * These numbers are quoted to customers on a public page, so they are worth a
 * test: the seed only upserts, and a stale catalogue row for the same machine
 * type would let resolvePrice() return whichever the database happened to
 * return first. That is exactly the bug this file caught — a renamed
 * 4-way-cassette row left two active entries priced ฿1,000–1,200 and
 * ฿900–1,400, and which one a customer saw depended on row order.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PRICE_LIST: { acType: AcType; th: string; low: number; high: number; minutes: number }[] = [
  { acType: 'WALL', th: 'ผนัง', low: 500, high: 650, minutes: 30 },
  { acType: 'CEILING', th: 'แขวน', low: 900, high: 1100, minutes: 40 },
  { acType: 'STANDING', th: 'ตู้ตั้ง', low: 900, high: 1200, minutes: 40 },
  { acType: 'CASSETTE_4WAY', th: 'ฝังฝ้าสี่ทิศทาง', low: 900, high: 1400, minutes: 60 },
  { acType: 'CASSETTE_1WAY', th: 'ฝังฝ้าทิศทางเดียว', low: 900, high: 1100, minutes: 60 },
  { acType: 'CONCEALED', th: 'เปลือยซ่อนฝ้า', low: 800, high: 1100, minutes: 90 },
  { acType: 'AHU', th: 'AHU', low: 1800, high: 6500, minutes: 240 },
];

afterAll(async () => {
  await prisma.$disconnect();
});

describe('published cleaning prices', () => {
  it.each(PRICE_LIST)('$th quotes ฿$low–$high per unit', async (row) => {
    const estimate = await estimateBooking({
      category: 'CLEANING_PM',
      acType: row.acType,
      unitCount: 1,
    });

    expect(estimate.priceRange).toEqual({ low: row.low, high: row.high });
    expect(estimate.minutesPerUnit).toBe(row.minutes);
  });

  it('quotes nothing for a machine type the client has not priced yet', async () => {
    // Chiller has no price from the client. Showing ฿0 on a public booking
    // page would read as "free", so the absence has to survive as null all the
    // way to the UI.
    const estimate = await estimateBooking({
      category: 'CLEANING_PM',
      acType: 'CHILLER',
      unitCount: 1,
    });

    expect(estimate.priceRange).toBeNull();
  });

  it('never collapses the band to a single number', async () => {
    // The band is a quotation range driven by site access, height and volume —
    // judgements nobody has made yet when a customer is looking at the booking
    // page. Anything that picked one figure here would be quoting a price the
    // office cannot honour.
    const estimate = await estimateBooking({
      category: 'CLEANING_PM',
      acType: 'CEILING',
      unitCount: 10,
    });

    expect(estimate.priceRange).toEqual({ low: 900, high: 1100 });
    expect(estimate).not.toHaveProperty('unitPrice');
    expect(estimate).not.toHaveProperty('estimatedTotal');
  });

  it('keeps exactly one active catalogue row per cleaning machine type', async () => {
    // Two active rows for one type is the condition that makes the quoted
    // price depend on row order.
    const rows = await prisma.serviceCatalogItem.findMany({
      where: { category: 'CLEANING_PM', isActive: true },
      select: { acType: true, code: true, btuMin: true, btuMax: true },
    });

    const unbanded = rows.filter((r) => r.btuMin === null && r.btuMax === null);
    const seen = new Map<AcType, string[]>();
    for (const r of unbanded) {
      if (!r.acType) continue;
      seen.set(r.acType, [...(seen.get(r.acType) ?? []), r.code]);
    }

    const duplicated = [...seen.entries()].filter(([, codes]) => codes.length > 1);
    expect(duplicated).toEqual([]);
  });

  it('no longer offers the retired concealed small/large types', async () => {
    const retired = await prisma.serviceCatalogItem.findMany({
      where: {
        category: 'CLEANING_PM',
        acType: { in: ['CONCEALED_SMALL', 'CONCEALED_LARGE'] },
        isActive: true,
      },
      select: { code: true },
    });

    // The rows still exist for historical jobs; they must simply be inactive
    // so resolvePrice() never quotes them to a new customer.
    expect(retired).toEqual([]);
  });
});
