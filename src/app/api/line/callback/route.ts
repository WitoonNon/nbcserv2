import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { exchangeCode, verifyState, LineLoginError } from '@/lib/notify/line-login';
import { linkLineToJobContact, IdentityError } from '@/modules/customers/identity.service';
import { LINK_JOB_COOKIE } from '@/lib/notify/link-cookie';

export const dynamic = 'force-dynamic';

/**
 * Where LINE sends the customer back after they approve.
 *
 * Nothing here trusts the query string except the one-time `code`, which is
 * worthless without the channel secret. Which job is being linked comes out of
 * the signed `state` we issued minutes earlier — so a callback URL forged by
 * hand cannot attach an attacker's LINE account to somebody else's job.
 */
function back(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env().APP_URL));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // The customer pressed cancel on LINE's consent screen. Not an error — they
  // are simply not opting in, and the booking they already made stands.
  const error = url.searchParams.get('error');
  if (error) return back('/track?line=declined');

  if (!code || !state) return back('/track?line=failed');

  let jobId: string;
  try {
    const verified = verifyState(state);
    if (!verified) return back('/track?line=failed');
    jobId = verified.jobId;
  } catch (e) {
    if (e instanceof LineLoginError) return back('/track?line=unavailable');
    throw e;
  }

  try {
    const profile = await exchangeCode(code);
    const result = await linkLineToJobContact({
      jobId,
      lineUserId: profile.userId,
      displayName: profile.displayName,
    });

    // Consumed. Leaving it set would let the next visitor on a shared phone
    // link their own account to this booking.
    (await cookies()).delete(LINK_JOB_COOKIE);

    // `friended` is false when the customer already followed the account —
    // the add-friend prompt only reports a *change*. It is not a failure, and
    // the distinction matters only for what the confirmation screen says.
    const status = result.alreadyLinked ? 'already' : 'ok';
    return back(`/track?line=${status}`);
  } catch (e) {
    if (e instanceof IdentityError) return back('/track?line=failed');
    if (e instanceof LineLoginError) return back('/track?line=failed');
    throw e;
  }
}
