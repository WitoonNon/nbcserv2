import { NextResponse } from 'next/server';
import { proposePmJobs, PM_LOOKAHEAD_DAYS } from '@/modules/scheduling/pm.service';
import { authorizeCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Raise PM proposals for machines coming due.
 *
 * The asset register has carried `nextPmDueAt` since it was built and nothing
 * ever read it — the cycle only advanced when somebody remembered. This is the
 * job that remembers, and the revenue it protects is the repeat kind: a
 * customer who is asked comes back, a customer who is not eventually calls
 * somebody else.
 *
 * Nothing here is committed to the customer. Each proposal is a DRAFT job for
 * the office to confirm or discard, holds no quota, and sends no message.
 *
 * Safe to run daily: a site whose machines are already on an open job is
 * skipped, so yesterday's unconfirmed proposal is not suggested again today.
 *
 * `?dry=1` returns the plan without writing it — what tomorrow's run would do.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const dryRun = new URL(req.url).searchParams.get('dry') === '1';

  try {
    const result = await proposePmJobs({ dryRun });

    return NextResponse.json({
      ok: true,
      dryRun,
      lookaheadDays: PM_LOOKAHEAD_DAYS,
      proposed: result.proposed.length,
      alreadyCovered: result.alreadyCovered,
      // Named, not just counted: a site that cannot be placed needs somebody
      // to look at it, and a number alone tells nobody which one.
      unplaced: result.unplaced,
      jobs: result.proposed.map((p) => ({
        jobNo: p.jobNo,
        site: p.siteName,
        customer: p.customerName,
        date: p.scheduledDate,
        units: p.units,
        offsetDays: p.offsetDays,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
