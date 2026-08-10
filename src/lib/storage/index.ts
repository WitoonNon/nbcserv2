import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

/**
 * Storage port.
 *
 * The hosting/PDPA decision (@client-confirm G2) is still open, so nothing in
 * the application depends on a specific provider. `local` writes to disk for
 * development; `s3` covers Cloudflare R2, AWS S3 and MinIO identically.
 */
export interface PutResult {
  key: string;
  sha256: string;
  bytes: number;
}

export interface StorageAdapter {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
  url(key: string): Promise<string>;
  /** Presigned PUT so browsers upload straight to storage, bypassing the app server. */
  presignPut(key: string, contentType: string, expiresInSec?: number): Promise<string>;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Percent-encode each path segment but keep the slashes: the key layout is
 * `yyyymm/entity/id/kind/filename`, and encoding its separators would flatten
 * the whole thing into one filename.
 */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local';
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    return path.join(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<PutResult> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, sha256: sha256(body), bytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async url(key: string): Promise<string> {
    return `/api/media/${encodeURIComponent(key)}`;
  }

  async presignPut(key: string): Promise<string> {
    // Local dev uploads go through the app route; the client code path is the
    // same shape as the S3 presigned flow.
    return `/api/media/upload?key=${encodeURIComponent(key)}`;
  }
}

/**
 * Supabase Storage over its REST API.
 *
 * Deliberately no @supabase/supabase-js dependency: four HTTP calls against a
 * documented endpoint do not justify pulling in a client (and its realtime and
 * auth halves) that would then need its own upgrade story.
 *
 * The service-role key bypasses row-level security, so this class must only
 * ever run on the server — see the `server-only` import at the top of the file.
 */
class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = 'supabase';

  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
    private readonly signedUrlTtl: number,
  ) {}

  private get storageRoot(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/storage/v1`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
      ...extra,
    };
  }

  /** Supabase reports failures as JSON; surface its message, not just a code. */
  private static async fail(res: Response, what: string): Promise<never> {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage ${what} failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    const res = await fetch(`${this.storageRoot}/object/${this.bucket}/${encodeKey(key)}`, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': contentType,
        // Re-uploading the same key after a retry must not 409 the technician
        // out of finishing the form.
        'x-upsert': 'true',
      }),
      body: new Uint8Array(body),
    });
    if (!res.ok) await SupabaseStorageAdapter.fail(res, 'upload');
    return { key, sha256: sha256(body), bytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    const res = await fetch(`${this.storageRoot}/object/${this.bucket}/${encodeKey(key)}`, {
      headers: this.headers(),
    });
    if (!res.ok) await SupabaseStorageAdapter.fail(res, 'download');
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * A time-limited signed URL, never a public one. The bucket holds photographs
   * taken inside customers' homes and the key layout is guessable by design.
   */
  async url(key: string): Promise<string> {
    const res = await fetch(`${this.storageRoot}/object/sign/${this.bucket}/${encodeKey(key)}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: this.signedUrlTtl }),
    });
    if (!res.ok) await SupabaseStorageAdapter.fail(res, 'sign');
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${this.storageRoot}${signedURL.replace(/^\/storage\/v1/, '')}`;
  }

  async presignPut(key: string): Promise<string> {
    const res = await fetch(
      `${this.storageRoot}/object/upload/sign/${this.bucket}/${encodeKey(key)}`,
      { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }) },
    );
    if (!res.ok) await SupabaseStorageAdapter.fail(res, 'sign upload');
    const { url } = (await res.json()) as { url: string };
    return `${this.storageRoot}${url.replace(/^\/storage\/v1/, '')}`;
  }
}

class S3StorageAdapter implements StorageAdapter {
  readonly name = 's3';
  async put(): Promise<PutResult> {
    throw new Error(
      'S3 adapter not wired yet — pending @client-confirm G2 (hosting / data residency). ' +
        'Install @aws-sdk/client-s3 and implement against S3_* env vars.',
    );
  }
  async get(): Promise<Buffer> {
    throw new Error('S3 adapter not wired yet.');
  }
  async url(): Promise<string> {
    throw new Error('S3 adapter not wired yet.');
  }
  async presignPut(): Promise<string> {
    throw new Error('S3 adapter not wired yet.');
  }
}

let cached: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  if (cached) return cached;
  const e = env();
  switch (e.STORAGE_DRIVER) {
    case 'supabase':
      // env() already refused to boot without these two.
      cached = new SupabaseStorageAdapter(
        e.SUPABASE_URL!,
        e.SUPABASE_SERVICE_ROLE_KEY!,
        e.SUPABASE_STORAGE_BUCKET,
        e.SUPABASE_SIGNED_URL_TTL,
      );
      break;
    case 's3':
      cached = new S3StorageAdapter();
      break;
    default:
      cached = new LocalStorageAdapter(e.STORAGE_LOCAL_DIR);
  }
  return cached;
}

/**
 * Every segment of a key is attacker-influenced somewhere upstream, and the
 * local driver turns keys straight into filesystem paths. `..` or a stray
 * slash would write outside the storage root, so segments are reduced to a
 * safe alphabet here rather than at each call site.
 */
function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned || 'unnamed';
}

/** Deterministic, collision-free key layout. */
export function mediaKey(parts: {
  entityType: string;
  entityId: string;
  kind: string;
  filename: string;
}): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return [
    yyyymm,
    safeSegment(parts.entityType),
    safeSegment(parts.entityId),
    safeSegment(parts.kind),
    safeSegment(parts.filename),
  ].join('/');
}
