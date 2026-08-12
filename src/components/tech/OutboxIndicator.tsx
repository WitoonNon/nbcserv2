'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flushOutbox, onPendingChange, outbox, startOutboxSync } from '@/lib/offline/client';

/**
 * How much work is still sitting on the phone.
 *
 * A technician who has pressed "ถึงหน้างาน" with no signal needs to know the
 * difference between "saved" and "saved, not sent yet" — and needs to be able
 * to see, at the end of the day, that nothing is still stuck on the device.
 * Silence would be read as success.
 */
export function OutboxIndicator() {
  const [pending, setPending] = useState<number | null>(null);
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

    void outbox
      .pending()
      .then(setPending)
      .catch(() => setPending(null));

    return () => {
      stop();
      unsubscribe();
    };
  }, [router]);

  // Nothing waiting is the normal state and does not deserve furniture.
  if (pending === null || pending === 0) return null;

  return (
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
  );
}
