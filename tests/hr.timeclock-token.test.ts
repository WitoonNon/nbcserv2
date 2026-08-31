import { describe, it, expect } from 'vitest';
import {
  issueRotatingToken,
  issueStaticToken,
  ROTATING_WINDOW_SECONDS,
  verifyToken,
  windowFor,
} from '../src/modules/hr/timeclock-token';

/**
 * The QR code on the wall.
 *
 * What is defended here is narrow on purpose. A printed code gets
 * photographed — everyone involved knows that, and the location check is what
 * actually stops the fraud. The token's job is to prove a scan came from a
 * code this system issued rather than a URL somebody typed, and to say which
 * scan point it was.
 *
 * Pure functions, no database.
 */

const SECRET = 'test-secret-not-the-real-one';
const OTHER_SECRET = 'a-different-deployment';
const POINT = 'scan-point-office-front';

describe('the printed code', () => {
  it('verifies and reports which scan point it belongs to', async () => {
    const token = await issueStaticToken(POINT, SECRET);
    const result = await verifyToken(token, SECRET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('STATIC');
      expect(result.scanPointId).toBe(POINT);
    }
  });

  it('is stable, because it is printed once and stuck to a wall', async () => {
    const first = await issueStaticToken(POINT, SECRET);
    const second = await issueStaticToken(POINT, SECRET);
    expect(first).toBe(second);
  });

  it('still verifies a year later', async () => {
    const token = await issueStaticToken(POINT, SECRET);
    const nextYear = new Date(Date.now() + 365 * 86_400_000);

    // A sheet on a wall does not expire, and a printed code that stopped
    // working one morning with no warning would strand everybody.
    expect((await verifyToken(token, SECRET, nextYear)).ok).toBe(true);
  });

  it('refuses a token invented by hand', async () => {
    // Without a signature this scheme is a guessable id in a URL: see one,
    // invent the rest.
    const result = await verifyToken(`S.${POINT}.0123456789abcdef0123456789abcdef`, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('BAD_SIGNATURE');
  });

  it('refuses a token signed for a different deployment', async () => {
    const token = await issueStaticToken(POINT, OTHER_SECRET);
    const result = await verifyToken(token, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('BAD_SIGNATURE');
  });

  it('refuses a token whose scan point was swapped after signing', async () => {
    const token = await issueStaticToken(POINT, SECRET);
    const tampered = token.replace(POINT, 'scan-point-somewhere-else');

    expect((await verifyToken(tampered, SECRET)).ok).toBe(false);
  });
});

describe('the code shown on a screen', () => {
  const now = new Date('2026-08-31T09:00:00Z');

  it('verifies inside its window', async () => {
    const token = await issueRotatingToken(POINT, SECRET, now);
    const result = await verifyToken(token, SECRET, now);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe('ROTATING');
  });

  it('tolerates one window of drift either way', async () => {
    // A phone's clock is not exact and a person takes a second to press.
    // Refusing that makes the feature feel broken.
    const token = await issueRotatingToken(POINT, SECRET, now);
    const before = new Date(now.getTime() - ROTATING_WINDOW_SECONDS * 1000);
    const after = new Date(now.getTime() + ROTATING_WINDOW_SECONDS * 1000);

    expect((await verifyToken(token, SECRET, before)).ok).toBe(true);
    expect((await verifyToken(token, SECRET, after)).ok).toBe(true);
  });

  it('refuses a screenshot from a few minutes ago', async () => {
    const token = await issueRotatingToken(POINT, SECRET, now);
    const later = new Date(now.getTime() + 5 * 60_000);

    const result = await verifyToken(token, SECRET, later);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('EXPIRED');
      // The honest cause is almost always a photo someone was sent, so the
      // message says what to do rather than implying wrongdoing.
      expect(result.reasonTh).toContain('สแกนจากหน้าจอ');
    }
  });

  it('changes as the window turns over', async () => {
    const later = new Date(now.getTime() + ROTATING_WINDOW_SECONDS * 1000);
    expect(await issueRotatingToken(POINT, SECRET, now))
      .not.toBe(await issueRotatingToken(POINT, SECRET, later));
  });

  it('checks the signature before it checks the clock', async () => {
    // Answering EXPIRED to an unsigned guess would confirm which windows
    // exist before the caller has shown they can sign one.
    const stale = new Date(now.getTime() - 10 * 60_000);
    const forged = `R.${POINT}.${windowFor(stale)}.0123456789abcdef0123456789abcdef`;

    const result = await verifyToken(forged, SECRET, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('BAD_SIGNATURE');
  });

  it('refuses a window that is not a number', async () => {
    const result = await verifyToken(`R.${POINT}.notanumber.abc`, SECRET, now);
    expect(result.ok).toBe(false);
  });
});

describe('anything else that gets scanned', () => {
  it.each([
    ['ว่างเปล่า', ''],
    ['ข้อความทั่วไป', 'hello'],
    ['URL อื่น', 'https://example.com/scan'],
    ['ส่วนไม่ครบ', 'S.only-two'],
    ['ชนิดที่ไม่รู้จัก', 'X.point.sig'],
  ])('refuses %s', async (_label, token) => {
    const result = await verifyToken(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonTh).toBeTruthy();
  });

  it('tolerates whitespace around a scanned value', async () => {
    // Some scanners append a newline.
    const token = await issueStaticToken(POINT, SECRET);
    expect((await verifyToken(`  ${token}\n`, SECRET)).ok).toBe(true);
  });
});
