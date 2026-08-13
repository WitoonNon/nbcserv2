/**
 * Writes made without a signal, kept until they land.
 *
 * A technician in a basement plant room presses "ถึงหน้างาน" and the request
 * fails. Losing that is losing the record of a visit, so it goes in a queue
 * instead and is sent when the signal comes back.
 *
 * Two properties the rest of the app depends on:
 *
 * 1. **FIFO, and strictly.** A photo upload must land before the draft that
 *    names it, and a status change must land in the order the technician made
 *    them. One failure stops the flush rather than letting later items
 *    overtake it.
 *
 * 2. **Nothing is dropped on failure.** An item that fails stays queued with
 *    its error recorded. The only thing that removes an item is the server
 *    accepting it — or a permanent refusal, which is a different thing from
 *    a lost connection and is treated as one.
 */

export type OutboxKind = 'job-status' | 'media-upload';

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  /** Whatever the sender for this kind needs. Blobs survive IndexedDB. */
  body: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

/** The storage the queue sits on. IndexedDB in the browser; a map in tests. */
export interface OutboxStore {
  add(item: OutboxItem): Promise<void>;
  /** Oldest first — the order things happened in. */
  all(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export type SendOutcome =
  | { status: 'sent' }
  /** The server understood and refused. Retrying will never help. */
  | { status: 'rejected'; reason: string }
  /** No signal, or the server is down. Keep it and try later. */
  | { status: 'offline'; reason: string };

export type Sender = (item: OutboxItem) => Promise<SendOutcome>;

export interface FlushResult {
  sent: number;
  /** Refused for good — removed from the queue, reported to the technician. */
  rejected: { item: OutboxItem; reason: string }[];
  remaining: number;
  /** True when the flush stopped early because the connection went away. */
  stoppedOffline: boolean;
}

export class Outbox {
  constructor(
    private readonly store: OutboxStore,
    private readonly senders: Record<OutboxKind, Sender>,
  ) {}

  async enqueue(kind: OutboxKind, body: Record<string, unknown>): Promise<OutboxItem> {
    const item: OutboxItem = {
      // Not a timestamp: two taps in the same millisecond must not collide.
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      body,
      createdAt: Date.now(),
      attempts: 0,
    };
    await this.store.add(item);
    return item;
  }

  async pending(): Promise<number> {
    return (await this.store.all()).length;
  }

  async items(): Promise<OutboxItem[]> {
    return this.store.all();
  }

  /**
   * Send everything, oldest first, stopping at the first sign the connection
   * has gone again.
   *
   * Stopping matters: pushing on would deliver later writes before earlier
   * ones, and a draft that arrives before the photo it references points at a
   * file the server has never seen.
   */
  async flush(): Promise<FlushResult> {
    const queue = await this.store.all();
    const result: FlushResult = {
      sent: 0,
      rejected: [],
      remaining: queue.length,
      stoppedOffline: false,
    };

    for (const item of queue) {
      let outcome: SendOutcome;
      try {
        outcome = await this.senders[item.kind](item);
      } catch (e) {
        // A sender that throws is treated as a lost connection rather than a
        // refusal: the safe reading of "we do not know what happened" is to
        // keep the work.
        outcome = { status: 'offline', reason: e instanceof Error ? e.message : String(e) };
      }

      if (outcome.status === 'sent') {
        await this.store.remove(item.id);
        result.sent += 1;
        result.remaining -= 1;
        continue;
      }

      if (outcome.status === 'rejected') {
        // The server understood and said no — a job already closed by the
        // office, a form already approved. Keeping it would retry forever.
        await this.store.remove(item.id);
        result.rejected.push({ item, reason: outcome.reason });
        result.remaining -= 1;
        continue;
      }

      await this.store.put({
        ...item,
        attempts: item.attempts + 1,
        lastError: outcome.reason,
      });
      result.stoppedOffline = true;
      break;
    }

    return result;
  }
}

/**
 * Did this failure mean "no signal" or "no"?
 *
 * fetch() rejects for a dead connection and resolves for an HTTP error, so the
 * distinction is: a thrown fetch, or a 5xx/408/429, is worth retrying. Anything
 * else the server said deliberately, and repeating it will get the same answer.
 *
 * Three cases are deliberately NOT treated as a deliberate refusal:
 *
 * - **A redirect.** Senders use `redirect: 'manual'`, which surfaces as an
 *   opaque response with status 0. Following it instead would land on the
 *   login page, whose 200 reads as success — and the queued write would be
 *   deleted having never reached the server.
 * - **401.** The session expired while the work sat in the queue. That is the
 *   normal shape of "signed a form on a rooftop, synced tomorrow", and the
 *   item becomes sendable again the moment the technician logs back in.
 *   Discarding it would throw away a visit for a reason the technician can fix.
 * - **408/429/5xx**, as before.
 *
 * 403 stays permanent: the session is valid and the answer will not change.
 */
export function outcomeFromResponse(res: Response, reason: string): SendOutcome {
  if (res.ok) return { status: 'sent' };

  // `type` is 'opaqueredirect' under redirect:'manual'; status 0 also covers
  // an opaque response from any other cause, which we equally cannot read.
  if (res.status === 0 || res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    return { status: 'offline', reason: `${reason} — ถูกเปลี่ยนเส้นทาง (เซสชันอาจหมดอายุ)` };
  }
  if (res.status === 401) {
    return { status: 'offline', reason: 'เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วระบบจะส่งให้เอง' };
  }
  if (res.status >= 500 || res.status === 408 || res.status === 429) {
    return { status: 'offline', reason };
  }
  return { status: 'rejected', reason };
}
