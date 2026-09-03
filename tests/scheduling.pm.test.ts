import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/db';
import {
  confirmPmProposal,
  dismissPmProposal,
  findSitesDueForPm,
  listPmProposals,
  PmPlanningError,
  proposePmJobs,
  recordPmVisit,
} from '../src/modules/scheduling/pm.service';
import { dateOnly, materialiseQuota } from '../src/modules/scheduling/quota.service';

/**
 * PM proposals against real Postgres.
 *
 * The rules defended here are the ones that decide whether the planner is
 * useful or a nuisance: it must not suggest the same visit every morning, must
 * not hold quota for a visit nobody has agreed to, and must group a site's
 * machines into one trip rather than one trip each.
 *
 * The spreading logic itself is tested without a database in
 * scheduling.pm-planner.test.ts — that is the part with the judgement in it.
 *
 * Requires DATABASE_URL and a seeded database.
 *
 * ⚠️ NOT YET RUN. Written while the development database was unreachable
 * (the Supabase project the local .env pointed at had gone). Everything else
 * in this feature is typechecked and the pure planner is green; this file is
 * the part that still needs a real database behind it.
 */

const PHONE = '0899999008';

let zoneId: string;
let siteId: string;
let customerId: string;
let assetIds: string[];
let actorId: string;

async function cleanUp() {
  const customers = await prisma.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return;

  const jobs = await prisma.job.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

  // Guarded: an unset filter matches every row in Prisma, and these would
  // then empty the tables for the whole company.
  if (jobIds.length > 0) {
    await prisma.jobAsset.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobStatusEvent.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobCharge.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  }
  const sites = await prisma.customerSite.findMany({
    where: { customerId: { in: ids } },
    select: { id: true },
  });
  if (sites.length > 0) {
    await prisma.asset.deleteMany({ where: { siteId: { in: sites.map((s) => s.id) } } });
  }
  await prisma.customerSite.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const zone = await prisma.zone.findFirstOrThrow({ where: { isActive: true } });
  zoneId = zone.id;
  actorId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;

  // The planner reads the quota calendar; without buckets every day looks shut
  // and the whole suite would fail for the wrong reason.
  const from = dateOnly(new Date());
  await materialiseQuota(from, new Date(from.getTime() + 90 * 86_400_000));
});

beforeEach(async () => {
  await cleanUp();

  const customer = await prisma.customer.create({
    data: {
      code: `CUS-PM-${Date.now()}`,
      type: 'CORPORATE',
      legalName: 'ลูกค้าทดสอบ PM',
      displayName: 'ลูกค้าทดสอบ PM',
      segment: 'HOTEL',
      phone: PHONE,
    },
  });
  customerId = customer.id;

  const site = await prisma.customerSite.create({
    data: { customerId, code: 'SITE-PM1', name: 'อาคารทดสอบ PM', address: 'ทดสอบ', zoneId },
  });
  siteId = site.id;

  // Three machines at one site, all due in a week.
  const dueInAWeek = new Date(Date.now() + 7 * 86_400_000);
  const created = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.asset.create({
        data: {
          siteId,
          assetTag: `PM-${n}`,
          acType: 'WALL',
          pmFrequencyPerYear: 2,
          nextPmDueAt: dueInAWeek,
        },
        select: { id: true },
      }),
    ),
  );
  assetIds = created.map((a) => a.id);
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('finding what is due', () => {
  it('groups a site\'s machines into one visit', async () => {
    const due = (await findSitesDueForPm()).filter((s) => s.siteId === siteId);

    // Twelve units at a hotel is one afternoon, not twelve trips, twelve
    // document numbers and twelve quota slots.
    expect(due).toHaveLength(1);
    expect(due[0]!.assets).toHaveLength(3);
    expect(due[0]!.units).toBe(3);
  });

  it('ignores machines that are not due yet', async () => {
    await prisma.asset.updateMany({
      where: { siteId },
      data: { nextPmDueAt: new Date(Date.now() + 200 * 86_400_000) },
    });

    expect((await findSitesDueForPm()).some((s) => s.siteId === siteId)).toBe(false);
  });

  it('ignores machines that were retired', async () => {
    await prisma.asset.updateMany({ where: { siteId }, data: { isActive: false } });

    expect((await findSitesDueForPm()).some((s) => s.siteId === siteId)).toBe(false);
  });

  it('dates the visit from the earliest machine, not the latest', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000);
    await prisma.asset.update({ where: { id: assetIds[0]! }, data: { nextPmDueAt: soon } });

    const due = (await findSitesDueForPm()).find((s) => s.siteId === siteId);
    expect(due!.dueOn).toBe(dateOnly(soon).toISOString().slice(0, 10));
  });
});

describe('proposing', () => {
  it('raises one DRAFT job that holds no quota', async () => {
    const result = await proposePmJobs();
    const mine = result.proposed.filter((p) => p.siteId === siteId);
    expect(mine).toHaveLength(1);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: mine[0]!.jobId } });
    expect(job.status).toBe('DRAFT');
    expect(job.createdVia).toBe('SYSTEM');
    expect(job.category).toBe('CLEANING_PM');
    // A machine nobody has agreed a visit for must not take a slot from a
    // customer trying to book one now.
    expect(job.quotaDayId).toBeNull();
    expect(job.unitCount).toBe(3);
  });

  it('attaches the machines the visit is for', async () => {
    const result = await proposePmJobs();
    const jobId = result.proposed.find((p) => p.siteId === siteId)!.jobId;

    const linked = await prisma.jobAsset.findMany({
      where: { jobId },
      select: { assetId: true },
    });
    expect(linked.map((l) => l.assetId).sort()).toEqual([...assetIds].sort());
  });

  it('does not suggest the same visit again tomorrow', async () => {
    await proposePmJobs();
    const second = await proposePmJobs();

    // The cron runs daily. An unconfirmed proposal from yesterday is still a
    // proposal; suggesting it again every morning is how a useful feature
    // becomes something the office learns to ignore.
    expect(second.proposed.some((p) => p.siteId === siteId)).toBe(false);
  });

  it('leaves the machines alone when a person already raised the job', async () => {
    await prisma.job.create({
      data: {
        jobNo: `JOB-PM-MANUAL-${Date.now()}`,
        customerId,
        siteId,
        category: 'CLEANING_PM',
        status: 'SCHEDULED',
        createdVia: 'PHONE',
        assets: { create: [{ assetId: assetIds[0]!, quantity: 1 }] },
      },
    });

    const result = await proposePmJobs();
    // One machine is covered, so that site is no longer wholly due — the
    // office is already dealing with it.
    expect(result.proposed.some((p) => p.assetIds.includes(assetIds[0]!))).toBe(false);
  });

  it('writes nothing on a dry run', async () => {
    const before = await prisma.job.count({ where: { siteId } });
    const result = await proposePmJobs({ dryRun: true });

    expect(result.proposed.some((p) => p.siteId === siteId)).toBe(true);
    expect(await prisma.job.count({ where: { siteId } })).toBe(before);
  });

  it('reports a site with no zone rather than guessing one', async () => {
    await prisma.customerSite.update({ where: { id: siteId }, data: { zoneId: null } });

    const result = await proposePmJobs();
    // Putting it in an arbitrary zone would book technicians into an area
    // they do not cover.
    expect(result.unplaced.some((u) => u.siteId === siteId)).toBe(true);
    expect(result.proposed.some((p) => p.siteId === siteId)).toBe(false);
  });
});

describe('closing a visit moves the cycle', () => {
  it('sets the next due date from when the work was done', async () => {
    const { proposed } = await proposePmJobs();
    const jobId = proposed.find((p) => p.siteId === siteId)!.jobId;

    const completedAt = new Date('2026-09-15T00:00:00Z');
    const updated = await recordPmVisit(jobId, completedAt);
    expect(updated).toBe(3);

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetIds[0]! } });
    expect(asset.lastPmAt?.toISOString()).toBe(completedAt.toISOString());
    // Twice a year, counted from the visit — not from when it was due.
    expect(asset.nextPmDueAt?.toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('respects each machine\'s own frequency within one visit', async () => {
    await prisma.asset.update({
      where: { id: assetIds[0]! },
      data: { pmFrequencyPerYear: 4 },
    });
    const { proposed } = await proposePmJobs();
    const jobId = proposed.find((p) => p.siteId === siteId)!.jobId;

    await recordPmVisit(jobId, new Date('2026-09-15T00:00:00Z'));

    // A server room runs four visits a year while the lobby runs two, even
    // though both were serviced on the same trip.
    const quarterly = await prisma.asset.findUniqueOrThrow({ where: { id: assetIds[0]! } });
    const halfYearly = await prisma.asset.findUniqueOrThrow({ where: { id: assetIds[1]! } });
    expect(quarterly.nextPmDueAt?.toISOString().slice(0, 10)).toBe('2026-12-15');
    expect(halfYearly.nextPmDueAt?.toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('does nothing for a job that was not a PM visit', async () => {
    const repair = await prisma.job.create({
      data: {
        jobNo: `JOB-PM-REPAIR-${Date.now()}`,
        customerId,
        siteId,
        category: 'REPAIR',
        status: 'COMPLETED',
        createdVia: 'PHONE',
        assets: { create: [{ assetId: assetIds[0]!, quantity: 1 }] },
      },
      select: { id: true },
    });

    // Fixing a fault is not a service. Rolling the cycle forward here would
    // skip a PM the machine is still owed.
    expect(await recordPmVisit(repair.id)).toBe(0);
  });
});

describe('answering a proposal', () => {
  async function propose() {
    const plan = await proposePmJobs();
    const mine = plan.proposed.find((p) => p.siteId === siteId);
    expect(mine, 'expected a proposal for the test site').toBeTruthy();
    return mine!;
  }

  it('holds no quota until somebody confirms', async () => {
    const proposal = await propose();
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: proposal.jobId },
      select: { status: true, quotaDayId: true },
    });

    // A machine nobody has agreed a visit for must not take a slot away from
    // a customer trying to book one right now.
    expect(job.status).toBe('DRAFT');
    expect(job.quotaDayId).toBeNull();
  });

  it('books the slot and moves the job on when confirmed', async () => {
    const proposal = await propose();
    const before = await prisma.quotaDay.findFirstOrThrow({
      where: { quotaDate: dateOnly(proposal.scheduledDate), zoneId, category: 'CLEANING_PM' },
      select: { usedJobs: true, usedUnits: true },
    });

    const result = await confirmPmProposal({ jobId: proposal.jobId, actorId });
    expect(result.jobNo).toBe(proposal.jobNo);

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: proposal.jobId },
      select: { status: true, quotaDayId: true },
    });
    expect(job.status).toBe('SUBMITTED');
    expect(job.quotaDayId).not.toBeNull();

    const after = await prisma.quotaDay.findUniqueOrThrow({
      where: { id: job.quotaDayId! },
      select: { usedJobs: true, usedUnits: true },
    });
    // The slot is consumed at confirmation, not at proposal — that is the
    // entire design of this feature in one assertion.
    expect(after.usedJobs).toBe(before.usedJobs + 1);
    expect(after.usedUnits).toBe(before.usedUnits + 3);
  });

  it('writes a status event so the job reads like any other', async () => {
    const proposal = await propose();
    await confirmPmProposal({ jobId: proposal.jobId, actorId });

    const events = await prisma.jobStatusEvent.findMany({
      where: { jobId: proposal.jobId, toStatus: 'SUBMITTED' },
    });
    expect(events).toHaveLength(1);
  });

  it('refuses to confirm the same proposal twice', async () => {
    const proposal = await propose();
    await confirmPmProposal({ jobId: proposal.jobId, actorId });

    // Two people working the same queue is the ordinary case. The second one
    // must not book a second slot for one visit.
    await expect(
      confirmPmProposal({ jobId: proposal.jobId, actorId }),
    ).rejects.toBeInstanceOf(PmPlanningError);
  });

  it('cancels with a reason instead of deleting when dismissed', async () => {
    const proposal = await propose();
    await dismissPmProposal({ jobId: proposal.jobId, actorId, reason: 'ลูกค้าเลื่อน' });

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: proposal.jobId },
      select: { status: true, cancelledReason: true, quotaDayId: true },
    });
    // Kept, because the machine is still due tomorrow and this row is what
    // tells the office they have already looked at it.
    expect(job.status).toBe('CANCELLED');
    expect(job.cancelledReason).toBe('ลูกค้าเลื่อน');
    expect(job.quotaDayId).toBeNull();
  });

  it('will not dismiss without a reason', async () => {
    const proposal = await propose();
    await expect(
      dismissPmProposal({ jobId: proposal.jobId, actorId, reason: '   ' }),
    ).rejects.toBeInstanceOf(PmPlanningError);
  });

  it('drops a decided proposal out of the queue', async () => {
    const proposal = await propose();
    expect((await listPmProposals()).some((p) => p.jobId === proposal.jobId)).toBe(true);

    await confirmPmProposal({ jobId: proposal.jobId, actorId });
    expect((await listPmProposals()).some((p) => p.jobId === proposal.jobId)).toBe(false);
  });

  it('describes the visit well enough to decide on', async () => {
    const proposal = await propose();
    const row = (await listPmProposals()).find((p) => p.jobId === proposal.jobId)!;

    expect(row.customerName).toBe('ลูกค้าทดสอบ PM');
    expect(row.siteName).toBe('อาคารทดสอบ PM');
    expect(row.assetCount).toBe(3);
    expect(row.units).toBe(3);
  });
});
