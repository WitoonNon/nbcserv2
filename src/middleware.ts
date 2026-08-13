import { NextResponse, type NextRequest } from 'next/server';
import { PUBLIC_PREFIXES, SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * Edge-level gate.
 *
 * This only checks that a session cookie is PRESENT — it cannot validate it,
 * because the Edge runtime has no database access. Its job is to keep
 * unauthenticated traffic off the staff and technician apps cheaply.
 *
 * The real authorisation check is `requireUser` / `requirePermission` in each
 * page and `assertPermission` in each server action. A forged cookie gets past
 * this middleware and is then rejected by the database lookup.
 */

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static brand assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
