'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FieldStep } from '@/modules/jobs/field-work.service';
import { submitOrQueue } from '@/lib/offline/client';

/**
 * The one button that moves a job forward.
 *
 * Deliberately a single next step rather than a menu: this is pressed
 * one-handed, often with gloves, sometimes in direct sunlight. The question on
 * screen is "what happens next", and there is exactly one answer.
 */

/**
 * Ask the phone where it is, briefly.
 *
 * Never blocks the transition. A plant room in a basement has no fix, and a
 * technician standing in one still has to be able to say they have arrived —
 * so a refusal, a timeout or a browser without geolocation all resolve to
 * "no coordinates" rather than an error.
 */
function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  const asked = new Promise<{ lat: number; lng: number } | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });

  // The option above only starts counting once permission has been decided.
  // A technician who ignores the browser's permission prompt would otherwise
  // leave the button spinning forever, unable to say they had arrived — so
  // there is a wall-clock limit on the whole thing, not just on the fix.
  const gaveUp = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));

  return Promise.race([asked, gaveUp]);
}

export function JobStepButton({
  jobId,
  step,
  warnNoWorkOrder,
}: {
  jobId: string;
  step: FieldStep;
  /** Closing with no paperwork handed in — said out loud, not blocked. */
  warnNoWorkOrder: boolean;
}) {
  const router = useRouter();
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function press() {
    setError(null);

    const body: Record<string, unknown> = {
      jobId,
      to: step.to,
      // The moment of the tap, not the moment the request arrives. With no
      // signal those are hours apart, and the first one is the true one.
      occurredAt: new Date().toISOString(),
    };

    if (step.capturesLocation) {
      setLocating(true);
      const here = await currentPosition();
      setLocating(false);
      if (here) {
        body.lat = here.lat;
        body.lng = here.lng;
      }
    }

    setPending(true);
    // Queued first, then sent. Even online it takes the queue's path, so the
    // path that matters offline is the one exercised on every single tap
    // rather than only when something has already gone wrong.
    const result = await submitOrQueue('job-status', body);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setQueued(result.queued);
    if (!result.queued) router.refresh();
  }

  const busy = pending || locating;

  return (
    <div>
      <button
        type="button"
        onClick={press}
        disabled={busy}
        // 56px, not the 48px minimum: this is the primary action of the screen
        // and it is pressed with a gloved thumb.
        className="w-full bg-[var(--color-brand-orange)] min-h-[56px] text-white text-base font-semibold disabled:opacity-60"
      >
        {locating ? 'กำลังหาตำแหน่ง…' : pending ? 'กำลังบันทึก…' : step.labelTh}
      </button>

      {warnNoWorkOrder && step.to === 'COMPLETED' && (
        <p className="text-[11px] text-[var(--color-brand-orange)] px-3 py-1.5 bg-[var(--color-brand-orange-50)]">
          ยังไม่ได้ส่งใบงาน — ปิดงานได้ แต่จะไม่มีบันทึกการเข้าหน้างานไว้ให้ออฟฟิศ
        </p>
      )}
      {queued && (
        <p className="text-[11px] text-[var(--color-brand-blue-600)] px-3 py-1.5 bg-[var(--color-brand-sky-50)]">
          บันทึกไว้ในเครื่องแล้ว — ยังไม่มีสัญญาณ ระบบจะส่งให้เองเมื่อกลับมาออนไลน์
        </p>
      )}
      {error && (
        <p className="text-[11px] text-[var(--color-status-cancelled)] px-3 py-1.5">{error}</p>
      )}
    </div>
  );
}
