import { prisma } from '@/lib/db';
import { notifyJobSafely } from '@/modules/notifications/notify.service';
import type { JobStatus } from '@/generated/prisma';
import { transitionJob, InvalidTransitionError } from './status-machine';

/**
 * The field sequence a technician drives from their phone (Phase 2.5).
 *
 * The status machine already guards which transitions are legal; what it does
 * not know is WHO may make them. A technician may only move a job their own
 * crew is assigned to — the same rule that decides what appears in their
 * queue, applied again at the write, because hiding a button is presentation
 * and this is the gate.
 */

export class FieldWorkError extends Error {}

export interface FieldStep {
  to: JobStatus;
  labelTh: string;
  /** Statuses this step is offered from. */
  from: JobStatus[];
  /** Where the technician was when they pressed it. */
  capturesLocation: boolean;
}

/**
 * One step offered at a time. A screen used one-handed on a rooftop should ask
 * "what happens next", not present a menu of every state the job could be in.
 */
export const FIELD_STEPS: FieldStep[] = [
  { to: 'EN_ROUTE', labelTh: 'ออกเดินทาง', from: ['ASSIGNED'], capturesLocation: true },
  { to: 'ON_SITE', labelTh: 'ถึงหน้างาน', from: ['EN_ROUTE'], capturesLocation: true },
  { to: 'IN_PROGRESS', labelTh: 'เริ่มลงมือ', from: ['ON_SITE', 'QUOTE_APPROVED'], capturesLocation: false },
  { to: 'COMPLETED', labelTh: 'ปิดงาน', from: ['IN_PROGRESS'], capturesLocation: false },
];

export function nextStepFor(status: JobStatus): FieldStep | null {
  return FIELD_STEPS.find((s) => s.from.includes(status)) ?? null;
}

/**
 * Is this job one of the technician's own?
 *
 * Mirrors the queue query: a live assignment (not withdrawn) to a crew they
 * are currently a member of.
 */
async function assignedToTechnician(jobId: string, technicianId: string): Promise<boolean> {
  const match = await prisma.job.findFirst({
    where: {
      id: jobId,
      assignments: {
        some: {
          unassignedAt: null,
          crew: { members: { some: { technicianId, validTo: null } } },
        },
      },
    },
    select: { id: true },
  });
  return match !== null;
}

/**
 * Whether this event is recent enough to be worth telling the customer about.
 *
 * The technician's app queues taps made with no signal and replays them when
 * it returns, so `occurredAt` can be hours older than the request carrying it.
 * "ช่างถึงหน้างานแล้ว" arriving three hours after the technician actually
 * arrived — possibly after they have left — is worse than no message: it sends
 * somebody home to meet an engineer who has gone.
 *
 * The status change itself is still recorded with its true time. Only the
 * announcement is suppressed, because a notification is about *now* in a way
 * that a record is not.
 */
const NOTIFY_FRESHNESS_MS = 30 * 60 * 1000;

function isFresh(occurredAt: Date | undefined, now = Date.now()): boolean {
  if (!occurredAt) return true;
  return now - occurredAt.getTime() <= NOTIFY_FRESHNESS_MS;
}

export async function advanceFieldJob(params: {
  jobId: string;
  technicianId: string | null;
  to: JobStatus;
  actorId?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** When the technician pressed the button, which is not when it reached us. */
  occurredAt?: Date;
}): Promise<{ from: JobStatus; to: JobStatus }> {
  if (!params.technicianId) {
    throw new FieldWorkError('บัญชีนี้ไม่ได้ผูกกับช่างคนไหน');
  }
  if (!FIELD_STEPS.some((s) => s.to === params.to)) {
    // Closing, cancelling and quoting are decisions made in the office.
    throw new FieldWorkError('สถานะนี้เปลี่ยนจากแอปช่างไม่ได้');
  }
  if (!(await assignedToTechnician(params.jobId, params.technicianId))) {
    throw new FieldWorkError('งานนี้ไม่ได้จ่ายให้คุณ');
  }

  try {
    const moved = await transitionJob({
      jobId: params.jobId,
      to: params.to,
      actorId: params.actorId ?? null,
      actorRole: 'TECHNICIAN',
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      occurredAt: params.occurredAt,
    });

    if (params.to === 'ON_SITE' && isFresh(params.occurredAt)) {
      // After the transaction, never inside it. A third party's rate limit
      // must not hold a database lock, and a customer being unreachable must
      // not roll back the fact that the technician arrived.
      await notifyJobSafely({ jobId: params.jobId, templateCode: 'TECH_ON_SITE' });
    }

    return moved;
  } catch (e) {
    if (e instanceof InvalidTransitionError) {
      // Two taps on a slow connection, or the office moved the job first.
      // Either way the technician needs the current state, not a stack trace.
      throw new FieldWorkError('สถานะงานเปลี่ยนไปแล้ว — ดึงหน้าลงเพื่อรีเฟรช');
    }
    throw e;
  }
}

/**
 * Whether the paperwork for this job has been handed in.
 *
 * Closing a job with no submitted work order loses the record of the visit —
 * worth saying out loud on screen, but not worth blocking: a form that will
 * not submit must never trap a technician who has finished the actual work.
 */
export async function hasSubmittedWorkOrder(jobId: string): Promise<boolean> {
  const wo = await prisma.workOrder.findFirst({
    where: { jobId, status: { in: ['SUBMITTED', 'APPROVED'] } },
    select: { id: true },
  });
  return wo !== null;
}
