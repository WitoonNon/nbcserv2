import { createHash } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * LINE Messaging API — the push side.
 *
 * ## Why this mints its own access token
 *
 * The obvious route is a long-lived token pasted into the environment. We were
 * given one and it came back 401 from every endpoint, while the channel id and
 * secret beside it worked — a long-lived token can be revoked from the console
 * by anyone with access, and nothing tells the application it happened.
 *
 * So the token is issued here from the channel id and secret, which are the
 * credentials that actually identify the channel and which nobody revokes by
 * clicking the wrong button. It also means one less secret to hand around: a
 * leaked short-lived token expires by itself, a leaked long-lived one is good
 * until somebody notices.
 *
 * LINE caps how many access tokens a channel may hold, so this caches and
 * reuses one rather than issuing per request, and refreshes early — a token
 * that expires between the check and the call is a message that silently does
 * not arrive.
 */

const API = 'https://api.line.me';

/** Refresh this far before the stated expiry, so a call never races it. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;

export class LineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** False for the failures that will fail again the same way. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Discard the cached token — for tests, and after a 401 in flight. */
export function resetLineToken(): void {
  cached = null;
}

export async function lineAccessToken(now = Date.now()): Promise<string> {
  if (cached && cached.expiresAt > now) return cached.token;

  const e = env();
  if (!e.LINE_CHANNEL_ID || !e.LINE_CHANNEL_SECRET) {
    throw new LineError('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID / LINE_CHANNEL_SECRET', 0, false);
  }

  const res = await fetch(`${API}/v2/oauth/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: e.LINE_CHANNEL_ID,
      client_secret: e.LINE_CHANNEL_SECRET,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LineError(
      `ขอ access token จาก LINE ไม่สำเร็จ (${res.status}): ${detail.slice(0, 200)}`,
      res.status,
      res.status >= 500 || res.status === 429,
    );
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: body.access_token,
    expiresAt: now + Math.max(0, body.expires_in * 1000 - EXPIRY_MARGIN_MS),
  };
  return cached.token;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await lineAccessToken();
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    },
  });
}

export interface BotInfo {
  userId: string;
  basicId: string;
  premiumId?: string;
  displayName: string;
}

/** Who this channel actually is. Free, and consumes no message quota. */
export async function botInfo(): Promise<BotInfo> {
  const res = await authedFetch('/v2/bot/info');
  if (!res.ok) {
    throw new LineError(`อ่านข้อมูลบัญชีไม่สำเร็จ (${res.status})`, res.status, res.status >= 500);
  }
  return (await res.json()) as BotInfo;
}

export interface QuotaStatus {
  /** 'none' means an unlimited plan; 'limited' carries a monthly ceiling. */
  type: string;
  limit: number | null;
  used: number;
  remaining: number | null;
}

/**
 * How many pushes are left this month.
 *
 * Both calls are free. Worth knowing before a batch, because LINE does not
 * partially deliver: once the ceiling is reached every further push fails, and
 * on the free plan the ceiling is 300.
 */
export async function messageQuota(): Promise<QuotaStatus> {
  const [q, c] = await Promise.all([
    authedFetch('/v2/bot/message/quota'),
    authedFetch('/v2/bot/message/quota/consumption'),
  ]);
  if (!q.ok || !c.ok) {
    const status = q.ok ? c.status : q.status;
    throw new LineError(`อ่านโควตาไม่สำเร็จ (${status})`, status, status >= 500);
  }
  const quota = (await q.json()) as { type: string; value?: number };
  const used = ((await c.json()) as { totalUsage: number }).totalUsage;
  const limit = quota.type === 'limited' ? (quota.value ?? 0) : null;
  return {
    type: quota.type,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

/**
 * Turn a readable key into the UUID LINE insists on.
 *
 * LINE rejects anything that is not a UUID with
 * `The value for the 'X-Line-Retry-Key' parameter is invalid` — a 400 that
 * looks like the message was refused rather than the header. Callers pass
 * something meaningful like `<jobId>:TECH_ON_SITE`, and it is hashed here.
 *
 * Deterministic on purpose: the same logical send must produce the same key
 * every time, or retrying stops being deduplicated and the customer gets the
 * message twice. This is UUIDv5 in shape — SHA-1 of the name, with the version
 * and variant bits set — so the value is both stable and syntactically valid.
 */
export function retryKeyUuid(key: string): string {
  const h = createHash('sha1').update(key).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; // version 5
  h[8] = (h[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Push a text message to one LINE user.
 *
 * `retryKey` makes the send idempotent at LINE's end: a request that times out
 * and is retried with the same key delivers once, not twice. A customer who
 * gets "ช่างกำลังเดินทาง" three times remembers it, and on a 300-message plan
 * the duplicates are also a third of the month's budget.
 */
export async function pushText(
  to: string,
  text: string,
  retryKey?: string,
): Promise<{ ok: true } | never> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryKey) headers['X-Line-Retry-Key'] = retryKeyUuid(retryKey);

  const res = await authedFetch('/v2/bot/message/push', {
    method: 'POST',
    headers,
    // LINE truncates at 5000 characters and rejects an empty string.
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
  });

  if (res.ok) return { ok: true };

  const detail = await res.text().catch(() => '');

  // 429 is the monthly ceiling as well as rate limiting, and neither is fixed
  // by trying again immediately — but both are fixed by trying again later, so
  // the message stays in the queue rather than being thrown away.
  //
  // 400 means the recipient id is wrong and 403 means the account has blocked
  // the OA or lacks the plan. Retrying either burns quota to produce the same
  // failure, and a blocked customer must not be pushed at forever.
  const retryable = res.status === 429 || res.status >= 500;
  throw new LineError(`ส่งข้อความไม่สำเร็จ (${res.status}): ${detail.slice(0, 200)}`, res.status, retryable);
}
