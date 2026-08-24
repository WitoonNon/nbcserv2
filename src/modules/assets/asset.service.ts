import 'server-only';
import { prisma } from '@/lib/db';
import type { AcType, Prisma } from '@/generated/prisma';

/**
 * The air-conditioner register.
 *
 * The register exists to answer one question the job list cannot: *this
 * machine has been repaired how many times — is it worth repairing again?*
 *
 * Jobs are filed against a customer, so a unit that has failed five times in a
 * year looks the same as five different units failing once. Nobody can see the
 * pattern, and the company keeps quoting repairs on a machine that should have
 * been replaced. Attaching history to the machine is what makes that visible.
 *
 * Twelve months rather than all time, because a compressor replaced in 2019
 * says nothing about the unit's condition now.
 */

const RECENT_MONTHS = 12;

/**
 * Coerce a page number into something a query can actually be run with.
 *
 * Not merely defensive. `Math.max(NaN, 1)` is NaN, which reaches Prisma as
 * `skip: NaN` and throws — so a page number that came from a URL, an API
 * caller or a typo would take the whole screen down rather than showing page
 * one. The callers clamp too; this is the boundary that must hold regardless.
 */
function clampPage(raw: number | undefined, pages: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(Math.max(Math.floor(raw as number), 1), Math.max(1, pages));
}

function since(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export interface AssetRow {
  id: string;
  assetTag: string;
  acType: AcType;
  brand: string | null;
  model: string | null;
  btu: number | null;
  locationInBuilding: string | null;
  siteName: string;
  customerName: string;
  customerId: string;
  nextPmDueAt: string | null;
  /** Repairs in the last twelve months — the replacement signal. */
  recentRepairs: number;
  isActive: boolean;
}

export interface AssetFilter {
  customerId?: string;
  siteId?: string;
  acType?: AcType;
  /** Matches the tag, serial, brand, model or where it is installed. */
  q?: string;
  /** Only units whose next PM date has passed. */
  pmDue?: boolean;
  includeInactive?: boolean;
  /** 1-based. Out-of-range values are clamped, never rejected. */
  page?: number;
  perPage?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
}

export const ASSETS_PER_PAGE = 25;

/**
 * One page of the register.
 *
 * Paged rather than capped. The previous `take: 300` looked like a limit but
 * behaved like a lie — a company with more units than that simply never saw
 * the rest, and there was no page two to go and find them. It also meant every
 * visit dragged 300 rows and a 300-key grouped count across the wire to render
 * a screen showing twenty-five.
 */
export async function listAssets(filter: AssetFilter = {}): Promise<Page<AssetRow>> {
  const perPage = Number.isFinite(filter.perPage)
    ? Math.min(Math.max(Math.floor(filter.perPage as number), 1), 100)
    : ASSETS_PER_PAGE;
  const where: Prisma.AssetWhereInput = {};
  if (!filter.includeInactive) where.isActive = true;
  if (filter.siteId) where.siteId = filter.siteId;
  if (filter.customerId) where.site = { customerId: filter.customerId };
  if (filter.acType) where.acType = filter.acType;
  if (filter.pmDue) where.nextPmDueAt = { lte: new Date() };

  const q = filter.q?.trim();
  if (q) {
    where.OR = [
      { assetTag: { contains: q, mode: 'insensitive' } },
      { serialNo: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      { locationInBuilding: { contains: q, mode: 'insensitive' } },
    ];
  }

  const total = await prisma.asset.count({ where });

  // Clamp rather than 404. Deleting a unit can shrink the register between the
  // moment a link is copied and the moment it is opened, and an empty screen
  // reading "page 9 of 6" helps nobody.
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = clampPage(filter.page, pages);

  const assets = await prisma.asset.findMany({
    where,
    // assetTag breaks ties so the sort is total: two units due the same day in
    // an unstable order would swap between pages and hide one of them.
    orderBy: [{ nextPmDueAt: { sort: 'asc', nulls: 'last' } }, { assetTag: 'asc' }],
    skip: (page - 1) * perPage,
    take: perPage,
    select: {
      id: true,
      assetTag: true,
      acType: true,
      brand: true,
      model: true,
      btu: true,
      locationInBuilding: true,
      nextPmDueAt: true,
      isActive: true,
      site: {
        select: { name: true, customerId: true, customer: { select: { displayName: true } } },
      },
    },
  });

  if (assets.length === 0) return { rows: [], total, page, perPage };

  // One grouped count for the whole page rather than a query per row. A site
  // with forty units would otherwise issue forty round trips to a database in
  // another region, which is the difference between a page and a wait.
  const repairs = await prisma.jobAsset.groupBy({
    by: ['assetId'],
    where: {
      assetId: { in: assets.map((a) => a.id) },
      job: {
        category: 'REPAIR',
        createdAt: { gte: since(RECENT_MONTHS) },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
    },
    _count: { assetId: true },
  });
  const repairCount = new Map(repairs.map((r) => [r.assetId, r._count.assetId]));

  return {
    rows: assets.map((a) => ({
      id: a.id,
      assetTag: a.assetTag,
      acType: a.acType,
      brand: a.brand,
      model: a.model,
      btu: a.btu,
      locationInBuilding: a.locationInBuilding,
      siteName: a.site.name,
      customerName: a.site.customer.displayName,
      customerId: a.site.customerId,
      nextPmDueAt: a.nextPmDueAt?.toISOString() ?? null,
      recentRepairs: repairCount.get(a.id) ?? 0,
      isActive: a.isActive,
    })),
    total,
    page,
    perPage,
  };
}

/**
 * How many units in this page of the register are repeat repairs.
 *
 * Counted across the whole filtered register rather than the visible page: a
 * banner that said "2 units need attention" and changed to "0" when the reader
 * turned to page two would be describing the page, not the fleet.
 */
export async function countRepeatRepairs(filter: AssetFilter = {}): Promise<number> {
  // Scoped through the relation rather than by fetching every asset id first:
  // one query that the database answers, instead of a list of ids dragged out
  // only to be sent straight back in.
  const grouped = await prisma.jobAsset.groupBy({
    by: ['assetId'],
    where: {
      asset: {
        ...(filter.includeInactive ? {} : { isActive: true }),
        ...(filter.siteId ? { siteId: filter.siteId } : {}),
        ...(filter.customerId ? { site: { customerId: filter.customerId } } : {}),
      },
      job: {
        category: 'REPAIR',
        createdAt: { gte: since(RECENT_MONTHS) },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
    },
    _count: { assetId: true },
  });

  return grouped.filter((g) => repairConcern(g._count.assetId) !== 'none').length;
}

export interface AssetHistoryRow {
  jobId: string;
  jobNo: string;
  category: string;
  status: string;
  scheduledDate: string | null;
  note: string | null;
}

export interface AssetDetail extends AssetRow {
  serialNo: string | null;
  refrigerant: string | null;
  installedAt: string | null;
  pmFrequencyPerYear: number;
  lastPmAt: string | null;
  siteId: string;
  siteAddress: string;
  /** One page of history — see HISTORY_PER_PAGE. */
  history: AssetHistoryRow[];
  historyTotal: number;
  historyPage: number;
  historyPerPage: number;
  /** Every repair on record, not only recent ones. */
  totalRepairs: number;
  totalCleans: number;
}

export const HISTORY_PER_PAGE = 15;

/**
 * One machine, with a page of its history.
 *
 * A unit under a quarterly PM contract accumulates four jobs a year before a
 * single repair is counted, so the oldest register entries will outlive any
 * fixed cap. The counts above the table are computed by the database over the
 * whole record; only the table itself is paged, so turning to page two never
 * changes the totals the page is really about.
 */
export async function getAsset(
  id: string,
  opts: { historyPage?: number } = {},
): Promise<AssetDetail | null> {
  const a = await prisma.asset.findUnique({
    where: { id },
    select: {
      id: true,
      assetTag: true,
      acType: true,
      brand: true,
      model: true,
      btu: true,
      serialNo: true,
      refrigerant: true,
      installedAt: true,
      locationInBuilding: true,
      pmFrequencyPerYear: true,
      lastPmAt: true,
      nextPmDueAt: true,
      isActive: true,
      siteId: true,
      site: {
        select: {
          name: true,
          address: true,
          customerId: true,
          customer: { select: { displayName: true } },
        },
      },
    },
  });
  if (!a) return null;

  const historyPerPage = HISTORY_PER_PAGE;
  const historyTotal = await prisma.jobAsset.count({ where: { assetId: id } });
  const historyPages = Math.max(1, Math.ceil(historyTotal / historyPerPage));
  const historyPage = clampPage(opts.historyPage, historyPages);

  const links = await prisma.jobAsset.findMany({
    where: { assetId: id },
    // createdAt breaks ties on scheduledDate, which is null for anything not
    // yet booked in — without it those rows shuffle between pages.
    orderBy: [{ job: { scheduledDate: 'desc' } }, { job: { createdAt: 'desc' } }],
    skip: (historyPage - 1) * historyPerPage,
    take: historyPerPage,
    select: {
      note: true,
      job: {
        select: { id: true, jobNo: true, category: true, status: true, scheduledDate: true },
      },
    },
  });

  // Every link has a job — jobId is required and the row cascades with it, so
  // there is no orphan case to defend against here.
  const history = links.map((ja) => ({
    jobId: ja.job.id,
    jobNo: ja.job.jobNo,
    category: ja.job.category,
    status: ja.job.status,
    scheduledDate: ja.job.scheduledDate?.toISOString() ?? null,
    note: ja.note,
  }));

  // Counted by the database over every job on record, not over the page above.
  const [totalRepairs, totalCleans, recentRepairs] = await Promise.all([
    prisma.jobAsset.count({
      where: { assetId: id, job: { category: 'REPAIR', status: { not: 'CANCELLED' } } },
    }),
    prisma.jobAsset.count({
      where: { assetId: id, job: { category: 'CLEANING_PM', status: { not: 'CANCELLED' } } },
    }),
    prisma.jobAsset.count({
      where: {
        assetId: id,
        job: {
          category: 'REPAIR',
          status: { not: 'CANCELLED' },
          scheduledDate: { gte: since(RECENT_MONTHS) },
        },
      },
    }),
  ]);

  return {
    id: a.id,
    assetTag: a.assetTag,
    acType: a.acType,
    brand: a.brand,
    model: a.model,
    btu: a.btu,
    serialNo: a.serialNo,
    refrigerant: a.refrigerant,
    installedAt: a.installedAt?.toISOString() ?? null,
    locationInBuilding: a.locationInBuilding,
    pmFrequencyPerYear: a.pmFrequencyPerYear,
    lastPmAt: a.lastPmAt?.toISOString() ?? null,
    nextPmDueAt: a.nextPmDueAt?.toISOString() ?? null,
    isActive: a.isActive,
    siteId: a.siteId,
    siteName: a.site.name,
    siteAddress: a.site.address,
    customerId: a.site.customerId,
    customerName: a.site.customer.displayName,
    history,
    historyTotal,
    historyPage,
    historyPerPage,
    totalRepairs,
    totalCleans,
    recentRepairs,
  };
}

/**
 * How worried to be about a unit.
 *
 * Advisory, never a decision. Whether a machine is replaced depends on the
 * customer's budget and what the last technician actually saw, neither of
 * which is in this database — so the register says what it counted and leaves
 * the judgement to the person reading it.
 */
export function repairConcern(recentRepairs: number): 'none' | 'watch' | 'high' {
  if (recentRepairs >= 3) return 'high';
  if (recentRepairs === 2) return 'watch';
  return 'none';
}

// ---------------------------------------------------------------------------
// Linking a job to the machines it is about
// ---------------------------------------------------------------------------

export class AssetLinkError extends Error {}

export interface SelectableAsset {
  id: string;
  assetTag: string;
  acType: AcType;
  brand: string | null;
  locationInBuilding: string | null;
  selected: boolean;
}

/**
 * The machines a job could plausibly be about, and which are already on it.
 *
 * Scoped to the job's own site. A register that let a dispatcher tick a
 * machine belonging to another customer would put one customer's equipment
 * into another's service history — and the register's whole value is that its
 * history can be trusted.
 */
export async function selectableAssetsForJob(jobId: string): Promise<SelectableAsset[]> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { siteId: true, assets: { select: { assetId: true } } },
  });
  if (!job) return [];

  const chosen = new Set(job.assets.map((a) => a.assetId).filter(Boolean));
  const assets = await prisma.asset.findMany({
    where: { siteId: job.siteId, isActive: true },
    orderBy: { assetTag: 'asc' },
    select: { id: true, assetTag: true, acType: true, brand: true, locationInBuilding: true },
  });

  return assets.map((a) => ({ ...a, selected: chosen.has(a.id) }));
}

/**
 * Set which machines a job covers.
 *
 * Adds and removes the difference rather than replacing the whole set, so a
 * note a technician left on a link survives someone ticking an extra box.
 */
export async function setJobAssets(params: {
  jobId: string;
  assetIds: string[];
}): Promise<{ added: number; removed: number }> {
  const job = await prisma.job.findUnique({
    where: { id: params.jobId },
    select: { siteId: true, assets: { select: { id: true, assetId: true } } },
  });
  if (!job) throw new AssetLinkError('ไม่พบงานที่ระบุ');

  const wanted = new Set(params.assetIds);

  // Everything ticked must belong to this job's site. Checked against the
  // database rather than trusted from the form: the ids arrive from a browser.
  if (wanted.size > 0) {
    const valid = await prisma.asset.findMany({
      where: { id: { in: [...wanted] }, siteId: job.siteId },
      select: { id: true },
    });
    if (valid.length !== wanted.size) {
      throw new AssetLinkError('มีเครื่องที่ไม่ได้อยู่ในหน้างานของงานนี้');
    }
  }

  const current = new Map(job.assets.filter((a) => a.assetId).map((a) => [a.assetId!, a.id]));
  const toAdd = [...wanted].filter((id) => !current.has(id));
  const toRemove = [...current.entries()].filter(([assetId]) => !wanted.has(assetId));

  if (toRemove.length > 0) {
    await prisma.jobAsset.deleteMany({ where: { id: { in: toRemove.map(([, rowId]) => rowId) } } });
  }

  if (toAdd.length > 0) {
    const details = await prisma.asset.findMany({
      where: { id: { in: toAdd } },
      select: { id: true, acType: true, assetTag: true },
    });
    await prisma.jobAsset.createMany({
      data: details.map((d) => ({
        jobId: params.jobId,
        assetId: d.id,
        // Snapshot, so the job still reads correctly if the machine is later
        // renamed or reclassified.
        acTypeSnapshot: d.acType,
        descriptionSnapshot: d.assetTag,
        quantity: 1,
      })),
    });
  }

  return { added: toAdd.length, removed: toRemove.length };
}
