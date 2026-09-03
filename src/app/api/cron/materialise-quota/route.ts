import { NextResponse } from 'next/server';
import { materialiseQuota, QUOTA_HORIZON_DAYS, dateOnly } from '@/modules/scheduling/quota.service';
import { proposePmJobs } from '@/modules/scheduling/pm.service';
import { authorizeCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Roll the quota calendar forward one night at a time.
 *
 * Buckets are materialised for a 90-day horizon. Without this the horizon
 * simply expires: the booking calendar goes blank a quarter after launch and
 * customers silently cannot book, with nothing in the logs to explain it.
 *
 * Safe to run repeatedly — materialiseQuota() updates capacities in place and
 * never touches the used* counters.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const from = dateOnly(new Date());
    const to = new Date(from.getTime() + QUOTA_HORIZON_DAYS * 86_400_000);
    const written = await materialiseQuota(from, to);

    // PM planning rides along here rather than having its own cron entry:
    // Vercel Hobby allows two, and this file already holds one of them. The
    // order is not incidental — proposals are placed against quota buckets, so
    // the calendar has to exist before anything can be planned into it.
    //
    // Failures are reported, not thrown: a PM planner that cannot run must
    // never make the quota calendar look like it failed. An empty calendar
    // stops every customer booking; missing proposals stop nothing.
    let pm: { proposed: number; unplaced: number } | { error: string };
    try {
      const plan = await proposePmJobs();
      pm = { proposed: plan.proposed.length, unplaced: plan.unplaced.length };
    } catch (e) {
      pm = { error: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({
      ok: true,
      written,
      horizonDays: QUOTA_HORIZON_DAYS,
      through: to.toISOString().slice(0, 10),
      pm,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
