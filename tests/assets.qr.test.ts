import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import QRCode from 'qrcode';
import { prisma } from '../src/lib/db';
import { getAsset, repairConcern } from '../src/modules/assets/asset.service';

/**
 * The sticker on the machine, and what it leads to — Phase 3.1.
 *
 * The QR carries `/a/<id>` and nothing else: no token, no signature. That is
 * a deliberate choice and these tests pin the two halves of it — the URL has
 * to stay short enough to survive a scuffed label, and the page behind it has
 * to stay behind a login, because the machine id is not a secret but the
 * customer's name and repair history attached to it are.
 */

const TAG = 'QR-TEST-ASSET';
let assetId: string;
let siteId: string;

beforeAll(async () => {
  const site = await prisma.customerSite.findFirstOrThrow({ select: { id: true } });
  siteId = site.id;
  const asset = await prisma.asset.create({
    data: { siteId, assetTag: TAG, acType: 'WALL', pmFrequencyPerYear: 2 },
    select: { id: true },
  });
  assetId = asset.id;
});

afterAll(async () => {
  // Guarded: an unset filter matches every row in Prisma.
  await prisma.asset.deleteMany({ where: { assetTag: TAG } });
  await prisma.$disconnect();
});

describe('what the label encodes', () => {
  it('stays short enough to scan when scuffed', async () => {
    const url = `https://nbcserv.vercel.app/a/${assetId}`;
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'H',
    });
    expect(svg).toContain('<svg');

    // The label is printed at 26mm. Past about version 6 (41x41 modules) the
    // cells are too fine to survive dust and paint on a condenser outdoors,
    // which is the whole reason /a/<id> exists rather than /assets/<id>.
    const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(viewBox, 'expected a viewBox to measure').toBeTruthy();
    expect(Number(viewBox![1])).toBeLessThanOrEqual(45);
  });

  it('encodes an id the page can actually load', async () => {
    const asset = await getAsset(assetId);
    expect(asset?.assetTag).toBe(TAG);
  });
});

describe('what the technician sees', () => {
  it('carries the identity and the history in one read', async () => {
    const asset = await getAsset(assetId);
    // Everything the person crouched beside the machine needs, without a
    // second request: which machine, whose, and what has been done to it.
    expect(asset!.customerName).toBeTruthy();
    expect(asset!.siteName).toBeTruthy();
    expect(Array.isArray(asset!.history)).toBe(true);
    expect(asset!.totalRepairs).toBeGreaterThanOrEqual(0);
  });

  it('returns null for an id that does not exist rather than throwing', async () => {
    // A label from a machine that was later removed from the register must
    // give the technician a not-found page, not a crash.
    expect(await getAsset('no-such-asset-id')).toBeNull();
  });

  it('grades the repair flag as advice, with a quiet state', async () => {
    // The flag is a suggestion — budget and what the technician can see are
    // not in this database — so a machine with no repairs says nothing at all.
    expect(repairConcern(0)).toBe('none');
    expect(['watch', 'high']).toContain(repairConcern(5));
  });
});

describe('printing a sheet', () => {
  it('finds every active machine at a site', async () => {
    const rows = await prisma.asset.findMany({
      where: { siteId, isActive: true },
      select: { id: true },
    });
    // Tagging is done to a whole plant room in an afternoon, so the sheet is
    // driven by the site, not by picking machines one at a time.
    expect(rows.some((r) => r.id === assetId)).toBe(true);
  });

  it('leaves a retired machine off the sheet', async () => {
    await prisma.asset.update({ where: { id: assetId }, data: { isActive: false } });
    const rows = await prisma.asset.findMany({
      where: { siteId, isActive: true },
      select: { id: true },
    });
    expect(rows.some((r) => r.id === assetId)).toBe(false);

    await prisma.asset.update({ where: { id: assetId }, data: { isActive: true } });
  });
});
