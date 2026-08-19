import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `state` parameter, and what it is defending.
 *
 * Which job a LINE account gets attached to comes out of `state`, not out of
 * the callback's query string. That is the whole of the access control on this
 * flow: a job id in the URL would let anyone who learned one subscribe their
 * own LINE account to a stranger's booking and start receiving messages about
 * when a technician is on the way to that person's home — which is also when
 * the house is about to be occupied.
 *
 * So the tests below are about forgery, not about happy paths.
 */

const SECRET = 'login-channel-secret-for-tests';

async function loadLogin() {
  vi.resetModules();
  return import('../src/lib/notify/line-login');
}

beforeEach(() => {
  process.env.LINE_LOGIN_CHANNEL_ID = '2011173517';
  process.env.LINE_LOGIN_CHANNEL_SECRET = SECRET;
  process.env.APP_URL = 'https://nbcserv.vercel.app';
});

afterEach(() => {
  delete process.env.LINE_LOGIN_CHANNEL_ID;
  delete process.env.LINE_LOGIN_CHANNEL_SECRET;
  delete process.env.APP_URL;
  vi.unstubAllGlobals();
});

describe('state carries the job, and proves we issued it', () => {
  it('round-trips the job id', async () => {
    const { signState, verifyState } = await loadLogin();
    expect(verifyState(signState('job-abc'))).toEqual({ jobId: 'job-abc' });
  });

  it('issues a different value every time for the same job', async () => {
    // Otherwise the state for a job is a constant, and a constant that
    // authorises something is a password that never changes.
    const { signState } = await loadLogin();
    expect(signState('job-abc')).not.toBe(signState('job-abc'));
  });

  it('rejects a state whose job id was swapped', async () => {
    const { signState, verifyState } = await loadLogin();
    const real = signState('job-mine');

    const [payload, mac] = real.split('.');
    const decoded = Buffer.from(payload!, 'base64url').toString();
    const forged =
      Buffer.from(decoded.replace('job-mine', 'job-theirs')).toString('base64url') + '.' + mac;

    // This is the attack the signature exists for: keep the signature, change
    // the job, receive somebody else's notifications.
    expect(verifyState(forged)).toBeNull();
  });

  it('rejects a state signed with a different secret', async () => {
    const { signState } = await loadLogin();
    const foreign = signState('job-abc');

    process.env.LINE_LOGIN_CHANNEL_SECRET = 'a-completely-different-secret';
    const { verifyState } = await loadLogin();

    expect(verifyState(foreign)).toBeNull();
  });

  it('rejects a state that is too old to be from this booking', async () => {
    const { signState, verifyState } = await loadLogin();
    const issued = 1_000_000_000;
    const state = signState('job-abc', issued);

    expect(verifyState(state, issued + 14 * 60 * 1000)).toEqual({ jobId: 'job-abc' });
    expect(verifyState(state, issued + 16 * 60 * 1000)).toBeNull();
  });

  it('rejects malformed input rather than throwing at it', async () => {
    const { verifyState } = await loadLogin();
    for (const junk of ['', '.', 'nodot', 'a.b.c', '!!!.???']) {
      expect(verifyState(junk)).toBeNull();
    }
  });
});

describe('where the customer is sent', () => {
  it('asks for the add-friend prompt, not just the identity', async () => {
    const { authorizeUrl, signState } = await loadLogin();
    const url = new URL(authorizeUrl(signState('job-abc')));

    // Knowing who somebody is does not let us message them — LINE refuses to
    // push to a non-follower. Without this parameter the flow would collect
    // userIds that can never be sent anything.
    expect(url.searchParams.get('bot_prompt')).toBe('aggressive');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('2011173517');
  });

  it('sends a redirect_uri that matches what is registered', async () => {
    const { authorizeUrl, signState, callbackUrl } = await loadLogin();
    const url = new URL(authorizeUrl(signState('job-abc')));

    // LINE compares this string exactly. A trailing slash or the wrong host
    // fails at the console's end with an error the customer sees.
    expect(url.searchParams.get('redirect_uri')).toBe(callbackUrl());
    expect(callbackUrl()).toBe('https://nbcserv.vercel.app/api/line/callback');
  });
});

describe('exchanging the code', () => {
  it('never puts the channel secret in a URL', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body });
      if (String(input).includes('/oauth2/v2.1/token')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'at', friendship_status_changed: true }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ userId: `U${'1'.repeat(32)}`, displayName: 'คุณทดสอบ' }), {
          status: 200,
        }),
      );
    });

    const { exchangeCode } = await loadLogin();
    const profile = await exchangeCode('one-time-code');

    expect(profile.userId).toBe(`U${'1'.repeat(32)}`);
    expect(profile.friended).toBe(true);
    // A secret in a query string ends up in access logs and browser history.
    for (const c of calls) expect(c.url).not.toContain(SECRET);
    expect(String(calls[0]!.body)).toContain('client_secret=');
  });

  it('reports a rejected code instead of returning a blank identity', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{"error":"invalid_grant"}', { status: 400 })));

    const { exchangeCode, LineLoginError } = await loadLogin();
    // Returning something empty here would link a real job to an empty userId
    // and quietly guarantee the customer never hears from us.
    await expect(exchangeCode('replayed-code')).rejects.toThrow(LineLoginError);
  });
});
