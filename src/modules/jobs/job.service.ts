import { TX_OPTIONS, prisma } from '@/lib/db';
import type { AcType, CreatedVia, JobSize, ServiceCategory } from '@/generated/prisma';
import { nextDocumentNo } from '@/modules/workorders/sequence.service';
import { applyInspectionFee } from '@/modules/billing/fee.service';
import { bookSlotWithin, dateOnly } from '@/modules/scheduling/quota.service';

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
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Self-service booking (Phase 1)
// ---------------------------------------------------------------------------

export interface BookingInput {
  customerName: string;
  phone: string;
  email?: string | null;
  address: string;
  category: ServiceCategory;
  acType?: AcType | null;
  unitCount: number;
  /** The date the customer picked, already validated against availability. */
  scheduledDate: Date;
  zoneId: string;
  /** Estimated crew minutes, resolved from the catalogue before we get here. */
  minutes: number;
  problemDescription?: string;
  /** Consumes this session's hold instead of counting it against capacity. */
  sessionKey?: string;
}

/**
 * Customer-facing booking. Unlike createJobFromIntake(), this CONSUMES QUOTA.
 *
 * Phone intake deliberately does not touch quota — a dispatcher schedules those
 * against capacity later. A web booking has no such second pair of eyes, so the
 * slot must be consumed in the same transaction that creates the job. If the
 * job insert fails after capacity was taken, the whole thing rolls back and the
 * slot returns to the pool; if quota is exhausted, bookSlotWithin() throws and
 * no job is created. Selling the same slot twice is the failure that damages
 * this system most, so the two writes are never allowed to drift apart.
 *
 * The job lands SCHEDULED rather than SUBMITTED: the customer has been given a
 * specific date and the system has committed capacity to it.
 */
export async function createJobFromBooking(
  input: BookingInput,
): Promise<{ jobId: string; jobNo: string; quotaDayId: string }> {
  const scheduledDate = dateOnly(input.scheduledDate);

  return prisma.$transaction(
    async (tx) => {
      // Consume capacity FIRST. Everything below is cheap; the lock is not, and
      // holding it for the shortest possible span keeps concurrent bookers from
      // queueing behind customer-record housekeeping.
      const booking = await bookSlotWithin(
        tx,
        {
          date: scheduledDate,
          zoneId: input.zoneId,
          category: input.category,
          units: input.unitCount,
          minutes: input.minutes,
        },
        input.sessionKey,
      );

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
            email: input.email ?? null,
          },
          include: { sites: true },
        });
      }

      let site = customer.sites[0];
      if (!site) {
        site = await tx.customerSite.create({
          data: {
            customerId: customer.id,
            code: 'SITE-001',
            name: 'หน้างานหลัก',
            address: input.address,
            zoneId: input.zoneId,
          },
        });
      }

      const contract = await tx.contract.findFirst({
        where: { customerId: customer.id, status: 'ACTIVE' },
      });

      const jobNo = await nextDocumentNo('JOB', tx);
      const job = await tx.job.create({
        data: {
          jobNo,
          customerId: customer.id,
          siteId: site.id,
          contractId: contract?.id ?? null,
          zoneId: input.zoneId,
          quotaDayId: booking.quotaDayId,
          category: input.category,
          jobSize: sizeForUnits(input.unitCount),
          unitCount: input.unitCount,
          status: 'SCHEDULED',
          requestedDate: scheduledDate,
          scheduledDate,
          estimatedMinutes: input.minutes,
          problemDescription: input.problemDescription ?? null,
          createdVia: 'WEB',
          slaDueAt: new Date(Date.now() + (contract?.slaResponseHours ?? 24) * 3600_000),
        },
      });

      await tx.jobStatusEvent.createMany({
        data: [
          { jobId: job.id, fromStatus: null, toStatus: 'DRAFT', actorRole: 'CUSTOMER' },
          { jobId: job.id, fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorRole: 'CUSTOMER' },
          { jobId: job.id, fromStatus: 'SUBMITTED', toStatus: 'SCHEDULED', actorRole: 'CUSTOMER' },
        ],
      });

      if (input.category === 'INSPECTION_REPAIR') {
        await applyInspectionFee(
          {
            jobId: job.id,
            category: input.category,
            zoneId: input.zoneId,
            isContractCustomer: Boolean(contract),
          },
          tx,
        );
      }

      return { jobId: job.id, jobNo, quotaDayId: booking.quotaDayId };
    },
    // maxWait matches bookSlot(): queueing for a connection is expected when
    // several customers book the same day at once, and timing out in the queue
    // would report a system fault instead of a full day.
    { isolationLevel: 'ReadCommitted', maxWait: 15_000, timeout: 15_000 },
  );
}

/**
 * Size band from unit count. @client-confirm C4 — the client has not defined
 * their own bands yet, so this mirrors the catalogue's own grouping and is only
 * used for reporting, never for capacity (capacity is units and minutes).
 */
function sizeForUnits(units: number): JobSize {
  if (units <= 2) return 'S';
  if (units <= 6) return 'M';
  if (units <= 20) return 'L';
  return 'XL';
}
