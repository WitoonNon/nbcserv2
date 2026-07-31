import { prisma } from '@/lib/db';
import type { AcType, JobSize, PricingTier, ServiceCategory } from '@/generated/prisma';

/**
 * Pricing resolver.
 *
 * NBC publishes every line item twice — contract customer vs non-contract
 * (e.g. wall type ฿500 vs ฿650). Price is therefore never stored flat on a
 * job; it is resolved from the catalogue against the customer's tier and the
 * date, so a work order printed last year still reproduces last year's price.
 *
 * @client-confirm D1 (real internal price list), D2 (tiers still current),
 *                 B7 (VAT inclusive or exclusive)
 */

export interface PriceQuery {
  category: ServiceCategory;
  acType?: AcType | null;
  btu?: number | null;
  jobSize?: JobSize;
  tier: PricingTier;
  /** Defaults to now; pass the job date to reproduce historical pricing. */
  asOf?: Date;
}

export interface ResolvedPrice {
  serviceCatalogItemId: string;
  code: string;
  nameTh: string;
  unitPrice: number;
  standardDurationMin: number;
  crewSize: number;
  tier: PricingTier;
}

export async function resolvePrice(q: PriceQuery): Promise<ResolvedPrice | null> {
  const asOf = q.asOf ?? new Date();

  const items = await prisma.serviceCatalogItem.findMany({
    where: {
      category: q.category,
      isActive: true,
      activeFrom: { lte: asOf },
      OR: [{ activeTo: null }, { activeTo: { gte: asOf } }],
      ...(q.acType ? { acType: q.acType } : {}),
      ...(q.jobSize ? { jobSize: q.jobSize } : {}),
    },
    orderBy: { activeFrom: 'desc' },
  });

  // Narrow by BTU band when the caller knows the unit's capacity.
  const match =
    items.find((i) => {
      if (q.btu == null) return true;
      const minOk = i.btuMin == null || q.btu >= i.btuMin;
      const maxOk = i.btuMax == null || q.btu <= i.btuMax;
      return minOk && maxOk;
    }) ?? items[0];

  if (!match) return null;

  return {
    serviceCatalogItemId: match.id,
    code: match.code,
    nameTh: match.nameTh,
    unitPrice: Number(q.tier === 'CONTRACT' ? match.priceContract : match.priceStandard),
    standardDurationMin: match.standardDurationMin,
    crewSize: match.crewSize,
    tier: q.tier,
  };
}

/**
 * The tier that applies to a customer right now: an active contract wins,
 * otherwise the customer's default.
 */
export async function resolveTier(customerId: string, asOf = new Date()): Promise<PricingTier> {
  const contract = await prisma.contract.findFirst({
    where: {
      customerId,
      status: 'ACTIVE',
      startsOn: { lte: asOf },
      endsOn: { gte: asOf },
    },
    orderBy: { startsOn: 'desc' },
  });
  if (contract) return contract.pricingTier;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  return customer?.defaultPricingTier ?? 'STANDARD';
}

/**
 * Total estimated duration for a set of units — the value consumed from
 * QuotaDay.usedMinutes.
 */
export function totalMinutes(lines: { durationMin: number; quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + l.durationMin * l.quantity, 0);
}
