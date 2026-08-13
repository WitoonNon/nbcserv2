'use client';

import { Outbox, outcomeFromResponse, type OutboxItem, type SendOutcome } from './outbox';
import { indexedDbStore } from './indexeddb-store';

/**
 * The application's one outbox, plus how each kind of queued write is sent.
 *
 * Everything goes through here whether there is a signal or not — the queue is
 * not a fallback path that only runs when something breaks, because a path
 * that only runs when something breaks is a path nobody has tested. Online, an
 * item is enqueued and flushed in the same breath.
 */

async function post(url: string, body: FormData | URLSearchParams): Promise<SendOutcome> {
  let res: Response;
  try {
    // `manual` so a redirect is never followed. Followed, an expired session
    // sends the queued write to the login page, whose 200 reads as delivered —
    // and the item is dropped having never reached the server. Refusing to
    // follow turns that into a retryable outcome instead.
    res = await fetch(url, { method: 'POST', body, redirect: 'manual' });
  } catch (e) {
    // fetch only rejects when the request never happened: no signal, DNS
    // failure, connection dropped. That is the retryable case.
    return { status: 'offline', reason: e instanceof Error ? e.message : 'ไม่มีสัญญาณ' };
  }

  let reason = `ส่งไม่สำเร็จ (${res.status})`;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        reason = String((parsed as { error: unknown }).error);
      }
    } catch {
      // Not JSON — keep the status-code message.
    }
  }
  return outcomeFromResponse(res, reason);
}

/** Rebuild a FormData from what was stored, including any Blob. */
function toFormData(body: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    if (value instanceof Blob) {
      form.append(key, value, key === 'thumb' ? 'thumb.jpg' : 'upload.jpg');
    } else {
      form.append(key, String(value));
    }
  }
  return form;
}

/**
 * Only the writes a technician makes in the field are queued so far: status
 * changes and photographs. Draft saves and signatures still go straight to
 * their server actions and need a signal — see the roadmap.
 */
const senders = {
  'media-upload': (item: OutboxItem) => post('/api/media/upload', toFormData(item.body)),
  'job-status': (item: OutboxItem) => post('/api/field/advance', toFormData(item.body)),
};

export const outbox = new Outbox(indexedDbStore, senders);

/** Listeners for the pending count, so the UI can show what is still waiting. */
type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

export function onPendingChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Work the server refused for good.
 *
 * Kept in memory and announced rather than only logged: a refusal deletes the
 * item, so if nobody tells the technician, a photograph they took simply is
 * not there and they find out — if ever — from the office. A console warning
 * on a phone is nobody.
 */
export interface DroppedWrite {
  kind: string;
  reason: string;
  at: number;
}

const dropped: DroppedWrite[] = [];
type DropListener = (items: DroppedWrite[]) => void;
const dropListeners = new Set<DropListener>();

export function onDropped(listener: DropListener): () => void {
  dropListeners.add(listener);
  return () => dropListeners.delete(listener);
}

export function droppedWrites(): DroppedWrite[] {
  return [...dropped];
}

/** Called once the technician has read them. */
export function clearDropped(): void {
  dropped.length = 0;
  for (const listener of dropListeners) listener([]);
}

async function announce(): Promise<void> {
  const pending = await outbox.pending().catch(() => 0);
  for (const listener of listeners) listener(pending);
}

let flushing = false;

/**
 * Send whatever is waiting.
 *
 * Guarded against overlapping runs: `online` firing while a flush is already
 * going would otherwise send the same item twice.
 */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const result = await outbox.flush();
    if (result.rejected.length > 0) {
      // Refusals are not retried, so this is the only chance to say so.
      for (const { item, reason } of result.rejected) {
        dropped.push({ kind: item.kind, reason, at: Date.now() });
      }
      for (const listener of dropListeners) listener([...dropped]);
    }
  } finally {
    flushing = false;
    await announce();
  }
}

/**
 * Queue a write, then try to send immediately.
 *
 * Returns what happened to THIS item, so a screen can tell the difference
 * between "saved" and "saved, waiting for signal" — the technician needs to
 * know which, and guessing from `navigator.onLine` is not good enough: a phone
 * with one bar reports itself online while nothing gets through.
 */
export async function submitOrQueue(
  kind: keyof typeof senders,
  body: Record<string, unknown>,
): Promise<{ queued: boolean; error?: string }> {
  const item = await outbox.enqueue(kind, body);
  await announce();

  const result = await outbox.flush();
  const stillQueued = (await outbox.items()).some((q) => q.id === item.id);
  const refused = result.rejected.find((r) => r.item.id === item.id);

  await announce();

  if (refused) return { queued: false, error: refused.reason };
  return { queued: stillQueued };
}

/** Flush on reconnect and when a screen using the queue mounts. */
export function startOutboxSync(): () => void {
  const onOnline = () => void flushOutbox();
  window.addEventListener('online', onOnline);
  void flushOutbox();

  return () => window.removeEventListener('online', onOnline);
}
