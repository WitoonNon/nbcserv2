import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { exchangeCode, verifyState, LineLoginError } from '@/lib/notify/line-login';
import { linkLineToJobContact, IdentityError } from '@/modules/customers/identity.service';
import { LINK_JOB_COOKIE } from '@/lib/notify/line-link';
import { notifyJobSafely } from '@/modules/notifications/notify.service';

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

  if (!code || !state) {
    console.error('[line:callback] LINE ไม่ได้ส่ง code หรือ state กลับมา');
    return back('/track?line=failed');
  }

  let jobId: string;
  try {
    const verified = verifyState(state);
    if (!verified) {
      // Tampered, or simply older than fifteen minutes — a customer who
      // started the flow and finished it much later.
      console.error('[line:callback] state ใช้ไม่ได้หรือหมดอายุ');
      return back('/track?line=failed');
    }
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
    // The first message doubles as proof the link works: the customer sees it
    // arrive in LINE seconds after tapping, which no confirmation screen of
    // ours can demonstrate.
    //
    // This is where booking confirmation actually gets sent, because at
    // booking time there was no LINE account to send it to yet — the customer
    // links immediately afterwards. `once` keeps a returning customer, who was
    // already messaged at booking, from being told twice.
    await notifyJobSafely({ jobId, templateCode: 'JOB_CONFIRMED', once: true });

    const status = result.alreadyLinked ? 'already' : 'ok';
    return back(`/track?line=${status}`);
  } catch (e) {
    // Logged, because the customer only ever sees "ไม่สำเร็จ" and there is
    // nothing else to go on. This failed silently once already: the booking
    // path created no CustomerContact, so linking threw IdentityError after
    // the customer had logged in and added the account, and the only trace
    // anywhere was a 307 to /track?line=failed.
    //
    // No userId and no code in the message — this line goes to a log.
    if (e instanceof IdentityError) {
      console.error('[line:callback] ผูกบัญชีไม่ได้', { jobId, reason: e.message });
      return back('/track?line=failed');
    }
    if (e instanceof LineLoginError) {
      console.error('[line:callback] คุยกับ LINE ไม่สำเร็จ', { jobId, reason: e.message });
      return back('/track?line=failed');
    }
    console.error('[line:callback] ล้มเหลวโดยไม่ทราบสาเหตุ', { jobId, error: String(e) });
    throw e;
  }
}
