import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { authorizeUrl, signState, LineLoginError } from '@/lib/notify/line-login';
import { LINK_JOB_COOKIE } from '@/lib/notify/line-link';

export const dynamic = 'force-dynamic';

/**
 * Start linking a LINE account to the booking the visitor just made.
 *
 * The job is taken from an httpOnly cookie set at the moment the booking
 * succeeded — never from the query string. A job id in the URL would let
 * anyone who learned one subscribe their own LINE account to somebody else's
 * job and start receiving messages about a stranger's home: when the
 * technician is on the way, and therefore when the house is about to be
 * occupied.
 *
 * Taking it from the cookie means only the browser that made the booking can
 * link it, which is exactly the population that should be able to.
 */
export async function GET() {
  const jar = await cookies();
  const jobId = jar.get(LINK_JOB_COOKIE)?.value;

  if (!jobId) {
    return NextResponse.redirect(new URL('/booking?line=expired', env().APP_URL));
  }

  // A cookie is not proof the job exists — it may have been cancelled, or the
  // value tampered with. Checking now means the customer is not sent through
  // LINE only to be turned away on the way back.
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) {
    return NextResponse.redirect(new URL('/booking?line=expired', env().APP_URL));
  }

  try {
    return NextResponse.redirect(authorizeUrl(signState(job.id)));
  } catch (error) {
    if (error instanceof LineLoginError) {
      return NextResponse.redirect(
        new URL('/booking?line=unavailable', env().APP_URL),
      );
    }
    throw error;
  }
}
