import { prisma } from '@/lib/db';
import type { AcType, Prisma } from '@/generated/prisma';
import { nextDocumentNo } from '@/modules/workorders/sequence.service';
import { dateOnly, getAvailability } from './quota.service';
import {
  MAX_PM_PROPOSALS_PER_DAY,
  nextPmDueAfter,
  planPmBatch,
  PM_WINDOW_AFTER_DAYS,
  PM_WINDOW_BEFORE_DAYS,
  type PmSlotRequest,
} from './pm-planner';

/**
 * Preventive maintenance, proposed rather than booked (Phase 3.4).
 *
 * The client's price list already sells PM on a 2 / 3 / 4 visits-a-year cycle,
 * and `Asset.nextPmDueAt` has been carrying the due date since the asset
 * register was built. Nothing acted on it: somebody had to remember. This is
 * the part that remembers.
 *
 * ## Three decisions worth knowing before changing anything here
 *
 * **A proposal is a DRAFT job, not a booking.** It consumes no quota and sends
 * the customer nothing. Until a person confirms it, it is the system saying
 * "this machine is due, shall we?" — and a machine nobody has agreed a visit
 * for must never hold a slot away from a customer trying to book one now.
 *
 * **One job per site, not per machine.** A hotel with twelve units gets one
 * visit with twelve machines on it. Per-machine jobs would be twelve trips,
 * twelve document numbers, and twelve quota slots for one afternoon's work.
 *
 * **Visits are spread across days.** See pm-planner.ts — that is where the
 * judgement lives, and it is pure so it can be tested without a database.
 */

export class PmPlanningError extends Error {}

/** How far ahead the planner looks for machines coming due. */
export const PM_LOOKAHEAD_DAYS = 30;

/** Minutes assumed per unit when the catalogue has nothing more specific. */
const FALLBACK_MINUTES_PER_UNIT = 30;

export interface PmProposal {
  jobId: string;
  jobNo: string;
  siteId: string;
  customerName: string;
  siteName: string;
  scheduledDate: string;
  assetIds: string[];
  units: number;
  minutes: number;
  /** Days from the earliest due date on the job. Negative is early. */
  offsetDays: number;
}

export interface PmPlanResult {
  proposed: PmProposal[];
  /** Sites that are due but had no workable day in the window. */
  unplaced: { siteId: string; siteName: string; dueOn: string; reason: string }[];
  /** Sites skipped because a proposal or a real job already covers them. */
  alreadyCovered: number;
}

interface DueSite extends PmSlotRequest {
  siteId: string;
  customerId: string;
  zoneId: string | null;
  siteName: string;
  customerName: string;
  assets: { id: string; acType: AcType; pmFrequencyPerYear: number }[];
}

/**
 * Machines coming due, grouped into one visit per site.
 *
 * A site is skipped entirely when any of its machines is already on an open
 * job — the cron runs daily, and a proposal made yesterday is still a
 * proposal today. Without this the office would find the same visit suggested
 * every morning until somebody confirmed it.
 */
export async function findSitesDueForPm(withinDays = PM_LOOKAHEAD_DAYS): Promise<DueSite[]> {
  const horizon = new Date(Date.now() + withinDays * 86_400_000);

  const assets = await prisma.asset.findMany({
    where: {
      isActive: true,
      nextPmDueAt: { not: null, lte: horizon },
      // An open job already covering this machine means the visit is in hand,
      // whether a person raised it or an earlier run of this planner did.
      jobAssets: {
        none: {
          job: {
            category: 'CLEANING_PM',
            status: { in: ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS'] },
          },
        },
      },
    },
    select: {
      id: true,
      acType: true,
      pmFrequencyPerYear: true,
      nextPmDueAt: true,
      site: {
        select: {
          id: true,
          name: true,
          zoneId: true,
          customerId: true,
          customer: { select: { displayName: true } },
        },
      },
    },
    orderBy: { nextPmDueAt: 'asc' },
  });

  const bySite = new Map<string, DueSite>();
  for (const asset of assets) {
    const existing = bySite.get(asset.site.id);
    const dueOn = dateOnly(asset.nextPmDueAt!).toISOString().slice(0, 10);

    if (existing) {
      existing.assets.push({
        id: asset.id,
        acType: asset.acType,
        pmFrequencyPerYear: asset.pmFrequencyPerYear,
      });
      existing.units += 1;
      existing.minutes += FALLBACK_MINUTES_PER_UNIT;
      // The visit is due when its EARLIEST machine is due, not its latest.
      if (dueOn < existing.dueOn) existing.dueOn = dueOn;
      continue;
    }

    bySite.set(asset.site.id, {
      siteId: asset.site.id,
      customerId: asset.site.customerId,
      zoneId: asset.site.zoneId,
      siteName: asset.site.name,
      customerName: asset.site.customer.displayName,
      dueOn,
      units: 1,
      minutes: FALLBACK_MINUTES_PER_UNIT,
      assets: [{ id: asset.id, acType: asset.acType, pmFrequencyPerYear: asset.pmFrequencyPerYear }],
    });
  }

  return [...bySite.values()];
}

/**
 * PM proposals this planner has already placed on each day.
 *
 * Counted per zone, because a day being busy in Nonthaburi says nothing about
 * the same day in Bangkok.
 */
async function existingProposalsByDate(zoneId: string | null, from: Date, to: Date) {
  const jobs = await prisma.job.findMany({
    where: {
      category: 'CLEANING_PM',
      createdVia: 'SYSTEM',
      status: { in: ['DRAFT', 'SUBMITTED', 'SCHEDULED'] },
      scheduledDate: { gte: dateOnly(from), lte: dateOnly(to) },
      ...(zoneId ? { zoneId } : {}),
    },
    select: { scheduledDate: true },
  });

  const counts = new Map<string, number>();
  for (const job of jobs) {
    if (!job.scheduledDate) continue;
    const key = dateOnly(job.scheduledDate).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Find what is due and raise a proposal for each site.
 *
 * `dryRun` returns the plan without writing it, which is how the office can be
 * shown what tomorrow's run would do before it does it.
 */
export async function proposePmJobs(params: {
  withinDays?: number;
  /** Stops one bad run from filling the board. */
  limit?: number;
  dryRun?: boolean;
  actorId?: string | null;
} = {}): Promise<PmPlanResult> {
  const { withinDays = PM_LOOKAHEAD_DAYS, limit = 50, dryRun = false } = params;

  const due = await findSitesDueForPm(withinDays);
  const result: PmPlanResult = { proposed: [], unplaced: [], alreadyCovered: 0 };
  if (due.length === 0) return result;

  // Availability is per zone, so the batch is planned one zone at a time.
  const byZone = new Map<string | null, DueSite[]>();
  for (const site of due.slice(0, limit)) {
    const list = byZone.get(site.zoneId) ?? [];
    list.push(site);
    byZone.set(site.zoneId, list);
  }

  for (const [zoneId, sites] of byZone) {
    if (!zoneId) {
      // Quota is kept per zone; a site with no zone cannot be planned against
      // it. Surfaced rather than guessed at — putting it in an arbitrary zone
      // would book technicians into an area they do not cover.
      for (const site of sites) {
        result.unplaced.push({
          siteId: site.siteId,
          siteName: site.siteName,
          dueOn: site.dueOn,
          reason: 'หน้างานนี้ยังไม่ได้กำหนดเขต',
        });
      }
      continue;
    }

    const from = new Date(Date.now() - PM_WINDOW_BEFORE_DAYS * 86_400_000);
    const to = new Date(Date.now() + (withinDays + PM_WINDOW_AFTER_DAYS) * 86_400_000);

    const availability = await getAvailability({
      from,
      to,
      zoneId,
      category: 'CLEANING_PM',
      // Asked for the smallest possible job so the day is reported open; each
      // job's own size is then checked against the remaining axes by the
      // planner, which is what lets one call serve a batch of mixed sizes.
      requiredUnits: 1,
      requiredMinutes: 0,
    });

    const placed = await existingProposalsByDate(zoneId, from, to);
    const plan = planPmBatch(sites, availability, placed, MAX_PM_PROPOSALS_PER_DAY);

    for (const { request, choice } of plan) {
      if (!choice) {
        result.unplaced.push({
          siteId: request.siteId,
          siteName: request.siteName,
          dueOn: request.dueOn,
          reason: 'ไม่มีวันว่างในช่วงที่ยอมรับได้',
        });
        continue;
      }

      if (dryRun) {
        result.proposed.push({
          jobId: '(dry-run)',
          jobNo: '(dry-run)',
          siteId: request.siteId,
          customerName: request.customerName,
          siteName: request.siteName,
          scheduledDate: choice.date,
          assetIds: request.assets.map((a) => a.id),
          units: request.units,
          minutes: request.minutes,
          offsetDays: choice.offsetDays,
        });
        continue;
      }

      const created = await createPmProposal(request, choice.date, params.actorId ?? null);
      result.proposed.push({ ...created, offsetDays: choice.offsetDays });
    }
  }

  return result;
}

/** Write one proposal: a DRAFT job with its machines attached. */
async function createPmProposal(
  site: DueSite,
  scheduledDate: string,
  actorId: string | null,
): Promise<Omit<PmProposal, 'offsetDays'>> {
  return prisma.$transaction(
    async (tx) => {
      const jobNo = await nextDocumentNo('JOB', tx);

      const job = await tx.job.create({
        data: {
          jobNo,
          customerId: site.customerId,
          siteId: site.siteId,
          zoneId: site.zoneId,
          category: 'CLEANING_PM',
          // DRAFT, and no quotaDayId: a proposal holds nothing. The slot is
          // taken when a person confirms it, not before.
          status: 'DRAFT',
          createdVia: 'SYSTEM',
          scheduledDate: dateOnly(scheduledDate),
          unitCount: site.units,
          estimatedMinutes: site.minutes,
          problemDescription: `ถึงรอบล้าง/PM ตามกำหนด (${site.assets.length} เครื่อง)`,
          internalNotes: `ระบบเสนอนัดอัตโนมัติ · ครบกำหนด ${site.dueOn}`,
          createdById: actorId,
        },
        select: { id: true, jobNo: true },
      });

      await tx.jobAsset.createMany({
        data: site.assets.map((asset) => ({
          jobId: job.id,
          assetId: asset.id,
          // Snapshotted so the job still reads correctly if the machine is
          // later edited — the same reason the column exists.
          acTypeSnapshot: asset.acType,
          quantity: 1,
          durationMin: FALLBACK_MINUTES_PER_UNIT,
        })),
      });

      return {
        jobId: job.id,
        jobNo: job.jobNo,
        siteId: site.siteId,
        customerName: site.customerName,
        siteName: site.siteName,
        scheduledDate,
        assetIds: site.assets.map((a) => a.id),
        units: site.units,
        minutes: site.minutes,
      };
    },
    // Same budget as the other write paths: the database is in another region
    // and the default 5s is a latency tripwire rather than a real limit.
    { timeout: 15_000 },
  );
}

/**
 * Move the PM cycle forward once a visit has actually happened.
 *
 * Called when a PM job completes. Counting from the visit rather than from
 * the due date is deliberate — see nextPmDueAfter.
 *
 * Safe to call for any job: a repair or an inspection moves no PM cycle, and
 * saying so here means callers do not each have to remember the rule.
 */
export async function recordPmVisit(jobId: string, completedAt = new Date()): Promise<number> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      category: true,
      assets: { select: { assetId: true } },
    },
  });
  if (!job || job.category !== 'CLEANING_PM') return 0;

  const assetIds = job.assets.map((a) => a.assetId).filter((id): id is string => Boolean(id));
  if (assetIds.length === 0) return 0;

  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, pmFrequencyPerYear: true },
  });

  // Each machine may sit on a different cycle even within one visit — a
  // server room runs four a year while the lobby runs two.
  const writes: Prisma.PrismaPromise<unknown>[] = assets.map((asset) =>
    prisma.asset.update({
      where: { id: asset.id },
      data: {
        lastPmAt: completedAt,
        nextPmDueAt: nextPmDueAfter(completedAt, asset.pmFrequencyPerYear),
      },
    }),
  );
  await prisma.$transaction(writes);

  return assets.length;
}
