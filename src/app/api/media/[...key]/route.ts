import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { storage } from '@/lib/storage';
import { findAttachmentByKey } from '@/modules/media/attachment.service';
import { canViewWorkOrder } from '@/modules/workorders/access';

export const dynamic = 'force-dynamic';

/**
 * Serve a stored file back to a signed-in user.
 *
 * These are photographs taken inside customers' homes, so nothing is served
 * from a public bucket and nothing is served without a session. The key layout
 * is deliberately guessable (yyyymm/entity/id/kind/file), which is exactly why
 * knowing a key must not be enough to read one.
 *
 * Nor is holding `workorder.read`. That permission says an account may look at
 * work orders; it does not say which. The CUSTOMER role holds it, so without
 * the ownership check below, one customer could fetch photographs from inside
 * another customer's home the moment customer logins exist.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'ยังไม่ได้เข้าสู่ระบบ' }, { status: 401 });
  }
  if (!user.permissions.has('workorder.read')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูไฟล์นี้' }, { status: 403 });
  }

  const { key: segments } = await ctx.params;
  const key = segments.map(decodeURIComponent).join('/');

  // Only files this application recorded are served. Without this, the route
  // would hand out anything in the bucket that a caller could name.
  const attachment = await findAttachmentByKey(key);
  if (!attachment) {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
  }

  // Work-order media is the only kind there is so far; anything else has no
  // rule written for it yet and is refused rather than guessed at.
  if (attachment.entityType !== 'WorkOrder') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูไฟล์นี้' }, { status: 403 });
  }
  if (!(await canViewWorkOrder(user, attachment.entityId))) {
    // 404, not 403: the caller is not entitled to know this key exists, and a
    // 403 on a guessable key confirms that it does.
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
  }

  // `?thumb=1` asks for the preview. It is addressed through the full image's
  // key so the form payload only ever has to store one key per photograph —
  // and an attachment uploaded before previews existed simply serves the full
  // image instead of 404ing.
  const wantsThumb = new URL(req.url).searchParams.get('thumb') === '1';
  const served = wantsThumb && attachment.thumbKey ? attachment.thumbKey : key;
  const mime = served === key ? attachment.mime : 'image/jpeg';

  const adapter = storage();

  // Object storage can serve the bytes itself; going through this process
  // would double the bandwidth for no added safety, since the signed URL is
  // only minted after the checks above.
  if (adapter.name !== 'local') {
    try {
      return NextResponse.redirect(await adapter.url(served));
    } catch {
      // Signing fails when the object is not there — which is the normal case
      // for a row recorded before the storage driver changed, since those
      // bytes are still sitting on the old driver. That is a missing file,
      // not a broken server.
      return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
    }
  }

  try {
    const body = await adapter.get(served);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.byteLength),
        // Private: the URL is authorised per session, so a shared cache must
        // never hold the response for the next person to ask.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
  }
}
