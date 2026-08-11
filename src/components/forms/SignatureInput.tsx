'use client';

import { useEffect, useRef, useState } from 'react';
import type { SignatureField } from '@/lib/forms/types';

/**
 * Signature capture.
 *
 * The payload this writes is a single storage key — the shape the validator
 * has always expected — but writing it is not what makes a signature count.
 * The Signature row, with its hash of the form at the moment of signing, is
 * what turns a picture into evidence, and that is recorded by the `onSign`
 * callback the work-order editor supplies.
 *
 * Drawn with pointer events, which cover finger, stylus and mouse in one path.
 * A technician holds out a phone and the customer signs on it; the same
 * component has to work on a desktop when the office corrects a document.
 */

/** Fixed backing-store size, so a signature looks the same wherever it renders. */
const CANVAS_W = 600;
const CANVAS_H = 200;

export function SignatureInput({
  field,
  workOrderId,
  value,
  onChange,
  onSign,
  siblings,
  readOnly,
  error,
  signedAt,
  signerName,
  stale,
}: {
  field: SignatureField;
  workOrderId: string;
  /** Storage key of the signature already on file, if any. */
  value: string | undefined;
  onChange: (key: string | undefined) => void;
  /** Persist the signature and bind it to the current form content. */
  onSign?: (input: {
    storageKey: string;
    signerRole: SignatureField['signerRole'];
    signerName: string;
    signerPosition: string;
  }) => Promise<{ error?: string } | void>;
  /** The other fields in this signature's section — where the name lives. */
  siblings: Record<string, unknown>;
  readOnly: boolean;
  error?: string;
  signedAt?: string;
  signerName?: string;
  /** The form changed after this was signed. */
  stale?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * The name comes from the sibling field by naming convention:
   * `inspectorSignature` is signed by `inspectorName`. The templates already
   * pair them that way, and it saves asking the customer to write their name
   * twice on one form.
   */
  const nameKey = field.key.replace(/Signature$/, 'Name');
  const positionKey = field.key.replace(/Signature$/, 'Position');
  const typedName = String(siblings[nameKey] ?? '').trim();
  const typedPosition = String(siblings[positionKey] ?? '').trim();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#132945';
  }, []);

  /** Screen coordinates -> backing-store coordinates. */
  function positionOf(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || busy) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture, so a stroke that leaves the box mid-signature is not cut off.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = positionOf(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setFailure(null);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = positionOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    setFailure(null);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;

    if (!typedName) {
      // Names the box on screen, not the field key behind it — "inspector"
      // means nothing to the person holding the phone.
      setFailure('กรอกช่อง "ชื่อ" ด้านบนก่อน — ลายเซ็นที่ไม่มีชื่อใช้เป็นหลักฐานไม่ได้');
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      // PNG, not JPEG: ink on a transparent background composites onto the
      // printed form, and JPEG artefacts around thin strokes look like a
      // photocopy of a photocopy.
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('บันทึกลายเซ็นไม่สำเร็จ'))), 'image/png');
      });

      const body = new FormData();
      body.append('file', new File([blob], 'signature.png', { type: 'image/png' }));
      body.append('workOrderId', workOrderId);
      body.append('kind', 'SIGNATURE');

      const res = await fetch('/api/media/upload', { method: 'POST', body });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json && typeof json === 'object' && 'error' in json
            ? String((json as { error: unknown }).error)
            : `บันทึกลายเซ็นไม่สำเร็จ (${res.status})`;
        throw new Error(message);
      }

      const storageKey = (json as { key: string }).key;
      onChange(storageKey);

      // The hash has to be taken over the form INCLUDING this key, so the
      // editor is told only after the payload has it.
      const result = await onSign?.({
        storageKey,
        signerRole: field.signerRole,
        signerName: typedName,
        signerPosition: typedPosition,
      });
      if (result?.error) throw new Error(result.error);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // A signature already on file is shown as what it is: a completed act, with
  // who signed and when. Re-signing means deliberately discarding it.
  if (value) {
    return (
      <div>
        <div
          className={`border rounded bg-white p-2 ${
            stale
              ? 'border-[var(--color-status-cancelled)]'
              : 'border-[var(--color-line)]'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/media/${value}`} alt="ลายเซ็น" className="h-16 w-auto" />
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            {signerName ? `${signerName} · ` : ''}
            {signedAt ? `เซ็นเมื่อ ${new Date(signedAt).toLocaleString('th-TH')}` : 'บันทึกแล้ว'}
          </p>
        </div>

        {stale && (
          <p className="text-[11px] text-[var(--color-status-cancelled)] mt-1">
            ฟอร์มถูกแก้หลังจากเซ็น — ลายเซ็นนี้ไม่ครอบคลุมข้อมูลปัจจุบันแล้ว ต้องให้เซ็นใหม่
          </p>
        )}

        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              clear();
            }}
            className="text-[11px] text-[var(--color-brand-blue-600)] mt-1 underline"
          >
            เซ็นใหม่
          </button>
        )}
        {error && (
          <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-0.5">{error}</span>
        )}
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="h-20 border border-dashed border-[var(--color-line)] rounded bg-white grid place-items-center text-[var(--color-muted)] text-xs">
        ยังไม่ได้เซ็น
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        // Without this the browser scrolls the page instead of drawing.
        style={{ touchAction: 'none' }}
        className="w-full h-24 border border-dashed border-[var(--color-line)] rounded bg-white cursor-crosshair"
      />
      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={save}
          disabled={!hasInk || busy}
          className="bg-[var(--color-brand-orange)] text-white rounded-[3px] px-3 py-1 text-xs font-semibold disabled:opacity-40"
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึกลายเซ็น'}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || busy}
          className="text-[11px] text-[var(--color-brand-blue-600)] underline disabled:opacity-40"
        >
          ล้าง
        </button>
        <span className="text-[11px] text-[var(--color-muted)]">
          {hasInk ? 'เซ็นแล้ว กดบันทึก' : 'เซ็นในกรอบด้วยนิ้วหรือเมาส์'}
        </span>
      </div>

      {failure && (
        <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-0.5">{failure}</span>
      )}
      {error && (
        <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-0.5">{error}</span>
      )}
    </div>
  );
}
