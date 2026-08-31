'use client';

import { useEffect, useState } from 'react';

/**
 * What an employee sees after scanning the code on the wall.
 *
 * The phone's own camera opens this page — the QR encodes a link, so there is
 * no scanner to build and nothing to install. By the time this renders, the
 * token is already in the URL.
 *
 * Designed for one glance and one tap, standing in a doorway at seven in the
 * morning: one button, a result you can read at arm's length, and no choice
 * between "in" and "out" because the server works that out and a choice is
 * just something to get wrong.
 */

interface PunchResponse {
  kind: 'IN' | 'OUT';
  occurredAt: string;
  needsReview: boolean;
  noticeTh: string | null;
  duplicate: boolean;
}

type Phase =
  | { state: 'ready' }
  | { state: 'locating' }
  | { state: 'sending' }
  | { state: 'done'; result: PunchResponse }
  | { state: 'error'; message: string };

/**
 * Ask the phone where it is, and give up rather than hang.
 *
 * Never blocks the punch: the location is evidence, not a condition. The
 * wall-clock limit is separate from the browser's own timeout because that one
 * only starts counting once the permission prompt has been answered — an
 * employee who ignores the prompt would otherwise watch a spinner forever and
 * not get clocked in.
 */
function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  const asked = new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
  const gaveUp = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000));

  return Promise.race([asked, gaveUp]);
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export function ClockPunch({ token, employeeName }: { token: string; employeeName: string }) {
  const [phase, setPhase] = useState<Phase>({ state: 'ready' });
  const [clock, setClock] = useState<string>('');

  // A running clock, so the person can see the time they are about to record
  // rather than trusting that the page is live.
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function punch() {
    setPhase({ state: 'locating' });
    const position = await currentPosition();

    setPhase({ state: 'sending' });
    try {
      const res = await fetch('/api/hr/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          lat: position?.coords.latitude,
          lng: position?.coords.longitude,
          accuracyMetres: position?.coords.accuracy,
        }),
      });
      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          json && typeof json === 'object' && 'error' in json
            ? String((json as { error: unknown }).error)
            : `บันทึกเวลาไม่สำเร็จ (${res.status})`;
        setPhase({ state: 'error', message });
        return;
      }
      setPhase({ state: 'done', result: json as PunchResponse });
    } catch {
      // The request never left the phone. Nothing was recorded, so say so
      // plainly rather than leaving them unsure whether to scan again.
      setPhase({
        state: 'error',
        message: 'ส่งไม่สำเร็จ — ยังไม่ได้บันทึกเวลา ลองใหม่เมื่อมีสัญญาณ',
      });
    }
  }

  if (phase.state === 'done') {
    const { result } = phase;
    return (
      <div className="space-y-4 text-center">
        <div
          className={`card p-6 ${
            result.needsReview
              ? 'bg-[var(--color-brand-orange-50)] border-[var(--color-brand-orange)]/50'
              : 'bg-green-50 border-green-300'
          }`}
        >
          <p className="text-5xl mb-2">{result.needsReview ? '⚠️' : '✅'}</p>
          <p className="text-2xl font-semibold">
            {result.kind === 'IN' ? 'บันทึกเวลาเข้างานแล้ว' : 'บันทึกเวลาออกงานแล้ว'}
          </p>
          <p className="text-4xl font-bold mt-2 tabular-nums">{timeOfDay(result.occurredAt)}</p>
          <p className="text-sm text-[var(--color-muted)] mt-1">{employeeName}</p>
        </div>

        {/* A flag is never silent: the person who was flagged is the one who
            can explain it, and they can only do that if they know. */}
        {result.noticeTh && (
          <p className="text-sm text-[var(--color-brand-orange)] px-2">{result.noticeTh}</p>
        )}
        {result.duplicate && (
          <p className="text-sm text-[var(--color-muted)]">สแกนซ้ำ — ใช้รายการเดิมที่บันทึกไว้</p>
        )}

        <button
          type="button"
          onClick={() => setPhase({ state: 'ready' })}
          className="text-sm underline text-[var(--color-brand-blue-600)]"
        >
          บันทึกอีกครั้ง
        </button>
      </div>
    );
  }

  const busy = phase.state === 'locating' || phase.state === 'sending';

  return (
    <div className="space-y-5 text-center">
      <div>
        <p className="text-sm text-[var(--color-muted)]">{employeeName}</p>
        <p className="text-5xl font-bold tabular-nums mt-1">{clock || '--:--:--'}</p>
      </div>

      <button
        type="button"
        onClick={punch}
        disabled={busy}
        // Deliberately enormous. Pressed one-handed, often with gloves, in a
        // doorway, by someone who wants to be inside.
        className="w-full min-h-[120px] rounded-lg bg-[var(--color-brand-orange)] text-white text-2xl font-bold disabled:opacity-60"
      >
        {phase.state === 'locating'
          ? 'กำลังหาตำแหน่ง…'
          : phase.state === 'sending'
            ? 'กำลังบันทึก…'
            : 'บันทึกเวลา'}
      </button>

      <p className="text-[13px] text-[var(--color-muted)] px-2">
        ระบบจะรู้เองว่าเป็นการเข้าหรือออกงาน · ถ้าโทรศัพท์หาตำแหน่งไม่เจอ
        ยังบันทึกเวลาให้ แต่จะส่งให้หัวหน้าตรวจสอบ
      </p>

      {phase.state === 'error' && (
        <div className="card p-3 bg-[var(--color-brand-orange-50)] border-[var(--color-status-cancelled)]/50">
          <p className="text-sm text-[var(--color-status-cancelled)]">{phase.message}</p>
        </div>
      )}
    </div>
  );
}
