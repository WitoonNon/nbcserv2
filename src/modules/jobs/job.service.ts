import { prisma } from '@/lib/db';
import type { CreatedVia, JobSize, ServiceCategory } from '@/generated/prisma';
import { nextDocumentNo } from '@/modules/workorders/sequence.service';
import { applyInspectionFee } from '@/modules/billing/fee.service';

/**
 * Phone-in intake (Phase 1).
 *
 * Call centre takes the request and the job lands as SUBMITTED with the
 * customer's requested date; the dispatcher schedules it later against quota.
 * Splitting intake from scheduling mirrors how the office actually works and
 * keeps quota consumption out of the intake transaction.
 */
export interface IntakeInput {
  customerName: string;
  phone: string;
  address?: string;
  category: ServiceCategory;
  jobSize: JobSize;
  unitCount: number;
  requestedDate?: Date | null;
  problemDescription?: string;
  createdVia: CreatedVia;
  createdById?: string | null;
}

export async function createJobFromIntake(input: IntakeInput): Promise<{ jobId: string; jobNo: string }> {
  return prisma.$transaction(async (tx) => {
    // Re-use the customer when the phone number is already known.
    let customer = await tx.customer.findFirst({
      where: { phone: input.phone },
      include: { sites: { take: 1, orderBy: { createdAt: 'asc' } } },
    });

    if (!customer) {
      const code = await nextDocumentNo('CUSTOMER', tx);
      customer = await tx.customer.create({
        data: {
          code,
          type: 'INDIVIDUAL',
          legalName: input.customerName,
          displayName: input.customerName,
          segment: 'RESIDENTIAL',
          phone: input.phone,
        },
        include: { sites: true },
      });
    }

    const zone = await tx.zone.findFirst({ where: { isActive: true } });

    let site = customer.sites[0];
    if (!site) {
      site = await tx.customerSite.create({
        data: {
          customerId: customer.id,
          code: 'SITE-001',
          name: 'หน้างานหลัก',
          address: input.address ?? '-',
          zoneId: zone?.id ?? null,
        },
      });
    }

    const hasContract = await tx.contract.findFirst({
      where: { customerId: customer.id, status: 'ACTIVE' },
    });

    const jobNo = await nextDocumentNo('JOB', tx);
    const job = await tx.job.create({
      data: {
        jobNo,
        customerId: customer.id,
        siteId: site.id,
        contractId: hasContract?.id ?? null,
        zoneId: zone?.id ?? null,
        category: input.category,
        jobSize: input.jobSize,
        unitCount: input.unitCount,
        status: 'SUBMITTED',
        requestedDate: input.requestedDate ?? null,
        problemDescription: input.problemDescription ?? null,
        createdVia: input.createdVia,
        createdById: input.createdById ?? null,
        slaDueAt: new Date(Date.now() + (hasContract?.slaResponseHours ?? 24) * 3600_000),
      },
    });

    await tx.jobStatusEvent.createMany({
      data: [
        { jobId: job.id, fromStatus: null, toStatus: 'DRAFT', actorRole: 'ADMIN' },
        { jobId: job.id, fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorRole: 'ADMIN' },
      ],
    });

    // Inspection fee applies to inspection visits; the contract waiver rule
    // lives in the policy, not here.
    if (input.category === 'INSPECTION_REPAIR') {
      await applyInspectionFee(
        {
          jobId: job.id,
          category: input.category,
          zoneId: zone?.id ?? null,
          isContractCustomer: Boolean(hasContract),
        },
        tx,
      );
    }

    return { jobId: job.id, jobNo };
  });
}
