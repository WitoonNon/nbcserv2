'use client';

import { useRef, useState } from 'react';
import type { PhotoGroupField } from '@/lib/forms/types';
import { readExif } from '@/lib/media/exif';
import { workOrderMediaKey } from '@/lib/media/key';
import { submitOrQueue } from '@/lib/offline/client';

/**
 * Field photographs for one photoGroup.
 *
 * The payload this writes is an array of storage keys — the shape the
 * validator has always expected — so neither the validator nor the work-order
 * service changes because of this component.
 *
 * Two constraints shaped it, both from how the work actually happens:
 *
 * 1. Technicians are on mobile data on a rooftop. A modern phone camera
 *    produces 4–8 MB per shot and a form wants several, so every image is
 *    re-encoded in the browser to at most 1600px before a byte is uploaded.
 *    That is usually a 10–20x reduction.
 *
 * 2. Uploads are one at a time and each is committed on its own. A dropped
 *    connection halfway through five photos must leave the first ones
 *    attached, not roll the whole batch back.
 */

/** Enough detail to see a cracked fin or read a nameplate; small enough to send. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.78;

/** Preview size — a grid of these should cost less than one full photo. */
const THUMB_EDGE_PX = 320;
const THUMB_QUALITY = 0.7;

/** Draw a bitmap at a bounded size and encode it. */
function encodeAt(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('ย่อรูปไม่สำเร็จ'))),
      'image/jpeg',
      quality,
    );
  });
}

interface Prepared {
  full: Blob;
  thumb: Blob;
  exif: ReturnType<typeof readExif>;
}

/**
 * Read the metadata, then re-encode at two sizes from a single decode.
 *
 * Order matters: `readExif` runs against the untouched bytes, because the
 * canvas re-encode below destroys EXIF. Capture time and GPS are the answer to
 * "was the technician actually there, and when?", so they are read out before
 * they are lost rather than written off.
 *
 * `imageOrientation: 'from-image'` is equally essential: phones record
 * orientation in EXIF rather than rotating the pixels, and a canvas that
 * ignores it uploads every portrait photo lying on its side.
 */
async function prepare(file: File): Promise<Prepared> {
  const original = await file.arrayBuffer();
  const exif = readExif(original);

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    // Decoding a multi-megapixel photo is the expensive part; both sizes come
    // off the one bitmap.
    const full = await encodeAt(bitmap, MAX_EDGE_PX, JPEG_QUALITY);
    const thumb = await encodeAt(bitmap, THUMB_EDGE_PX, THUMB_QUALITY);
    return { full, thumb, exif };
  } finally {
    bitmap.close();
  }
}

export function PhotoGroupInput({
  field,
  workOrderId,
  value,
  onChange,
  readOnly,
  error,
}: {
  field: PhotoGroupField;
  workOrderId: string;
  value: string[];
  onChange: (keys: string[]) => void;
  readOnly: boolean;
  error?: string;
}) {
  const [busy, setBusy] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = field.maxCount !== undefined && value.length >= field.maxCount;

  async function upload(files: FileList) {
    setFailure(null);

    // Read the accepted files up front: `value` inside this closure is the
    // array as it was when the picker opened, so appending per file would
    // drop everything but the last one.
    const room = field.maxCount === undefined ? files.length : field.maxCount - value.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length === 0) return;

    const keys = [...value];
    setBusy(chosen.length);

    for (const file of chosen) {
      try {
        const { full, thumb, exif } = await prepare(file);

        // The client names the file. That is what lets the payload reference a
        // photo taken with no signal: the key is the same whether the upload
        // goes through now or when the van reaches the main road, so nothing
        // has to be rewritten later — and rewriting it later would break every
        // signature hash taken over this payload.
        const mediaId = crypto.randomUUID();
        const capturedAt = new Date();

        const result = await submitOrQueue('media-upload', {
          file: full,
          thumb,
          mediaId,
          capturedAt: capturedAt.toISOString(),
          workOrderId,
          kind: field.attachmentKind,
          takenAt: exif.takenAt ?? null,
          lat: exif.lat ?? null,
          lng: exif.lng ?? null,
        });
        if (result.error) throw new Error(result.error);

        keys.push(
          workOrderMediaKey({
            workOrderId,
            kind: field.attachmentKind,
            mediaId,
            // prepare() always re-encodes to JPEG, whatever came out of the camera.
            extension: 'jpg',
            at: capturedAt,
          }),
        );
        // Publish after each success so a failure on photo four keeps the
        // three that already made it.
        onChange([...keys]);
        if (result.queued) setPendingUpload(true);
      } catch (e) {
        setFailure(e instanceof Error ? e.message : String(e));
        break;
      } finally {
        setBusy((n) => n - 1);
      }
    }

    // Let the same file be picked again after a failed attempt.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {value.map((key) => (
          <figure key={key} className="relative size-20 rounded overflow-hidden border border-[var(--color-line)]">
            {/* Not next/image: these are private files behind a session check,
                so they must not go through the image optimiser's cache. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              // The preview, not the full image: a form can carry a dozen of
              // these and the grid renders them at 80px either way.
              src={`/api/media/${key}?thumb=1`}
              alt="รูปหน้างาน"
              loading="lazy"
              className="size-full object-cover"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(value.filter((k) => k !== key))}
                aria-label="เอารูปนี้ออก"
                className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 text-white text-xs leading-none grid place-items-center"
              >
                ×
              </button>
            )}
          </figure>
        ))}

        {busy > 0 &&
          Array.from({ length: busy }, (_, i) => (
            <div
              key={`pending-${i}`}
              className="size-20 border-2 border-dashed border-[var(--color-brand-blue)] rounded grid place-items-center text-[10px] text-[var(--color-brand-blue-600)] animate-pulse"
            >
              กำลังส่ง…
            </div>
          ))}

        {!readOnly && !atLimit && (
          <label className="size-20 border-2 border-dashed border-[var(--color-line)] rounded grid place-items-center text-[var(--color-muted)] text-2xl cursor-pointer hover:border-[var(--color-brand-orange)] hover:text-[var(--color-brand-orange)]">
            +
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              // Opens the camera directly on a phone, the file picker on a desktop.
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
              }}
            />
            <span className="sr-only">เพิ่มรูป {field.labelTh}</span>
          </label>
        )}
      </div>

      <p className="text-[11px] text-[var(--color-muted)] mt-1">
        {value.length > 0 && `${value.length} รูป`}
        {value.length > 0 && field.minCount ? ' · ' : ''}
        {field.minCount ? `ต้องมีอย่างน้อย ${field.minCount} รูป` : ''}
        {field.maxCount ? ` · สูงสุด ${field.maxCount} รูป` : ''}
      </p>

      {pendingUpload && (
        <span className="block text-[11px] text-[var(--color-brand-blue-600)] mt-0.5">
          รูปเก็บไว้ในเครื่องแล้ว — จะอัปโหลดให้เองเมื่อมีสัญญาณ (รูปย่อจะยังไม่ขึ้นจนกว่าจะส่งสำเร็จ)
        </span>
      )}
      {failure && (
        <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-0.5">{failure}</span>
      )}
      {error && (
        <span className="block text-[11px] text-[var(--color-status-cancelled)] mt-0.5">{error}</span>
      )}
    </div>
  );
}
