import { NextResponse } from 'next/server';
import type { AttachmentKind } from '@/generated/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { attachToWorkOrder, MAX_UPLOAD_BYTES, MediaError } from '@/modules/media/attachment.service';

export const dynamic = 'force-dynamic';

/**
 * Upload one field photograph against a work order.
 *
 * `/api/media` is exempt from the edge middleware (it has no database access
 * and cannot validate a session), so the session check here is the only one
 * there is — it is not a second line of defence.
 *
 * Editing rights match saveDraftAction: whoever may fill the form in may
 * attach the photographs that go with it.
 */

const VALID_KINDS = new Set<AttachmentKind>([
  'BEFORE',
  'AFTER',
  'DEFECT',
  'NAMEPLATE',
  'SERIAL',
  // The captured signature image. Storing it as an attachment is only half of
  // signing — the Signature row that binds it to a payload hash is written by
  // signWorkOrder().
  'SIGNATURE',
  'OTHER',
]);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'ยังไม่ได้เข้าสู่ระบบ' }, { status: 401 });
  }
  // A flagged account may only fix its own password — same rule as
  // assertPermission(), which this route cannot use because it must answer
  // with a status code rather than redirect an <img> to the login page.
  if (user.mustChangePassword || !user.permissions.has('workorder.read')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แนบรูปในใบงานนี้' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'อ่านไฟล์ที่อัปโหลดไม่ได้' }, { status: 400 });
  }

  const file = form.get('file');
  const thumb = form.get('thumb');
  const workOrderId = String(form.get('workOrderId') ?? '');
  const kind = String(form.get('kind') ?? 'OTHER') as AttachmentKind;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ไม่พบไฟล์ที่แนบมา' }, { status: 400 });
  }
  if (!workOrderId) {
    return NextResponse.json({ error: 'ไม่ได้ระบุใบงาน' }, { status: 400 });
  }
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'ประเภทรูปไม่ถูกต้อง' }, { status: 400 });
  }
  // Checked before the body is read into memory, so an oversized upload is
  // refused rather than buffered.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'ไฟล์ใหญ่เกินไป — ลองถ่ายใหม่หรือย่อรูปก่อนอัปโหลด' },
      { status: 413 },
    );
  }

  // A preview that is not small is not a preview; anything bigger than this
  // is ignored rather than trusted.
  const usableThumb = thumb instanceof File && thumb.size > 0 && thumb.size <= 512 * 1024;

  const numeric = (name: string): number | null => {
    const raw = form.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  try {
    const result = await attachToWorkOrder({
      workOrderId,
      kind,
      mime: file.type,
      body: Buffer.from(await file.arrayBuffer()),
      // Chosen by the client so a photo taken with no signal can be named in
      // the form payload immediately, and still be the same file when the
      // upload actually goes through.
      mediaId: form.get('mediaId') ? String(form.get('mediaId')) : null,
      capturedAt: form.get('capturedAt') ? new Date(String(form.get('capturedAt'))) : null,
      thumb: usableThumb ? Buffer.from(await thumb.arrayBuffer()) : null,
      // Read from the original on the client, because the downscale that
      // happens there destroys it. attachToWorkOrder decides what is plausible.
      exif: {
        takenAt: form.get('takenAt') ? String(form.get('takenAt')) : null,
        lat: numeric('lat'),
        lng: numeric('lng'),
      },
      actorId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof MediaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `อัปโหลดไม่สำเร็จ: ${message}` }, { status: 500 });
  }
}
