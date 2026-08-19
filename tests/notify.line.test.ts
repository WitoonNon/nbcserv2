import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The LINE push path, against a stubbed fetch.
 *
 * scripts/line-check.ts already talks to the real API, and should: it is what
 * caught a long-lived access token of exactly the right length and shape that
 * returned 401 from every endpoint. But the live check cannot exercise the
 * cases that matter most — a 429 at the monthly ceiling, a 403 from a customer
 * who blocked the account, a token expiring mid-flight — without either
 * spending the month's quota or waiting a month.
 *
 * So the failures are simulated here, and what is asserted is the decision the
 * caller depends on: try again, or never again. Getting that wrong either
 * hammers LINE with a request that cannot succeed, or silently drops a message
 * a customer was waiting for.
 */

const CHANNEL_ID = '2011171949';
const CHANNEL_SECRET = 'secret-for-tests';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[];
let respond: (call: Call) => Response;

async function loadLine() {
  vi.resetModules();
  const mod = await import('../src/lib/notify/line');
  mod.resetLineToken();
  return mod;
}

/** A successful token issue, unless a test overrides it. */
function tokenResponse(expiresIn = 2_592_000) {
  return new Response(JSON.stringify({ access_token: 'tok-' + Math.random(), expires_in: expiresIn }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
  process.env.NOTIFY_DRIVER = 'line';
  process.env.LINE_CHANNEL_ID = CHANNEL_ID;
  process.env.LINE_CHANNEL_SECRET = CHANNEL_SECRET;

  respond = (call) =>
    call.url.includes('/oauth/accessToken') ? tokenResponse() : new Response('{}', { status: 200 });

  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    };
    calls.push(call);
    return Promise.resolve(respond(call));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NOTIFY_DRIVER;
  delete process.env.LINE_CHANNEL_ID;
  delete process.env.LINE_CHANNEL_SECRET;
});

describe('the access token is minted, not pasted', () => {
  it('exchanges the channel id and secret for a token', async () => {
    const { lineAccessToken } = await loadLine();
    await lineAccessToken();

    const issue = calls.find((c) => c.url.includes('/oauth/accessToken'))!;
    expect(issue.method).toBe('POST');
    expect(String(issue.body)).toContain('grant_type=client_credentials');
    expect(String(issue.body)).toContain(`client_id=${CHANNEL_ID}`);
  });

  it('reuses one token instead of issuing per request', async () => {
    // LINE caps how many access tokens a channel may hold at once, so a fresh
    // token per push would eventually stop being issued at all.
    const { lineAccessToken } = await loadLine();
    const a = await lineAccessToken();
    const b = await lineAccessToken();

    expect(a).toBe(b);
    expect(calls.filter((c) => c.url.includes('/oauth/accessToken'))).toHaveLength(1);
  });

  it('re-issues once the cached one is near expiry', async () => {
    const { lineAccessToken } = await loadLine();
    // An hour, so the five-minute safety margin is reachable in this test.
    respond = () => tokenResponse(3600);

    const start = 1_000_000;
    const a = await lineAccessToken(start);
    // A token good for an hour is refreshed inside the last five minutes,
    // rather than at the instant it dies — a token that expires between the
    // check and the call is a message that never arrives.
    const b = await lineAccessToken(start + 56 * 60 * 1000);

    expect(b).not.toBe(a);
    expect(calls.filter((c) => c.url.includes('/oauth/accessToken'))).toHaveLength(2);
  });

  it('reports a rejected channel secret as permanent', async () => {
    const { lineAccessToken, LineError } = await loadLine();
    respond = () => new Response('{"error":"invalid_client"}', { status: 400 });

    await expect(lineAccessToken()).rejects.toThrow(LineError);
    await expect(lineAccessToken()).rejects.toMatchObject({ retryable: false });
  });
});

describe('what a failed push means', () => {
  async function push(status: number, body = '{}') {
    const { pushText } = await loadLine();
    respond = (call) =>
      call.url.includes('/oauth/accessToken') ? tokenResponse() : new Response(body, { status });
    return pushText(`U${'a'.repeat(32)}`, 'ทดสอบ').catch((e) => e);
  }

  it('treats the monthly ceiling as worth trying later', async () => {
    // 429 covers both rate limiting and the 300-message plan running out.
    // Neither is fixed by retrying now; both are fixed by retrying later, so
    // the message stays queued rather than being discarded.
    expect(await push(429)).toMatchObject({ status: 429, retryable: true });
  });

  it('treats a rejected recipient as final', async () => {
    // 400 is a wrong userId. Retrying spends quota to fail identically.
    expect(await push(400, '{"message":"Failed to send messages"}')).toMatchObject({
      status: 400,
      retryable: false,
    });
  });

  it('treats a blocked account as final', async () => {
    // A customer who blocked the OA must not be pushed at forever.
    expect(await push(403)).toMatchObject({ status: 403, retryable: false });
  });

  it('treats a LINE outage as worth trying later', async () => {
    expect(await push(500)).toMatchObject({ status: 500, retryable: true });
  });
});

describe('the push request itself', () => {
  it('sends the retry key so a timeout cannot deliver twice', async () => {
    const { pushText } = await loadLine();
    await pushText(`U${'a'.repeat(32)}`, 'ทดสอบ', 'job-42-arrived');

    const push = calls.find((c) => c.url.includes('/message/push'))!;
    // Without this, a request that times out and is retried arrives as two
    // messages — an annoyance the customer remembers, and two of the 300.
    expect(push.headers['X-Line-Retry-Key']).toBe('job-42-arrived');
    expect(push.headers.Authorization).toMatch(/^Bearer tok-/);
  });

  it('keeps Thai intact and stays inside the length limit', async () => {
    const { pushText } = await loadLine();
    const long = 'ก'.repeat(6000);
    await pushText(`U${'a'.repeat(32)}`, long);

    const push = calls.find((c) => c.url.includes('/message/push'))!;
    const sent = JSON.parse(String(push.body)) as { messages: { text: string }[] };
    expect(sent.messages[0]!.text).toHaveLength(5000);
    expect(sent.messages[0]!.text.startsWith('กก')).toBe(true);
  });
});

describe('the adapter refuses what it cannot send', () => {
  it('rejects a phone number without calling LINE at all', async () => {
    vi.resetModules();
    const { notifier } = await import('../src/lib/notify/index');
    const result = await notifier().send({ recipient: '0812345678', body: 'ทดสอบ' });

    // A telephone number cannot be turned into a LINE userId — no API does
    // that. Spending a call to be told so is waste, and the caller needs to
    // know the customer simply has not linked their account yet.
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(result.error).toMatch(/ยังไม่ได้ผูกบัญชี/);
    expect(calls).toHaveLength(0);
  });

  it('accepts a well-formed userId', async () => {
    vi.resetModules();
    const { notifier } = await import('../src/lib/notify/index');
    const result = await notifier().send({ recipient: `U${'0'.repeat(32)}`, body: 'ทดสอบ' });

    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes('/message/push'))).toBe(true);
  });
});
