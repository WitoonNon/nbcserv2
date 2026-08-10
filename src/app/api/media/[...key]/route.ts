import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { storage } from '@/lib/storage';
import { findAttachmentByKey } from '@/modules/media/attachment.service';

export const dynamic = 'force-dynamic';

/**
 * Serve a stored file back to a signed-in user.
 *
 * These are photographs taken inside customers' homes, so nothing is served
 * from a public bucket and nothing is served without a session. The key layout
 * is deliberately guessable (yyyymm/entity/id/kind/file), which is exactly why
 * knowing a key must not be enough to read one.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
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

  const adapter = storage();

  // Object storage can serve the bytes itself; going through this process
  // would double the bandwidth for no added safety, since the signed URL is
  // only minted after the checks above.
  if (adapter.name !== 'local') {
    return NextResponse.redirect(await adapter.url(key));
  }

  try {
    const body = await adapter.get(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': attachment.mime,
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
