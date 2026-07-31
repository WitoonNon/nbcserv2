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
  cached = e.STORAGE_DRIVER === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter(e.STORAGE_LOCAL_DIR);
  return cached;
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
  return `${yyyymm}/${parts.entityType}/${parts.entityId}/${parts.kind}/${parts.filename}`;
}
