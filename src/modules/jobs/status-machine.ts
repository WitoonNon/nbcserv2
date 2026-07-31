import { prisma } from '@/lib/db';
import type { JobStatus, Prisma } from '@/generated/prisma';

/**
 * Job status machine (requirement #3).
 *
 * Every transition is guarded and every transition writes an append-only
 * JobStatusEvent. That event stream — not the mutable Job.status — is the
 * single source for the live tracker AND for every analytics KPI (SLA
 * attainment, response time, technician productivity).
 */

export const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ASSIGNED', 'RESCHEDULED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'SCHEDULED', 'RESCHEDULED', 'CANCELLED'],
  EN_ROUTE: ['ON_SITE', 'ASSIGNED', 'CANCELLED'],
  ON_SITE: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_QUOTE', 'COMPLETED', 'CANCELLED'],
  PENDING_QUOTE: ['QUOTE_APPROVED', 'QUOTE_REJECTED', 'CANCELLED'],
  QUOTE_APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  // A rejected quote still ends in a completed inspection — the customer pays
  // the inspection fee and no credit is written.
  QUOTE_REJECTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REPORT_APPROVED', 'IN_PROGRESS'],
  REPORT_APPROVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
  RESCHEDULED: ['SCHEDULED', 'CANCELLED'],
};

/** Statuses after which quota should be returned to the pool. */
export const QUOTA_RELEASING: JobStatus[] = ['CANCELLED', 'RESCHEDULED'];

export class InvalidTransitionError extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`Invalid job status transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionInput {
  jobId: string;
  to: JobStatus;
  actorId?: string | null;
  actorRole?: string | null;
  note?: string | null;
  /** Captured by the technician PWA on EN_ROUTE / ON_SITE. */
  lat?: number | null;
  lng?: number | null;
  occurredAt?: Date;
}

export async function transitionJob(
  input: TransitionInput,
  tx?: Prisma.TransactionClient,
): Promise<{ from: JobStatus; to: JobStatus }> {
  const db = tx ?? prisma;

  const job = await db.job.findUnique({
    where: { id: input.jobId },
    select: { id: true, status: true },
  });
  if (!job) throw new Error(`Job not found: ${input.jobId}`);

  const from = job.status;
  if (from === input.to) return { from, to: input.to };
  if (!canTransition(from, input.to)) throw new InvalidTransitionError(from, input.to);

  await db.job.update({
    where: { id: input.jobId },
    data: { status: input.to },
  });

  await db.jobStatusEvent.create({
    data: {
      jobId: input.jobId,
      fromStatus: from,
      toStatus: input.to,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      note: input.note ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });

  return { from, to: input.to };
}

/**
 * SLA measurement: time from SUBMITTED to first ON_SITE.
 * NBC's public promise is on-site within 1 business day.
 */
export async function responseTimeMinutes(jobId: string): Promise<number | null> {
  const events = await prisma.jobStatusEvent.findMany({
    where: { jobId, toStatus: { in: ['SUBMITTED', 'ON_SITE'] } },
    orderBy: { occurredAt: 'asc' },
  });
  const submitted = events.find((e) => e.toStatus === 'SUBMITTED');
  const onSite = events.find((e) => e.toStatus === 'ON_SITE');
  if (!submitted || !onSite) return null;
  return Math.round((onSite.occurredAt.getTime() - submitted.occurredAt.getTime()) / 60_000);
}
