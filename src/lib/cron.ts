import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Cron endpoint guard.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every scheduled
 * request. These endpoints mutate quota, so they must not be a URL anyone can
 * curl: re-materialising on demand is harmless, but sweeping holds on demand
 * would let a caller release everyone else's reservations at will.
 *
 * With no CRON_SECRET set the routes refuse rather than run open — a missing
 * secret in production is a misconfiguration, not permission.
 */
export function authorizeCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Local development has no secret and no scheduler; allow it there only.
    if (process.env.NODE_ENV !== 'production') return null;
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }

  const header = req.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
