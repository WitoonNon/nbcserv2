import { prisma } from '@/lib/db';
import type { CustomerSegment, CustomerType, Prisma } from '@/generated/prisma';

/**
 * Customer 360 (Phase 1).
 *
 * NBC's real accounts are factories, hospitals, hotels and malls, so the list
 * is built around Customer → Site → Asset rather than a flat address book.
 * Counts of sites and units are what the office actually scans for.
 */

export interface CustomerListRow {
  id: string;
  code: string;
  displayName: string;
  type: CustomerType;
  segment: CustomerSegment;
  phone: string | null;
  siteCount: number;
  assetCount: number;
  jobCount: number;
  hasActiveContract: boolean;
  tier: 'CONTRACT' | 'STANDARD';
}

export async function listCustomers(params: {
  q?: string;
  segment?: string;
  type?: string;
  contractOnly?: boolean;
}): Promise<CustomerListRow[]> {
  const where: Prisma.CustomerWhereInput = { isActive: true };
  if (params.q) {
    where.OR = [
      { displayName: { contains: params.q, mode: 'insensitive' } },
      { legalName: { contains: params.q, mode: 'insensitive' } },
      { code: { contains: params.q, mode: 'insensitive' } },
      { phone: { contains: params.q } },
      { taxId: { contains: params.q } },
    ];
  }
  if (params.segment) where.segment = params.segment as CustomerSegment;
  if (params.type) where.type = params.type as CustomerType;
  if (params.contractOnly) {
    where.contracts = { some: { status: 'ACTIVE' } };
  }

  const customers = await prisma.customer.findMany({
    where,
    include: {
      sites: { select: { id: true, _count: { select: { assets: true } } } },
      contracts: { where: { status: 'ACTIVE' }, select: { id: true, pricingTier: true } },
      _count: { select: { jobs: true } },
    },
    orderBy: { code: 'asc' },
    take: 100,
  });

  return customers.map((c) => ({
    id: c.id,
    code: c.code,
    displayName: c.displayName,
    type: c.type,
    segment: c.segment,
    phone: c.phone,
    siteCount: c.sites.length,
    assetCount: c.sites.reduce((s, site) => s + site._count.assets, 0),
    jobCount: c._count.jobs,
    hasActiveContract: c.contracts.length > 0,
    tier: c.contracts[0]?.pricingTier ?? c.defaultPricingTier,
  }));
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { isPrimary: 'desc' } },
      contracts: {
        include: { sites: true, includedServices: true },
        orderBy: { startsOn: 'desc' },
      },
      sites: {
        include: {
          zone: true,
          assets: { where: { isActive: true }, orderBy: { assetTag: 'asc' } },
        },
        orderBy: { code: 'asc' },
      },
      jobs: {
        include: { site: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
}
