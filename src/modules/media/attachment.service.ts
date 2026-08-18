import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { AttachmentKind } from '@/generated/prisma';
import { mediaKey, storage } from '@/lib/storage';
import {
  CAPTURE_DEFAULTS,
  getCapturePolicy,
  type CapturePolicy,
} from '@/modules/platform/capture-policy';

/**
 * Field photographs (Phase 2.2).
 *
 * A photo is evidence: it is what settles "the drain was already cracked when
 * we arrived". So the rules here are about what may be attached and when, not
 * about file handling.
 *
 * 1. Attachments belong to a work order that is still being filled in. Once a
 *    form is SUBMITTED the technician's account can no longer change what the
 *    supervisor is looking at, and an APPROVED form is frozen outright — the
 *    same rule the payload already follows.
 *
 * 2. Removing a photo from a form removes its key from the payload; the
 *    Attachment row and the stored object stay. Deleting the evidence of a
 *    visit because someone tapped the wrong thumbnail is not recoverable, and
 *    an orphaned object costs a few kilobytes.
 *
 * 3. The bucket is private. Bytes are only ever served through the route that
 *    checks the session, or as a short-lived signed URL.
 */

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

/**
 * The client downscales before uploading, so anything approaching this ceiling
 * did not come from our own form. It is a backstop against a hostile caller,
 * not a limit technicians should ever meet.
 */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** Extension by mime — the client's filename is never trusted to name the file. */
const ALLOWED_IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** A work order still being filled in accepts photographs freely. */
const ATTACHABLE_STATUSES = new Set(['DRAFT', 'RETURNED']);

/**
 * Handed in or approved. A photograph may still be added — the client asked
 * for the office to be able to supply one a technician forgot — but only
 * deliberately, with a reason, and marked as arriving after the fact.
 */
const LATE_ATTACHABLE_STATUSES = new Set(['SUBMITTED', 'APPROVED']);

/** Matches what StorageAdapter.put reports, so re-sends can be compared. */
function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * What the camera claimed about a photo, read on the client before the
 * downscale destroyed it.
 *
 * Client-supplied, therefore not proof — but it is the same metadata a
 * server-side reader would see, minus the 4–8 MB upload of the original that
 * the downscale exists to avoid.
 */
export interface ExifInput {
  takenAt?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface AttachResult {
  id: string;
  /** The storage key. This is what goes into the form payload. */
  key: string;
  /** Where the browser can fetch it back. */
  url: string;
  bytes: number;
  hasThumb: boolean;
}

/**
 * Sanity-check the metadata before it is stored.
 *
 * A coordinate outside the possible range or a capture time in the future is
 * a broken camera clock or a hostile caller, and either way it is worse than
 * no value at all: a wrong position in a dispute is evidence pointing the
 * wrong way.
 */
/**
 * @param policy what the office has agreed may be kept. Applied HERE, at the
 *   write, rather than by asking the phone not to send it — a client that
 *   keeps sending would otherwise still be stored.
 */
export function cleanExif(
  exif: ExifInput | null | undefined,
  policy: CapturePolicy = CAPTURE_DEFAULTS,
): {
  exifTakenAt: Date | null;
  lat: number | null;
  lng: number | null;
} {
  const lat =
    policy.recordLocation && typeof exif?.lat === 'number' && Math.abs(exif.lat) <= 90
      ? exif.lat
      : null;
  const lng =
    policy.recordLocation && typeof exif?.lng === 'number' && Math.abs(exif.lng) <= 180
      ? exif.lng
      : null;

  let exifTakenAt: Date | null = null;
  if (policy.recordTakenAt && exif?.takenAt) {
    const parsed = new Date(exif.takenAt);
    const plausible =
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() >= 2000 &&
      // A day of slack absorbs a device clock that is merely wrong, not absurd.
      parsed.getTime() <= Date.now() + 86_400_000;
    if (plausible) exifTakenAt = parsed;
  }

  // A position is a pair. Half of one places a site on the equator or the
  // meridian, which is worse than admitting we do not know.
  return lat === null || lng === null ? { exifTakenAt, lat: null, lng: null } : { exifTakenAt, lat, lng };
}

export async function attachToWorkOrder(params: {
  workOrderId: string;
  kind: AttachmentKind;
  mime: string;
  body: Buffer;
  /**
   * UUID chosen by the client so the payload can reference the file before it
   * has been uploaded. Generated here when absent.
   */
  mediaId?: string | null;
  /** When the photo was taken — decides the month folder, so it must match. */
  capturedAt?: Date | null;
  /** Small preview generated by the same client-side canvas. Optional. */
  thumb?: Buffer | null;
  exif?: ExifInput | null;
  actorId?: string | null;
  caption?: string | null;
  /**
   * Set to attach to a work order that has already been handed in.
   *
   * The caller must have established that this user is allowed to — the route
   * checks the permission; this records the fact and the reason.
   */
  lateAttach?: { reason: string } | null;
}): Promise<AttachResult> {
  const ext = ALLOWED_IMAGE_MIME[params.mime];
  if (!ext) {
    throw new MediaError('รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG หรือ WebP เท่านั้น', 415);
  }
  if (params.body.byteLength === 0) throw new MediaError('ไฟล์ว่างเปล่า');
  if (params.body.byteLength > MAX_UPLOAD_BYTES) {
    throw new MediaError('ไฟล์ใหญ่เกินไป — ลองถ่ายใหม่หรือย่อรูปก่อนอัปโหลด', 413);
  }

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: params.workOrderId },
    select: { id: true, status: true },
  });
  if (!workOrder) throw new MediaError('ไม่พบใบงาน', 404);
  const reason = params.lateAttach?.reason.trim() ?? '';
  const isLate = !ATTACHABLE_STATUSES.has(workOrder.status);

  if (isLate) {
    if (!LATE_ATTACHABLE_STATUSES.has(workOrder.status)) {
      throw new MediaError('สถานะใบงานนี้แนบรูปไม่ได้', 409);
    }
    if (!params.lateAttach) {
      throw new MediaError(
        'ใบงานนี้ส่งแล้ว — แนบเพิ่มได้เฉพาะผู้มีสิทธิ์ตรวจใบงาน และต้องระบุเหตุผล',
        409,
      );
    }
    // An unexplained late addition to a signed document is exactly the thing
    // that makes the document arguable later.
    if (!reason) throw new MediaError('กรุณาระบุเหตุผลที่แนบรูปเพิ่มภายหลัง', 400);
  }

  // The uploader's FILENAME is still discarded — it reaches the local driver's
  // filesystem path. What the client may choose is the identifier, and only
  // that: a photo taken with no signal has to be referenced in the form
  // payload before any server has seen it, and a key assigned later would mean
  // rewriting the payload at sync — which would break every signature hash
  // taken over it.
  const id = params.mediaId ?? randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new MediaError('รหัสไฟล์ไม่ถูกต้อง');
  }

  // capturedAt, not now: the client worked this key out when the photo was
  // taken, and an upload that syncs across a month boundary must still land on
  // the name already written into the payload.
  const key = mediaKey({
    entityType: 'WorkOrder',
    entityId: workOrder.id,
    kind: params.kind,
    filename: `${id}.${ext}`,
    at: params.capturedAt ?? new Date(),
  });

  // A client-chosen id could otherwise be reused to overwrite an attachment
  // already recorded against this work order — which is overwriting evidence.
  // Re-sending the SAME upload is normal (a sync that ran twice); replacing
  // its contents is not.
  const existing = await prisma.attachment.findFirst({
    where: { storageKey: key },
    select: { id: true, sha256: true, thumbKey: true },
  });
  if (existing) {
    const sameBytes = existing.sha256 === sha256Hex(params.body);
    if (!sameBytes) throw new MediaError('รหัสไฟล์นี้ถูกใช้ไปแล้ว', 409);
    return {
      id: existing.id,
      key,
      url: mediaUrl(key),
      bytes: params.body.byteLength,
      // Read from the stored row, not assumed: the first upload may have
      // arrived without a preview, and claiming one exists sends the caller
      // to `?thumb=1` for a file that was never written.
      hasThumb: existing.thumbKey !== null,
    };
  }

  const adapter = storage();
  const stored = await adapter.put(key, params.body, params.mime);

  // The preview sits beside the original under a derived name, so nothing has
  // to be looked up to find it and the pair moves together.
  let thumbKey: string | null = null;
  if (params.thumb && params.thumb.byteLength > 0) {
    thumbKey = key.replace(/(\.[^./]+)$/, '.thumb.jpg');
    await adapter.put(thumbKey, params.thumb, 'image/jpeg');
  }

  const { exifTakenAt, lat, lng } = cleanExif(params.exif, await getCapturePolicy());

  // Written after the object exists: a row pointing at bytes that were never
  // stored would render as a permanently broken thumbnail.
  const attachment = await prisma.attachment.create({
    data: {
      entityType: 'WorkOrder',
      entityId: workOrder.id,
      kind: params.kind,
      storageKey: stored.key,
      thumbKey,
      mime: params.mime,
      bytes: stored.bytes,
      sha256: stored.sha256,
      exifTakenAt,
      lat,
      lng,
      caption: params.caption ?? null,
      uploadedById: params.actorId ?? null,
      addedAfterSubmit: isLate,
      addedReason: isLate ? reason : null,
    },
    select: { id: true },
  });

  return {
    id: attachment.id,
    key: stored.key,
    url: mediaUrl(stored.key),
    bytes: stored.bytes,
    hasThumb: thumbKey !== null,
  };
}

/** The app-relative URL for a stored key — always goes through the auth check. */
export function mediaUrl(key: string): string {
  return `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function findAttachmentByKey(key: string) {
  return prisma.attachment.findFirst({
    where: { storageKey: key },
    select: {
      id: true,
      mime: true,
      bytes: true,
      thumbKey: true,
      entityType: true,
      entityId: true,
      exifTakenAt: true,
      lat: true,
      lng: true,
    },
  });
}

export interface LateAttachmentView {
  id: string;
  key: string;
  url: string;
  kind: AttachmentKind;
  reason: string;
  addedByName: string | null;
  addedAt: string;
}

/**
 * Photographs added to this work order after it was handed in.
 *
 * Returned separately from the form payload on purpose. These never entered
 * the payload a signature was taken over, so presenting them inside the form
 * would imply the customer saw them. They belong beside the document, labelled
 * with who added them and why.
 */
export async function listLateAttachments(workOrderId: string): Promise<LateAttachmentView[]> {
  const rows = await prisma.attachment.findMany({
    where: { entityType: 'WorkOrder', entityId: workOrderId, addedAfterSubmit: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      storageKey: true,
      kind: true,
      addedReason: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    key: r.storageKey,
    url: mediaUrl(r.storageKey),
    kind: r.kind,
    reason: r.addedReason ?? '',
    addedByName: r.uploadedBy?.name ?? null,
    addedAt: r.createdAt.toISOString(),
  }));
}
