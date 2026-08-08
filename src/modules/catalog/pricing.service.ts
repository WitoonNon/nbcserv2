import { prisma } from '@/lib/db';
import type { AcType, JobSize, PricingTier, ServiceCategory } from '@/generated/prisma';

/**
 * Pricing resolver.
 *
 * NBC publishes a price RANGE per line item (e.g. แขวน ฿900–1,100). The
 * client confirmed on 9 ส.ค. 2569 what that range means: the final figure
 * depends on the site — how awkward the unit is to reach, working height, and
 * total quantity, where a bigger job costs LESS per unit.
 *
 * That means this module deliberately CANNOT return a single price. There is
 * no rule that collapses the band, because the inputs (access, height, volume
 * discount) are judgements made at the site, not data we hold. Anything that
 * needs one number gets it from a human quotation, and the charge records it.
 *
 * An earlier reading treated the two figures as ลูกค้าในสัญญา vs ลูกค้าทั่วไป.
 * They are not: quoting the low number to every contract customer would have
 * under-billed the hard jobs and over-billed the easy ones.
 *
 * @client-confirm D1 (real internal price list), B7 (VAT inclusive or
 *                 exclusive), D6 (how volume discount is actually calculated)
 */

export interface PriceQuery {
  category: ServiceCategory;
  acType?: AcType | null;
  btu?: number | null;
  jobSize?: JobSize;
  /** Defaults to now; pass the job date to reproduce historical pricing. */
  asOf?: Date;
}

export interface ResolvedPrice {
  serviceCatalogItemId: string;
  code: string;
  nameTh: string;
  /** Published band per unit. Equal values mean a genuinely fixed price. */
  priceMin: number;
  priceMax: number;
  standardDurationMin: number;
  crewSize: number;
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

  const low = Number(match.priceMin);
  const high = Number(match.priceMax);

  return {
    serviceCatalogItemId: match.id,
    code: match.code,
    nameTh: match.nameTh,
    // Ordered defensively: a row entered with the figures the wrong way round
    // would otherwise print "1,100–900" on a public page.
    priceMin: Math.min(low, high),
    priceMax: Math.max(low, high),
    standardDurationMin: match.standardDurationMin,
    crewSize: match.crewSize,
  };
}

/**
 * The tier that applies to a customer right now: an active contract wins,
 * otherwise the customer's default.
 *
 * Still meaningful for contract entitlements — the free diagnostic visit is
 * decided by this — but it no longer selects a price column, because the
 * published range is not a tier split. See the note at the top of this file.
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
