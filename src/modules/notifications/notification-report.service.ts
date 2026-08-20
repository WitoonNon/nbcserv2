import 'server-only';
import { prisma } from '@/lib/db';

/**
 * What the office needs when a customer says "I never got the message".
 *
 * Without this the honest answer is "I don't know". NotificationLog has held
 * the answer since the first send, but a row nobody can read is not an answer
 * — and the question arrives by telephone, from somebody who is already
 * annoyed, while the person picking up has no database client.
 *
 * Three things settle almost every case: whether that customer ever linked a
 * LINE account, whether we tried, and what LINE said if we did.
 */

export interface NotificationRow {
  id: string;
  templateCode: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  jobNo: string | null;
  customerName: string | null;
  /** Truncated. The full id identifies a person and is not needed to answer the question. */
  recipientHint: string;
}

export interface NotificationSummary {
  linkedCustomers: number;
  sentLast30Days: number;
  failedLast30Days: number;
  /** Failures worth trying again, as opposed to ones that never will succeed. */
  retryableFailures: number;
}

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

export async function notificationSummary(): Promise<NotificationSummary> {
  const since = thirtyDaysAgo();
  const [linkedCustomers, sent, failures] = await Promise.all([
    prisma.customerIdentity.count({ where: { provider: 'LINE' } }),
    prisma.notificationLog.count({ where: { status: 'SENT', createdAt: { gte: since } } }),
    prisma.notificationLog.findMany({
      where: { status: 'FAILED', createdAt: { gte: since } },
      select: { error: true },
    }),
  ]);

  return {
    linkedCustomers,
    sentLast30Days: sent,
    failedLast30Days: failures.length,
    // The marker the sender writes when LINE's answer was "not now" rather
    // than "not ever". Only these are worth a second attempt.
    retryableFailures: failures.filter((f) => f.error?.startsWith('[retryable]')).length,
  };
}

export async function recentNotifications(params?: {
  onlyFailed?: boolean;
  take?: number;
}): Promise<NotificationRow[]> {
  const rows = await prisma.notificationLog.findMany({
    where: params?.onlyFailed ? { status: 'FAILED' } : undefined,
    orderBy: { createdAt: 'desc' },
    take: params?.take ?? 50,
    select: {
      id: true,
      templateCode: true,
      status: true,
      error: true,
      createdAt: true,
      sentAt: true,
      recipient: true,
      job: { select: { jobNo: true, customer: { select: { displayName: true } } } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    templateCode: r.templateCode,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    jobNo: r.job?.jobNo ?? null,
    customerName: r.job?.customer.displayName ?? null,
    // Enough to tell two recipients apart on screen, not enough to be a
    // contact detail sitting in a screenshot.
    recipientHint: `${r.recipient.slice(0, 6)}…${r.recipient.slice(-4)}`,
  }));
}
