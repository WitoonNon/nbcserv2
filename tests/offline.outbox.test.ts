import { describe, it, expect, beforeEach } from 'vitest';
import {
  Outbox,
  outcomeFromResponse,
  type OutboxItem,
  type OutboxStore,
  type SendOutcome,
} from '../src/lib/offline/outbox';

/**
 * The offline queue's sequencing and retry rules.
 *
 * Tested against an in-memory store rather than IndexedDB on purpose: the bugs
 * that would actually hurt a technician are about ORDER and about what happens
 * when a send fails, not about the storage engine. Those are the rules that
 * decide whether a day's work survives a lost signal.
 */

/** Same contract as the IndexedDB store, oldest first. */
function memoryStore(): OutboxStore & { rows: OutboxItem[] } {
  const rows: OutboxItem[] = [];
  return {
    rows,
    async add(item) {
      rows.push(item);
    },
    async all() {
      return [...rows].sort((a, b) => a.createdAt - b.createdAt);
    },
    async put(item) {
      const index = rows.findIndex((r) => r.id === item.id);
      if (index >= 0) rows[index] = item;
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}

let store: ReturnType<typeof memoryStore>;
let sent: string[];

beforeEach(() => {
  store = memoryStore();
  sent = [];
});

/** A sender that succeeds, recording what it was given. */
const succeeds = async (item: OutboxItem): Promise<SendOutcome> => {
  sent.push(String(item.body.label));
  return { status: 'sent' };
};

const offline = async (): Promise<SendOutcome> => ({ status: 'offline', reason: 'ไม่มีสัญญาณ' });

describe('sending what is queued', () => {
  it('sends in the order things happened', async () => {
    const box = new Outbox(store, { 'job-status': succeeds, 'media-upload': succeeds });

    await box.enqueue('media-upload', { label: 'photo' });
    await box.enqueue('job-status', { label: 'on-site' });
    await box.enqueue('job-status', { label: 'completed' });

    const result = await box.flush();

    // A photo must land before the form that names it, and statuses must land
    // in the order the technician pressed them.
    expect(sent).toEqual(['photo', 'on-site', 'completed']);
    expect(result.sent).toBe(3);
    expect(await box.pending()).toBe(0);
  });

  it('keeps everything when there is still no signal', async () => {
    const box = new Outbox(store, { 'job-status': offline, 'media-upload': offline });

    await box.enqueue('job-status', { label: 'en-route' });
    const result = await box.flush();

    // Losing this would lose the record of a visit.
    expect(result.sent).toBe(0);
    expect(result.stoppedOffline).toBe(true);
    expect(await box.pending()).toBe(1);
  });

  it('stops at the first failure instead of letting later writes overtake it', async () => {
    let call = 0;
    const secondFails = async (item: OutboxItem): Promise<SendOutcome> => {
      call += 1;
      if (call === 2) return { status: 'offline', reason: 'สัญญาณหลุด' };
      sent.push(String(item.body.label));
      return { status: 'sent' };
    };
    const box = new Outbox(store, { 'job-status': secondFails, 'media-upload': secondFails });

    await box.enqueue('media-upload', { label: 'photo' });
    await box.enqueue('media-upload', { label: 'photo-2' });
    await box.enqueue('job-status', { label: 'completed' });

    const result = await box.flush();

    // 'completed' must NOT have been sent: it would arrive before the photo
    // the work order refers to.
    expect(sent).toEqual(['photo']);
    expect(result.sent).toBe(1);
    expect(await box.pending()).toBe(2);
  });

  it('records the error and the attempt count on what is left', async () => {
    const box = new Outbox(store, { 'job-status': offline, 'media-upload': offline });
    await box.enqueue('job-status', { label: 'en-route' });

    await box.flush();
    await box.flush();

    const [item] = await box.items();
    // Visible when a technician asks why something is still sitting there.
    expect(item!.attempts).toBe(2);
    expect(item!.lastError).toBe('ไม่มีสัญญาณ');
  });

  it('treats a sender that throws as a lost connection, not a refusal', async () => {
    const box = new Outbox(store, {
      'job-status': async () => {
        throw new Error('boom');
      },
      'media-upload': succeeds,
    });
    await box.enqueue('job-status', { label: 'en-route' });

    await box.flush();

    // "We do not know what happened" must not be read as "the server said no",
    // because the safe reading of an unknown is to keep the work.
    expect(await box.pending()).toBe(1);
  });
});

describe('when the server says no', () => {
  it('drops a refused item rather than retrying it forever', async () => {
    const refuses = async (): Promise<SendOutcome> => ({
      status: 'rejected',
      reason: 'งานนี้ไม่ได้จ่ายให้คุณ',
    });
    const box = new Outbox(store, { 'job-status': refuses, 'media-upload': succeeds });
    await box.enqueue('job-status', { label: 'en-route' });

    const result = await box.flush();

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toBe('งานนี้ไม่ได้จ่ายให้คุณ');
    expect(await box.pending()).toBe(0);
  });

  it('carries on with the rest of the queue after a refusal', async () => {
    let first = true;
    const sender = async (item: OutboxItem): Promise<SendOutcome> => {
      if (first) {
        first = false;
        return { status: 'rejected', reason: 'ปิดงานไปแล้ว' };
      }
      sent.push(String(item.body.label));
      return { status: 'sent' };
    };
    const box = new Outbox(store, { 'job-status': sender, 'media-upload': sender });

    await box.enqueue('job-status', { label: 'stale' });
    await box.enqueue('job-status', { label: 'good' });

    const result = await box.flush();

    // A refusal is settled, not a blockage — unlike a lost signal.
    expect(sent).toEqual(['good']);
    expect(result.sent).toBe(1);
    expect(result.rejected).toHaveLength(1);
  });
});

describe('reading an HTTP response', () => {
  const outcome = (status: number) => outcomeFromResponse(new Response('', { status }), 'why');

  it('retries what might be temporary', () => {
    // The server was reachable but could not answer — trying again is the
    // whole point of having a queue.
    expect(outcome(500).status).toBe('offline');
    expect(outcome(503).status).toBe('offline');
    expect(outcome(429).status).toBe('offline');
    expect(outcome(408).status).toBe('offline');
  });

  it('gives up on what the server decided', () => {
    // Repeating these gets the same answer every time.
    expect(outcome(400).status).toBe('rejected');
    expect(outcome(403).status).toBe('rejected');
    expect(outcome(409).status).toBe('rejected');
    expect(outcome(413).status).toBe('rejected');
  });

  it('counts success as sent', () => {
    expect(outcome(200).status).toBe('sent');
    expect(outcome(201).status).toBe('sent');
  });

  it('keeps work when the session expired rather than discarding it', () => {
    // A form signed on a rooftop and synced the next morning meets a dead
    // session. The technician can fix that by logging in; deleting their visit
    // for it would be throwing away the thing the queue exists to protect.
    expect(outcome(401).status).toBe('offline');
  });

  it('never reads a redirect as delivered', () => {
    // The bug this pins: /api/field/advance without a session was redirected
    // to /login, fetch followed it, and the login page's 200 was read as
    // "sent" — so a queued status change was deleted having never arrived.
    //
    // Built by hand rather than with `new Response`: the constructor rejects
    // both status 0 and the redirect codes, which is precisely why these
    // responses only ever arrive from fetch under redirect:'manual'.
    const opaque = { ok: false, status: 0, type: 'opaqueredirect' } as unknown as Response;
    const redirected = (status: number) =>
      ({ ok: false, status, type: 'basic' }) as unknown as Response;

    expect(outcomeFromResponse(opaque, 'why').status).toBe('offline');
    expect(outcomeFromResponse(redirected(302), 'why').status).toBe('offline');
    expect(outcomeFromResponse(redirected(307), 'why').status).toBe('offline');
  });
});

describe('queue identity', () => {
  it('gives two writes in the same millisecond different ids', async () => {
    const box = new Outbox(store, { 'job-status': succeeds, 'media-upload': succeeds });

    // A double tap must produce two rows, not one that overwrites the other.
    const items = await Promise.all([
      box.enqueue('job-status', { label: 'a' }),
      box.enqueue('job-status', { label: 'b' }),
    ]);

    expect(items[0]!.id).not.toBe(items[1]!.id);
    expect(await box.pending()).toBe(2);
  });
});
