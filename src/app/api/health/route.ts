import { NextResponse } from 'next/server';
import { healthReport } from '@/modules/platform/health.service';

export const dynamic = 'force-dynamic';

/**
 * What an uptime monitor polls.
 *
 * Deliberately unauthenticated. A health endpoint behind a secret is one an
 * external monitor cannot reach without being given a credential to store,
 * and the thing it discloses — whether the database answered, how many days
 * of quota calendar remain — is operational, not customer data. No names, no
 * jobs, no counts of anything a competitor would want.
 *
 * ## The status code is the contract
 *
 * `200` while customers can be served, `503` when they cannot. WARN stays at
 * 200 on purpose: a monitor that pages because a backup is 40 hours old gets
 * muted, and a muted monitor does not tell anybody when the database dies.
 *
 * Set up: point UptimeRobot / Better Stack / Vercel monitoring at
 * `https://<host>/api/health` every 5 minutes and alert on non-200. Do NOT
 * schedule this as a Vercel cron — a check running inside the deployment it
 * is checking reports nothing on the one day it matters.
 */
export async function GET() {
  try {
    const report = await healthReport();
    return NextResponse.json(report, {
      status: report.level === 'DOWN' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    // The report builder itself failing is as down as it gets.
    return NextResponse.json(
      {
        level: 'DOWN',
        checkedAt: new Date().toISOString(),
        checks: [
          {
            key: 'health',
            labelTh: 'ระบบตรวจสอบ',
            level: 'DOWN',
            detailTh: e instanceof Error ? e.message.slice(0, 200) : 'ตรวจไม่สำเร็จ',
          },
        ],
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
