import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { env } from '@/lib/env';
import { getSessionUser } from '@/lib/auth/session';
import {
  issueRotatingToken,
  ROTATING_WINDOW_SECONDS,
  windowFor,
} from '@/modules/hr/timeclock-token';

export const dynamic = 'force-dynamic';

/**
 * The rotating code, as an SVG, for the screen at the scan point.
 *
 * Behind the office permission rather than open: anyone who can fetch this can
 * clock in from anywhere the location check would forgive, which is exactly
 * the shortcut the rotating code exists to close. The printed sheet is the
 * open one, and it is open because it hangs on a wall.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'ยังไม่ได้เข้าสู่ระบบ' }, { status: 401 });
  if (!user.permissions.has('admin.config')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }

  const scanPointId = new URL(req.url).searchParams.get('point') ?? 'OFFICE';
  // The id ends up in a signed token and in a URL; keep it to a safe alphabet
  // rather than trusting the query string.
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(scanPointId)) {
    return NextResponse.json({ error: 'จุดลงเวลาไม่ถูกต้อง' }, { status: 400 });
  }

  const now = new Date();
  const token = await issueRotatingToken(scanPointId, env().AUTH_SECRET, now);
  const url = `${env().APP_URL}/clock?t=${encodeURIComponent(token)}`;

  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // Seconds until this window turns over, so the screen refreshes on the
  // boundary rather than drifting a little further out of step each time.
  const nextWindowStart = (windowFor(now) + 1) * ROTATING_WINDOW_SECONDS * 1000;
  const expiresInSeconds = Math.max(1, Math.ceil((nextWindowStart - now.getTime()) / 1000));

  return NextResponse.json(
    { svg, expiresInSeconds },
    // Never cached: a cached rotating code is a static one.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
