/**
 * The QR code on the wall, and what it can and cannot prove.
 *
 * ## What this is for
 *
 * A printed code is photographed and shared within the first week — everyone
 * involved knows that, and the client was told. So the token is NOT the
 * anti-fraud measure; the location check is. What the token does is narrower
 * and still worth having:
 *
 *   1. it proves the scan came from a code this system issued, not from a URL
 *      somebody typed
 *   2. it says WHICH scan point, when there is more than one
 *   3. the rotating variant, where used, limits a shared photograph to the
 *      seconds it was taken in
 *
 * Signed with HMAC over the app secret. Without a signature the whole scheme
 * is a guessable id in a URL, and anyone who has seen one can invent others.
 *
 * ## Two variants, one verifier
 *
 * The client confirmed on 26 ส.ค. that printed codes alone are enough, so
 * `STATIC` is what runs. `ROTATING` is verified too because an earlier note
 * records both being promised in the same price — the contradiction is
 * flagged in the roadmap, and supporting both here costs one branch rather
 * than a rewrite if the answer moves again.
 *
 * Web Crypto rather than node:crypto so a rotating code can also be rendered
 * in a browser without a second implementation of the same signature.
 */

export type TokenKind = 'STATIC' | 'ROTATING';

/** How long one rotating code stands. The client's note said 30 seconds. */
export const ROTATING_WINDOW_SECONDS = 30;

/**
 * Windows either side that still verify.
 *
 * A phone's clock drifts, and a person photographing a screen takes a second
 * or two to press. Refusing those makes the feature feel broken; accepting a
 * whole minute either way would make the rotation pointless. One window each
 * way is the smallest number that absorbs real life.
 */
const ROTATING_GRACE_WINDOWS = 1;

export interface ParsedToken {
  kind: TokenKind;
  scanPointId: string;
  /** Only present on a rotating token. */
  window?: number;
  signature: string;
}

export type TokenFailure =
  | 'MALFORMED'
  | 'BAD_SIGNATURE'
  /** A rotating code from outside the accepted window — usually a photograph. */
  | 'EXPIRED';

export type TokenResult =
  | { ok: true; kind: TokenKind; scanPointId: string }
  | { ok: false; failure: TokenFailure; reasonTh: string };

const REASONS: Record<TokenFailure, string> = {
  MALFORMED: 'รหัส QR ไม่ถูกต้อง',
  BAD_SIGNATURE: 'รหัส QR ไม่ถูกต้อง',
  // Said plainly, because the honest cause is almost always a screenshot
  // someone was sent rather than an attack.
  EXPIRED: 'รหัส QR หมดอายุแล้ว — สแกนจากหน้าจอที่จุดสแกนอีกครั้ง',
};

// Return type left to inference on purpose: annotating it as a bare
// `Uint8Array` widens the buffer to ArrayBufferLike, which Web Crypto will not
// accept as a BufferSource.
function encode(text: string) {
  return new TextEncoder().encode(text);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encode(payload));
  // Half the digest. Still 128 bits, and it keeps the QR code small enough to
  // scan reliably off a printed sheet in poor light.
  return toHex(mac).slice(0, 32);
}

/**
 * Constant-time compare.
 *
 * `===` on a hex string leaks how many characters matched through timing.
 * That is a thin channel, but the fix is three lines and the alternative is
 * explaining one day why it was left in.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Which rotating window a moment falls in. */
export function windowFor(at: Date): number {
  return Math.floor(at.getTime() / 1000 / ROTATING_WINDOW_SECONDS);
}

/** The token printed on a sheet and stuck to the wall. Never changes. */
export async function issueStaticToken(scanPointId: string, secret: string): Promise<string> {
  const signature = await sign(`S:${scanPointId}`, secret);
  return `S.${scanPointId}.${signature}`;
}

/** The token behind a code shown on a screen, good for one window. */
export async function issueRotatingToken(
  scanPointId: string,
  secret: string,
  at: Date = new Date(),
): Promise<string> {
  const w = windowFor(at);
  const signature = await sign(`R:${scanPointId}:${w}`, secret);
  return `R.${scanPointId}.${w}.${signature}`;
}

/**
 * Check a scanned token.
 *
 * Returns a reason rather than throwing: every failure here is something the
 * person holding the phone needs told, and none of them are exceptional.
 */
export async function verifyToken(
  token: string,
  secret: string,
  at: Date = new Date(),
): Promise<TokenResult> {
  const parts = token.trim().split('.');

  if (parts[0] === 'S' && parts.length === 3) {
    const [, scanPointId, signature] = parts;
    if (!scanPointId || !signature) return fail('MALFORMED');

    const expected = await sign(`S:${scanPointId}`, secret);
    if (!safeEqual(signature, expected)) return fail('BAD_SIGNATURE');
    return { ok: true, kind: 'STATIC', scanPointId };
  }

  if (parts[0] === 'R' && parts.length === 4) {
    const [, scanPointId, rawWindow, signature] = parts;
    if (!scanPointId || !rawWindow || !signature) return fail('MALFORMED');

    const claimed = Number(rawWindow);
    if (!Number.isInteger(claimed)) return fail('MALFORMED');

    // Signature first, then freshness. Checking freshness first would tell an
    // attacker which windows exist before they have shown they can sign one.
    const expected = await sign(`R:${scanPointId}:${claimed}`, secret);
    if (!safeEqual(signature, expected)) return fail('BAD_SIGNATURE');

    const current = windowFor(at);
    if (Math.abs(current - claimed) > ROTATING_GRACE_WINDOWS) return fail('EXPIRED');

    return { ok: true, kind: 'ROTATING', scanPointId };
  }

  return fail('MALFORMED');
}

function fail(failure: TokenFailure): TokenResult {
  return { ok: false, failure, reasonTh: REASONS[failure] };
}
