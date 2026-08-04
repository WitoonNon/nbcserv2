import { NextResponse } from 'next/server';
import { sweepExpiredHolds } from '@/modules/scheduling/quota.service';
import { authorizeCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/**
 * Delete booking holds whose ten minutes have run out.
 *
 * Availability counts live holds against capacity, so an abandoned booking form
 * keeps a slot off the market until it is swept. Without this, a day slowly
 * looks fuller than it is and the office loses work it could have taken.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const released = await sweepExpiredHolds();
    return NextResponse.json({ ok: true, released });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
