import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { callbackUrl } from './line-link';

/**
 * LINE Login — how a customer's LINE identity gets attached to their booking.
 *
 * ## Why this exists at all
 *
 * Push messages need a LINE userId, and there is no way to derive one. The
 * account has 1,040 followers and no API lists them; a telephone number cannot
 * be converted into a userId by any means. Every customer has to hand theirs
 * over once, and this is the least the customer can be asked to do: one tap on
 * the booking confirmation.
 *
 * The alternative — post a code into the chat and match it in a webhook — asks
 * a customer to add the account, open the chat, and type a job number
 * correctly. Most will not, and being a follower is a precondition of that
 * route rather than something it can fix.
 *
 * ## Why the login channel must share the messaging channel's provider
 *
 * A userId identifies a person *to a provider*. A login channel created under
 * a different provider returns ids the messaging channel cannot push to, and
 * nothing fails visibly: the link succeeds, the id is stored, and messages are
 * simply never delivered.
 */

const AUTHORIZE = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN = 'https://api.line.me/oauth2/v2.1/token';
const PROFILE = 'https://api.line.me/v2/profile';

export class LineLoginError extends Error {}

function credentials() {
  const e = env();
  if (!e.LINE_LOGIN_CHANNEL_ID || !e.LINE_LOGIN_CHANNEL_SECRET) {
    throw new LineLoginError('ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET');
  }
  return { id: e.LINE_LOGIN_CHANNEL_ID, secret: e.LINE_LOGIN_CHANNEL_SECRET };
}

// Defined in line-link.ts, which carries no secret and so can be imported by
// the pre-deploy check. Re-exported here so callers have one import site.
export { callbackUrl };

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

/**
 * The `state` parameter, signed rather than stored.
 *
 * It carries which job is being linked, so the callback never has to trust a
 * job id from the query string — otherwise anyone could point the callback at
 * someone else's job and receive that customer's notifications.
 *
 * Signed with the channel secret and given a short life. A stateless value is
 * enough here because it is not a credential: it is a claim we made minutes
 * ago, and the signature is what makes it ours.
 */
export function signState(jobId: string, now = Date.now()): string {
  const nonce = randomBytes(9).toString('base64url');
  const payload = `${jobId}.${now}.${nonce}`;
  const mac = createHmac('sha256', credentials().secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${mac}`;
}

const STATE_TTL_MS = 15 * 60 * 1000;

export function verifyState(state: string, now = Date.now()): { jobId: string } | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;

  const payload = Buffer.from(parts[0]!, 'base64url').toString();
  const expected = createHmac('sha256', credentials().secret).update(payload).digest('base64url');

  // Constant-time, so the comparison cannot be used to discover a valid
  // signature one character at a time.
  const a = Buffer.from(parts[1]!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [jobId, issued] = payload.split('.');
  if (!jobId || !issued) return null;
  if (now - Number(issued) > STATE_TTL_MS) return null;
  return { jobId };
}

// ---------------------------------------------------------------------------
// the flow
// ---------------------------------------------------------------------------

/**
 * Where to send the customer.
 *
 * `bot_prompt=aggressive` is the point of using login rather than a webhook:
 * it puts an "add friend" step in the same flow, so one tap produces both the
 * userId AND the follow that a push requires. Without it we would learn who
 * someone is and still be unable to message them.
 */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: credentials().id,
    redirect_uri: callbackUrl(),
    state,
    scope: 'profile openid',
    bot_prompt: 'aggressive',
  });
  return `${AUTHORIZE}?${params}`;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  /** True when the customer also added the official account during login. */
  friended: boolean;
}

/** Trade the one-time code for the customer's identity. */
export async function exchangeCode(code: string): Promise<LineProfile> {
  const { id, secret } = credentials();

  const tokenRes = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(),
      client_id: id,
      client_secret: secret,
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    throw new LineLoginError(`แลกโค้ดกับ LINE ไม่สำเร็จ (${tokenRes.status}): ${detail.slice(0, 200)}`);
  }

  const token = (await tokenRes.json()) as {
    access_token: string;
    /** Present when the customer was shown the add-friend prompt. */
    friendship_status_changed?: boolean;
  };

  // The profile endpoint rather than decoding the id_token: it needs no JWT
  // verification of our own, and a hand-rolled verifier that skips a check is
  // a much worse failure than one extra request on a path that runs once per
  // customer.
  const profileRes = await fetch(PROFILE, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) {
    throw new LineLoginError(`อ่านโปรไฟล์จาก LINE ไม่สำเร็จ (${profileRes.status})`);
  }

  const profile = (await profileRes.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  };

  return { ...profile, friended: token.friendship_status_changed === true };
}
