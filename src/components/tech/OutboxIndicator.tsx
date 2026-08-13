'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearDropped,
  droppedWrites,
  flushOutbox,
  onDropped,
  onPendingChange,
  outbox,
  startOutboxSync,
  type DroppedWrite,
} from '@/lib/offline/client';

/**
 * How much work is still sitting on the phone.
 *
 * A technician who has pressed "ถึงหน้างาน" with no signal needs to know the
 * difference between "saved" and "saved, not sent yet" — and needs to be able
 * to see, at the end of the day, that nothing is still stuck on the device.
 * Silence would be read as success.
 */
const KIND_LABEL: Record<string, string> = {
  'job-status': 'การเปลี่ยนสถานะงาน',
  'media-upload': 'รูปถ่ายหน้างาน',
};

export function OutboxIndicator() {
  const [pending, setPending] = useState<number | null>(null);
  const [lost, setLost] = useState<DroppedWrite[]>(droppedWrites());
  const router = useRouter();

  useEffect(() => {
    // Flushes now, and again whenever the connection comes back.
    const stop = startOutboxSync();
    const unsubscribe = onPendingChange((count) => {
      setPending(count);
      // Something landed — the queue drained, so the server now disagrees with
      // what is on screen.
      if (count === 0) router.refresh();
    });
    const unsubscribeDropped = onDropped(setLost);

    void outbox
      .pending()
      .then(setPending)
      .catch(() => setPending(null));

    return () => {
      stop();
      unsubscribe();
      unsubscribeDropped();
    };
  }, [router]);

  const waiting = pending !== null && pending > 0;
  // Nothing waiting and nothing lost is the normal state, and does not deserve
  // furniture on a phone screen.
  if (!waiting && lost.length === 0) return null;

  return (
    <div className="space-y-2">
      {waiting && (
        <button
          type="button"
          onClick={() => void flushOutbox()}
          className="w-full text-left card p-3 bg-[var(--color-brand-sky-50)] border-[var(--color-brand-blue)]/40"
        >
          <p className="text-sm font-semibold text-[var(--color-brand-blue-600)]">
            มี {pending} รายการรอส่ง
          </p>
          <p className="text-[11px] text-[var(--color-muted)]">
            บันทึกไว้ในเครื่องแล้ว ระบบจะส่งให้เองเมื่อมีสัญญาณ · แตะเพื่อลองส่งเดี๋ยวนี้
          </p>
        </button>
      )}

      {/* A refusal removed the item, so this is the only place the technician
          will ever hear about it. Silence here means work quietly vanishing. */}
      {lost.length > 0 && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-status-cancelled)]/50">
          <p className="text-sm font-semibold text-[var(--color-status-cancelled)]">
            มี {lost.length} รายการส่งไม่สำเร็จ ต้องทำใหม่
          </p>
          <ul className="text-[11px] text-[var(--color-ink)] mt-1 space-y-0.5">
            {lost.map((d, i) => (
              <li key={i}>
                {KIND_LABEL[d.kind] ?? d.kind} — {d.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              clearDropped();
              setLost([]);
            }}
            className="mt-2 text-[11px] underline underline-offset-2 text-[var(--color-muted)]"
          >
            รับทราบแล้ว
          </button>
        </div>
      )}
    </div>
  );
}
