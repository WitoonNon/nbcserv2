import 'server-only';
import { prisma } from '@/lib/db';
import { notifier } from '@/lib/notify';
import { lineRecipientForJob } from '@/modules/customers/identity.service';
import { env } from '@/lib/env';
import { formatThaiDate } from '@/lib/date/buddhist';

/**
 * Sending a customer a notification about their job.
 *
 * ## The rule that governs everything here
 *
 * **A notification must never be able to fail a job.** Booking a slot and
 * telling someone about it are different concerns with different failure
 * modes, and LINE is a third party: its rate limits, its outages and its
 * 300-message ceiling have nothing to do with whether the customer has a
 * technician on Tuesday. So every path out of this module returns rather than
 * throws, and callers are not expected to handle a result.
 *
 * The record of what happened lives in NotificationLog instead. A message that
 * could not be sent is a row saying so — not an exception, and not silence.
 */

export type JobNotification = 'JOB_CONFIRMED' | 'TECH_EN_ROUTE' | 'TECH_ON_SITE';

/** Fill `{{name}}` placeholders from the template body. */
function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => vars[key] ?? whole);
}

/**
 * Tell the customer something about their job, if we can reach them.
 *
 * Returns what happened for the benefit of tests and the office screens; no
 * caller has to check it.
 */
export async function notifyJob(params: {
  jobId: string;
  templateCode: JobNotification;
  vars?: Record<string, string>;
  /**
   * Makes the send idempotent at LINE's end. Defaults to job + template, which
   * is what stops a retried booking or a double-tapped "ถึงหน้างาน" arriving
   * as two messages.
   */
  retryKey?: string;
  /**
   * Send at most one of these per job, ever.
   *
   * Booking confirmation needs it. Most customers link their LINE account
   * *after* booking, so the send has to be attempted again at the moment of
   * linking — but a returning customer is already linked and was messaged at
   * booking time, and would otherwise be told twice.
   */
  once?: boolean;
}): Promise<{ status: 'SENT' | 'FAILED' | 'SKIPPED'; reason?: string }> {
  const { jobId, templateCode, vars = {} } = params;

  try {
    if (params.once) {
      const already = await prisma.notificationLog.findFirst({
        where: { jobId, templateCode, status: 'SENT' },
        select: { id: true },
      });
      if (already) return { status: 'SKIPPED', reason: 'ส่งไปแล้วสำหรับงานนี้' };
    }

    const recipient = await lineRecipientForJob(jobId);

    if (!recipient) {
      // Not an error. Most customers will never link a LINE account, and a job
      // for one of them is an ordinary job. Nothing is logged, because a row
      // per unlinked customer per event is noise that buries the real failures.
      return { status: 'SKIPPED', reason: 'ลูกค้ายังไม่ได้ผูกบัญชี LINE' };
    }

    const template = await prisma.notificationTemplate.findFirst({
      where: { code: templateCode, isActive: true },
      select: { bodyTh: true },
    });
    if (!template) {
      return { status: 'SKIPPED', reason: `ยังไม่ได้เผยแพร่เทมเพลต ${templateCode}` };
    }

    const body = render(template.bodyTh, vars);
    const result = await notifier().send({
      recipient,
      templateCode,
      body,
      jobId,
      data: { retryKey: params.retryKey ?? `${jobId}:${templateCode}` },
    });

    await prisma.notificationLog.create({
      data: {
        templateCode,
        channel: 'LINE',
        recipient,
        jobId,
        payload: vars,
        status: result.ok ? 'SENT' : 'FAILED',
        // A failure that could still succeed is worth distinguishing from one
        // that cannot, because only the first is worth a retry sweep later.
        error: result.ok ? null : `${result.retryable ? '[retryable] ' : ''}${result.error ?? ''}`,
        sentAt: result.ok ? new Date() : null,
      },
    });

    return result.ok ? { status: 'SENT' } : { status: 'FAILED', reason: result.error };
  } catch (error) {
    // Reached only when the database itself is unavailable — at which point
    // there is nowhere to record the failure either. Swallowed on purpose: the
    // job this was about has already been committed, and throwing here would
    // roll back a booking the customer has been told is confirmed.
    return { status: 'FAILED', reason: String(error) };
  }
}

/**
 * The values every job template can refer to.
 *
 * Read once here rather than at each call site, so a template that starts
 * using `{{scheduledDate}}` tomorrow does not need the caller changed — the
 * whole point of keeping message bodies in the database.
 */
export async function jobNotificationVars(jobId: string): Promise<Record<string, string>> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { jobNo: true, scheduledDate: true },
  });
  if (!job) return {};

  const base = env().APP_URL.replace(/\/+$/, '');
  return {
    jobNo: job.jobNo,
    scheduledDate: job.scheduledDate ? formatThaiDate(job.scheduledDate) : '-',
    trackUrl: `${base}/track?jobNo=${encodeURIComponent(job.jobNo)}`,
  };
}

/** Fire and forget, for callers that must not wait on a third party. */
export async function notifyJobSafely(params: Parameters<typeof notifyJob>[0]): Promise<void> {
  const vars = params.vars ?? (await jobNotificationVars(params.jobId).catch(() => ({})));
  await notifyJob({ ...params, vars });
}
