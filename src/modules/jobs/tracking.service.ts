import { prisma } from '@/lib/db';
import type { JobStatus } from '@/generated/prisma';
import { dateOnly } from '@/modules/scheduling/quota.service';

/**
 * Public job tracking (Phase 1).
 *
 * This is the one read path with no login behind it, so it is deliberately
 * narrow: it answers "what is happening with MY job" and nothing else.
 *
 * Lookup requires job number AND phone. A job number alone is guessable —
 * they are sequential — and the office's own phone number would be enough to
 * walk the whole book. Requiring both means a caller must already know the
 * customer to see the customer's job. Nothing here returns another customer's
 * data, internal notes, technician identities, or cost breakdowns beyond what
 * appears on the customer's own invoice.
 */

export interface TrackedEvent {
  status: JobStatus;
  at: string;
  note: string | null;
}

export interface TrackedJob {
  jobNo: string;
  status: JobStatus;
  category: string;
  unitCount: number;
  createdAt: string;
  scheduledDate: string | null;
  address: string;
  problemDescription: string | null;
  crewName: string | null;
  charges: { description: string; amount: number }[];
  balance: number;
  timeline: TrackedEvent[];
}

/** Digits only, so "081-234-5678" and "0812345678" find the same job. */
function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export async function trackJob(params: {
  jobNo: string;
  phone: string;
}): Promise<TrackedJob | null> {
  const jobNo = params.jobNo.trim().toUpperCase();
  const phone = normalisePhone(params.phone);
  if (!jobNo || phone.length < 9) return null;

  const job = await prisma.job.findFirst({
    where: {
      jobNo,
      // The phone may sit on the customer record or on the site contact, and a
      // customer who booked by phone should still be able to track by the
      // number they gave.
      OR: [{ customer: { phone } }, { customer: { contacts: { some: { phone } } } }],
    },
    include: {
      site: { select: { address: true } },
      // Only the current assignment: an unassigned row is a crew that used to
      // be on this job, which is internal churn the customer should not see.
      assignments: {
        where: { unassignedAt: null },
        orderBy: { assignedAt: 'desc' },
        take: 1,
        select: { crew: { select: { name: true } } },
      },
      charges: {
        orderBy: { createdAt: 'asc' },
        select: { description: true, amountSigned: true },
      },
      statusEvents: {
        orderBy: { occurredAt: 'asc' },
        select: { toStatus: true, occurredAt: true, note: true },
      },
    },
  });

  if (!job) return null;

  const charges = job.charges.map((c) => ({
    description: c.description,
    amount: Number(c.amountSigned),
  }));

  return {
    jobNo: job.jobNo,
    status: job.status,
    category: job.category,
    unitCount: job.unitCount,
    createdAt: job.createdAt.toISOString(),
    scheduledDate: job.scheduledDate ? dateOnly(job.scheduledDate).toISOString().slice(0, 10) : null,
    address: job.site?.address ?? '-',
    problemDescription: job.problemDescription,
    crewName: job.assignments[0]?.crew.name ?? null,
    charges,
    // Always the sum of the ledger, never a stored total — the same rule the
    // billing module follows, so the customer and the office cannot disagree.
    balance: charges.reduce((sum, c) => sum + c.amount, 0),
    timeline: job.statusEvents.map((e) => ({
      status: e.toStatus,
      at: e.occurredAt.toISOString(),
      note: e.note,
    })),
  };
}
