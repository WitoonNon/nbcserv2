import { prisma } from '@/lib/db';
import type { Prisma, ServiceCategory } from '@/generated/prisma';

/**
 * Inspection fee & credit (requirement #2).
 *
 * Implemented as an APPEND-ONLY LEDGER. Nothing here ever mutates a previous
 * row: charging, waiving and crediting all write new rows, so the history of
 * what the customer was told remains reconstructable.
 *
 *   non-contract customer  ->  +INSPECTION_FEE        (+500)
 *   contract customer      ->  no row; Job.feeWaivedReason = CONTRACT
 *   declines the repair    ->  fee stands, invoiced
 *   approves the repair    ->  +INSPECTION_FEE_CREDIT (-500)
 *
 * @client-confirm B1–B6
 */

export interface FeeContext {
  jobId: string;
  category: ServiceCategory;
  zoneId?: string | null;
  isContractCustomer: boolean;
  asOf?: Date;
}

/** Pick the most specific active policy: zone+category > category > global. */
export async function resolveFeePolicy(ctx: FeeContext) {
  const asOf = ctx.asOf ?? new Date();
  const policies = await prisma.inspectionFeePolicy.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      AND: [
        { OR: [{ category: ctx.category }, { category: null }] },
        { OR: [{ zoneId: ctx.zoneId ?? undefined }, { zoneId: null }] },
      ],
    },
  });

  return (
    policies.find((p) => p.category !== null && p.zoneId !== null) ??
    policies.find((p) => p.category !== null) ??
    policies.find((p) => p.zoneId !== null) ??
    policies[0] ??
    null
  );
}

/**
 * Called when a job is created. Either writes the fee charge, or records that
 * it was waived — matching NBC's public "free diagnostic for contract
 * customers" promise.
 */
export async function applyInspectionFee(
  ctx: FeeContext,
  tx?: Prisma.TransactionClient,
): Promise<{ charged: boolean; amount: number; policyId: string | null }> {
  const db = tx ?? prisma;
  const policy = await resolveFeePolicy(ctx);
  if (!policy) return { charged: false, amount: 0, policyId: null };

  if (ctx.isContractCustomer && policy.waiveForContractCustomer) {
    await db.job.update({
      where: { id: ctx.jobId },
      data: { feeWaivedReason: 'CONTRACT' },
    });
    return { charged: false, amount: 0, policyId: policy.id };
  }

  const amount = Number(policy.amount);
  await db.jobCharge.create({
    data: {
      jobId: ctx.jobId,
      type: 'INSPECTION_FEE',
      description: 'ค่าเข้าตรวจเช็คหน้างาน',
      qty: 1,
      unitPrice: policy.amount,
      amountSigned: policy.amount,
      source: 'AUTO_POLICY',
      policyId: policy.id,
    },
  });

  return { charged: true, amount, policyId: policy.id };
}

/**
 * Called when the customer approves the repair quotation. Writes the credit
 * as a negative charge — the original fee row is left untouched.
 *
 * `repairValue` is the approved work value, used for the minimum-value gate.
 */
export async function creditInspectionFee(
  jobId: string,
  repairValue: number,
  tx?: Prisma.TransactionClient,
): Promise<{ credited: boolean; amount: number; reason?: string }> {
  const db = tx ?? prisma;

  const feeCharge = await db.jobCharge.findFirst({
    where: { jobId, type: 'INSPECTION_FEE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!feeCharge) return { credited: false, amount: 0, reason: 'NO_FEE_CHARGED' };

  const existing = await db.jobCharge.findFirst({
    where: { jobId, type: 'INSPECTION_FEE_CREDIT' },
  });
  if (existing) return { credited: false, amount: 0, reason: 'ALREADY_CREDITED' };

  const policy = feeCharge.policyId
    ? await db.inspectionFeePolicy.findUnique({ where: { id: feeCharge.policyId } })
    : null;

  if (policy && !policy.creditOnProceed) {
    return { credited: false, amount: 0, reason: 'POLICY_NO_CREDIT' };
  }

  // @client-confirm B4 — stops a ฿500 credit landing on a ฿600 job.
  const minValue = policy?.minJobValueForCredit ? Number(policy.minJobValueForCredit) : 0;
  if (minValue > 0 && repairValue < minValue) {
    return { credited: false, amount: 0, reason: 'BELOW_MIN_JOB_VALUE' };
  }

  const feeAmount = Number(feeCharge.amountSigned);
  let creditAmount = feeAmount;

  if (policy) {
    if (policy.creditMode === 'PARTIAL' && policy.creditValue != null) {
      creditAmount = feeAmount * (Number(policy.creditValue) / 100);
    } else if (policy.creditMode === 'CAPPED' && policy.creditValue != null) {
      creditAmount = Math.min(feeAmount, Number(policy.creditValue));
    }
  }

  await db.jobCharge.create({
    data: {
      jobId,
      type: 'INSPECTION_FEE_CREDIT',
      description: 'หักคืนค่าเข้าตรวจเช็ค (ลูกค้าตกลงซ่อม)',
      qty: 1,
      unitPrice: creditAmount,
      amountSigned: -creditAmount,
      source: 'AUTO_POLICY',
      policyId: policy?.id ?? null,
    },
  });

  return { credited: true, amount: creditAmount };
}

/** Net payable is always derived, never stored. */
export async function jobBalance(jobId: string): Promise<{
  lines: { type: string; description: string; amount: number }[];
  net: number;
}> {
  const charges = await prisma.jobCharge.findMany({
    where: { jobId },
    orderBy: { createdAt: 'asc' },
  });
  const lines = charges.map((c) => ({
    type: c.type,
    description: c.description,
    amount: Number(c.amountSigned),
  }));
  return { lines, net: lines.reduce((s, l) => s + l.amount, 0) };
}
