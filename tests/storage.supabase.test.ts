import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Supabase Storage adapter, against a stubbed fetch.
 *
 * It cannot be run against the real service here: that needs a service-role
 * key and a bucket, and only the project owner can create either. What CAN be
 * checked without them is everything that is actually likely to be wrong —
 * request URLs, the auth headers, upsert on retry, how a signed-URL response
 * is turned back into an absolute URL, and what happens to a key containing a
 * character that must be percent-encoded.
 *
 * The point is that the first upload against real Supabase is not also the
 * first test of the wiring.
 */

const BASE_URL = 'https://example-ref.supabase.co';
const SERVICE_KEY = 'service-role-key-for-tests';
const BUCKET = 'work-orders';
const ROOT = `${BASE_URL}/storage/v1`;

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[];
let respond: (call: Call) => Response;

/** Load storage() fresh so it re-reads env and rebuilds its cached adapter. */
async function loadAdapter() {
  vi.resetModules();
  const { storage } = await import('../src/lib/storage');
  return storage();
}

beforeEach(() => {
  calls = [];
  process.env.STORAGE_DRIVER = 'supabase';
  process.env.SUPABASE_URL = BASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.SUPABASE_STORAGE_BUCKET = BUCKET;

  respond = () => new Response('{}', { status: 200 });

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
  delete process.env.STORAGE_DRIVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_STORAGE_BUCKET;
});

describe('choosing the adapter', () => {
  it('builds the Supabase adapter when the driver says so', async () => {
    expect((await loadAdapter()).name).toBe('supabase');
  });

  it('refuses to boot without the credentials it needs', async () => {
    // Failing here is the point: the alternative is discovering the missing
    // key when a technician on a rooftop taps +.
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    const { storage } = await import('../src/lib/storage');
    expect(() => storage()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('still defaults to the local driver', async () => {
    process.env.STORAGE_DRIVER = 'local';
    expect((await loadAdapter()).name).toBe('local');
  });
});

describe('uploading', () => {
  it('POSTs to the object endpoint with the service key', async () => {
    const adapter = await loadAdapter();
    const body = Buffer.from('photo-bytes');

    const result = await adapter.put('202608/WorkOrder/abc/BEFORE/x.jpg', body, 'image/jpeg');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${ROOT}/object/${BUCKET}/202608/WorkOrder/abc/BEFORE/x.jpg`);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(calls[0]!.headers['Content-Type']).toBe('image/jpeg');

    // Retrying a dropped upload must not 409 the technician out of the form.
    expect(calls[0]!.headers['x-upsert']).toBe('true');

    expect(result.bytes).toBe(body.byteLength);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the slashes in a key but encodes the segments', async () => {
    const adapter = await loadAdapter();

    await adapter.put('202608/WorkOrder/id/BEFORE/a b+c.jpg', Buffer.from('x'), 'image/jpeg');

    // Encoding the separators would flatten the layout into one filename.
    expect(calls[0]!.url).toContain('/202608/WorkOrder/id/BEFORE/');
    expect(calls[0]!.url).toContain('a%20b%2Bc.jpg');
  });

  it('reports what Supabase said when an upload fails', async () => {
    respond = () => new Response('{"error":"Bucket not found"}', { status: 404 });
    const adapter = await loadAdapter();

    // "404" alone sends someone reading the wrong logs; the message names the
    // one setup step that is easy to miss.
    await expect(
      adapter.put('k/e/y/f/x.jpg', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow(/Bucket not found/);
  });
});

describe('reading back', () => {
  it('signs a URL rather than exposing a public one', async () => {
    respond = () =>
      new Response(JSON.stringify({ signedURL: '/object/sign/work-orders/x.jpg?token=abc' }), {
        status: 200,
      });
    const adapter = await loadAdapter();

    const url = await adapter.url('202608/WorkOrder/abc/BEFORE/x.jpg');

    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${ROOT}/object/sign/${BUCKET}/202608/WorkOrder/abc/BEFORE/x.jpg`);
    // The TTL has to be sent, or the link never expires.
    expect(String(calls[0]!.body)).toContain('expiresIn');

    // Supabase answers with a path; it has to come back absolute or the
    // browser resolves it against our own host.
    expect(url).toBe(`${ROOT}/object/sign/work-orders/x.jpg?token=abc`);
    expect(url.startsWith('https://')).toBe(true);
  });

  it('does not double up the /storage/v1 prefix', async () => {
    // Older responses include the prefix, newer ones do not. Both have to
    // produce a URL that resolves.
    respond = () =>
      new Response(JSON.stringify({ signedURL: '/storage/v1/object/sign/work-orders/x.jpg?token=abc' }), {
        status: 200,
      });
    const adapter = await loadAdapter();

    const url = await adapter.url('x.jpg');

    expect(url).toBe(`${ROOT}/object/sign/work-orders/x.jpg?token=abc`);
    expect(url).not.toContain('/storage/v1/storage/v1');
  });

  it('downloads with the service key attached', async () => {
    respond = () => new Response(Buffer.from('photo-bytes'), { status: 200 });
    const adapter = await loadAdapter();

    const body = await adapter.get('202608/WorkOrder/abc/BEFORE/x.jpg');

    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.headers.apikey).toBe(SERVICE_KEY);
    expect(body.toString()).toBe('photo-bytes');
  });
});
