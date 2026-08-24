import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  listAssets,
  getAsset,
  countRepeatRepairs,
  setJobAssets,
  selectableAssetsForJob,
  AssetLinkError,
  HISTORY_PER_PAGE,
} from '../src/modules/assets/asset.service';

/**
 * The register against real Postgres.
 *
 * Two things are defended here. The first is that paging is a window onto one
 * ordered list and not a set of independent queries — the failure mode is
 * silent: a unit that appears on both page one and page two has pushed another
 * unit off the end, and nobody notices a machine that is simply never listed.
 *
 * The second is that a job can only be linked to machines at its own site.
 * The ids arrive from a browser, and a link written across customers would put
 * one company's equipment into another's service history, which is precisely
 * the record this register exists to be trusted on.
 *
 * Requires DATABASE_URL and a seeded database.
 */

const PHONE = '0899999311';
const TAG = 'TESTREG-';
const TOTAL = HISTORY_PER_PAGE + 4; // enough to need a second page

let siteId: string;
let otherSiteId: string;
let jobId: string;
let assetIds: string[] = [];
let foreignAssetId: string;

async function cleanUp() {
  const customers = await prisma.customer.findMany({
    where: { phone: PHONE },
    select: { id: true },
  });
  const ids = customers.map((c) => c.id);
  // Guarded: an unset filter in Prisma matches everything, and these
  // deleteMany calls would then empty the tables for the whole company.
  if (ids.length === 0) return;

  const jobs = await prisma.job.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  const jobIds = jobs.map((j) => j.id);
  if (jobIds.length > 0) {
    await prisma.jobAsset.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobCharge.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  }
  await prisma.asset.deleteMany({ where: { site: { customerId: { in: ids } } } });
  await prisma.customerSite.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  await cleanUp();

  const customer = await prisma.customer.create({
    data: {
      code: `TESTREG-${Date.now()}`,
      legalName: 'บริษัท ทดสอบทะเบียน จำกัด',
      displayName: 'ลูกค้าทดสอบทะเบียน',
      phone: PHONE,
      sites: {
        create: [
          { code: 'SITE-A', name: 'อาคาร A', address: '1 ถนนทดสอบ' },
          { code: 'SITE-B', name: 'อาคาร B', address: '2 ถนนทดสอบ' },
        ],
      },
    },
    include: { sites: { orderBy: { code: 'asc' } } },
  });
  siteId = customer.sites[0]!.id;
  otherSiteId = customer.sites[1]!.id;

  // Deliberately created out of tag order, and all due the same day, so the
  // ordering under test is the one the service asks for and not insertion order.
  const due = new Date('2027-01-15T00:00:00.000Z');
  const order = Array.from({ length: TOTAL }, (_, i) => i).reverse();
  for (const i of order) {
    const a = await prisma.asset.create({
      data: {
        siteId,
        assetTag: `${TAG}${String(i).padStart(3, '0')}`,
        acType: 'WALL',
        nextPmDueAt: due,
      },
    });
    assetIds[i] = a.id;
  }

  const foreign = await prisma.asset.create({
    data: { siteId: otherSiteId, assetTag: `${TAG}FOREIGN`, acType: 'WALL' },
  });
  foreignAssetId = foreign.id;

  const job = await prisma.job.create({
    data: {
      jobNo: `TESTREG-JOB-${Date.now()}`,
      customerId: customer.id,
      siteId,
      category: 'REPAIR',
      status: 'SUBMITTED',
    },
  });
  jobId = job.id;
});

afterAll(cleanUp);

describe('paging the register', () => {
  it('returns one page and the total, not the whole table', async () => {
    const p = await listAssets({ siteId, perPage: 10 });
    expect(p.rows).toHaveLength(10);
    expect(p.total).toBe(TOTAL);
    expect(p.page).toBe(1);
  });

  it('never shows the same unit on two pages, and shows every unit once', async () => {
    const seen: string[] = [];
    const perPage = 7;
    const pages = Math.ceil(TOTAL / perPage);
    for (let page = 1; page <= pages; page++) {
      const p = await listAssets({ siteId, perPage, page });
      seen.push(...p.rows.map((r) => r.assetTag));
    }
    expect(new Set(seen).size).toBe(TOTAL);
    // Every unit shares one PM date here, so only the tie-breaker can produce
    // a stable order — this asserts the tie-breaker is doing the work.
    expect(seen).toEqual([...seen].sort());
  });

  it('clamps a page past the end instead of returning nothing', async () => {
    const p = await listAssets({ siteId, perPage: 10, page: 99 });
    expect(p.page).toBe(Math.ceil(TOTAL / 10));
    expect(p.rows.length).toBeGreaterThan(0);
  });

  it('clamps junk in the page parameter', async () => {
    for (const page of [0, -3, Number.NaN]) {
      const p = await listAssets({ siteId, perPage: 10, page });
      expect(p.page).toBe(1);
    }
  });

  it('counts the whole filtered register, not the page', async () => {
    const p = await listAssets({ siteId, perPage: 3 });
    expect(p.rows).toHaveLength(3);
    expect(p.total).toBe(TOTAL);
  });

  it('reports nothing to worry about when no unit repeats', async () => {
    expect(await countRepeatRepairs({ siteId })).toBe(0);
  });
});

describe('paging one machine’s history', () => {
  it('pages the table while the totals stay whole', async () => {
    // Link enough jobs to this unit to need a second page of history.
    const target = assetIds[0]!;
    const jobs = [];
    for (let i = 0; i < HISTORY_PER_PAGE + 2; i++) {
      const j = await prisma.job.create({
        data: {
          jobNo: `TESTREG-HIST-${Date.now()}-${i}`,
          customerId: (await prisma.customerSite.findUniqueOrThrow({ where: { id: siteId } }))
            .customerId,
          siteId,
          category: 'REPAIR',
          status: 'CLOSED',
          scheduledDate: new Date(Date.UTC(2026, 0, i + 1)),
        },
      });
      jobs.push(j.id);
      await prisma.jobAsset.create({ data: { jobId: j.id, assetId: target, quantity: 1 } });
    }

    const first = await getAsset(target, { historyPage: 1 });
    const second = await getAsset(target, { historyPage: 2 });

    expect(first!.history).toHaveLength(HISTORY_PER_PAGE);
    expect(second!.history).toHaveLength(2);
    expect(first!.historyTotal).toBe(HISTORY_PER_PAGE + 2);

    // The counts above the table describe the machine, so they must not change
    // when the reader turns the page.
    expect(second!.totalRepairs).toBe(first!.totalRepairs);
    expect(first!.totalRepairs).toBe(HISTORY_PER_PAGE + 2);

    const ids = [...first!.history, ...second!.history].map((h) => h.jobId);
    expect(new Set(ids).size).toBe(HISTORY_PER_PAGE + 2);

    // Newest first: the reader wants the most recent visit, not the oldest.
    expect(first!.history[0]!.scheduledDate! > first!.history[1]!.scheduledDate!).toBe(true);
  });
});

describe('linking a job to machines', () => {
  it('offers only the machines at the job’s own site', async () => {
    const offered = await selectableAssetsForJob(jobId);
    expect(offered).toHaveLength(TOTAL);
    expect(offered.map((o) => o.id)).not.toContain(foreignAssetId);
  });

  it('refuses a machine from another site even when the id is real', async () => {
    await expect(setJobAssets({ jobId, assetIds: [foreignAssetId] })).rejects.toBeInstanceOf(
      AssetLinkError,
    );
    const after = await prisma.jobAsset.count({ where: { jobId } });
    expect(after).toBe(0);
  });

  it('adds and removes only the difference, keeping notes on links that stay', async () => {
    await setJobAssets({ jobId, assetIds: [assetIds[1]!, assetIds[2]!] });
    await prisma.jobAsset.updateMany({
      where: { jobId, assetId: assetIds[1]! },
      data: { note: 'คอมเพรสเซอร์มีเสียง' },
    });

    const result = await setJobAssets({ jobId, assetIds: [assetIds[1]!, assetIds[3]!] });
    expect(result).toEqual({ added: 1, removed: 1 });

    const kept = await prisma.jobAsset.findFirstOrThrow({
      where: { jobId, assetId: assetIds[1]! },
    });
    expect(kept.note).toBe('คอมเพรสเซอร์มีเสียง');
  });
});
