import { NextResponse } from 'next/server';
import { sweepExpiredHolds } from '@/modules/scheduling/quota.service';
import { authorizeCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/**
 * Delete booking holds whose ten minutes have run out.
 *
 * This is table hygiene, not correctness. Both getAvailability() and
 * bookSlotWithin() filter on `expiresAt > NOW()`, so an expired hold already
 * stops counting against capacity the moment it lapses — nothing is blocked
 * while it waits to be swept. Running daily is therefore sufficient; the only
 * cost of a late sweep is dead rows in quota_holds.
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
