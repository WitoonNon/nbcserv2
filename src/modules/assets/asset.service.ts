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
}

export async function listAssets(filter: AssetFilter = {}): Promise<AssetRow[]> {
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

  const assets = await prisma.asset.findMany({
    where,
    orderBy: [{ nextPmDueAt: { sort: 'asc', nulls: 'last' } }, { assetTag: 'asc' }],
    take: 300,
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

  if (assets.length === 0) return [];

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

  return assets.map((a) => ({
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
  }));
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
  history: AssetHistoryRow[];
  /** Every repair on record, not only recent ones. */
  totalRepairs: number;
  totalCleans: number;
}

export async function getAsset(id: string): Promise<AssetDetail | null> {
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
      jobAssets: {
        orderBy: { job: { createdAt: 'desc' } },
        take: 100,
        select: {
          note: true,
          job: {
            select: {
              id: true,
              jobNo: true,
              category: true,
              status: true,
              scheduledDate: true,
            },
          },
        },
      },
    },
  });
  if (!a) return null;

  const history = a.jobAssets
    // A job removed after the fact leaves the link behind; skip rather than
    // render a row with no job number.
    .filter((ja) => ja.job !== null)
    .map((ja) => ({
      jobId: ja.job.id,
      jobNo: ja.job.jobNo,
      category: ja.job.category,
      status: ja.job.status,
      scheduledDate: ja.job.scheduledDate?.toISOString() ?? null,
      note: ja.note,
    }));

  const counted = history.filter((h) => h.status !== 'CANCELLED');
  const cutoff = since(RECENT_MONTHS).toISOString();

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
    totalRepairs: counted.filter((h) => h.category === 'REPAIR').length,
    totalCleans: counted.filter((h) => h.category === 'CLEANING_PM').length,
    recentRepairs: counted.filter(
      (h) => h.category === 'REPAIR' && (h.scheduledDate ?? '') >= cutoff,
    ).length,
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
