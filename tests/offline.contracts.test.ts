import { describe, it, expect } from 'vitest';
import { workOrderMediaKey, mediaKey } from '../src/lib/media/key';
import { payloadHash, payloadHashMatches, stableStringify } from '../src/lib/forms/payload-hash';

/**
 * The two agreements that make offline work safe.
 *
 * Both are cases where the browser and the server must reach the SAME answer
 * about the same thing, hours apart, without talking to each other:
 *
 *   1. the name a photo will be stored under, worked out before it uploads
 *   2. the hash a signature is bound to, taken before there is any connection
 *
 * If either drifts, the failure is silent: a payload pointing at a file that
 * does not exist, or every signature reading as tampered.
 *
 * Pure functions — no browser, no database.
 */

describe('a photo taken offline knows its own name', () => {
  const captured = new Date('2026-08-11T16:45:00+07:00');

  it('produces the same key whenever the upload actually happens', () => {
    const onPhone = workOrderMediaKey({
      workOrderId: 'wo_123',
      kind: 'BEFORE',
      mediaId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      extension: 'jpg',
      at: captured,
    });

    // The server rebuilds it from the same capture time, not from "now" —
    // this call stands for the upload landing an hour later.
    const onServer = mediaKey({
      entityType: 'WorkOrder',
      entityId: 'wo_123',
      kind: 'BEFORE',
      filename: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg',
      at: captured,
    });

    expect(onPhone).toBe(onServer);
  });

  it('puts the month in UTC, so a Bangkok phone and a UTC server agree', () => {
    // 06:00 in Bangkok on 1 September is 23:00 on 31 August in UTC. Using
    // local time on each side would file this photo in two different folders.
    const earlyMorningBangkok = new Date('2026-09-01T06:00:00+07:00');
    const key = workOrderMediaKey({
      workOrderId: 'wo_1',
      kind: 'AFTER',
      mediaId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      extension: 'jpg',
      at: earlyMorningBangkok,
    });

    expect(key.startsWith('202608/')).toBe(true);
  });

  it('still refuses to let a name escape its folder', () => {
    const key = mediaKey({
      entityType: 'WorkOrder',
      entityId: '../../../etc',
      kind: 'BEFORE',
      filename: '../../passwd',
    });

    const segments = key.split('/');
    expect(segments).toHaveLength(5);
    expect(segments.every((s) => s !== '..' && s !== '.')).toBe(true);
  });
});

describe('a signature taken offline knows its own hash', () => {
  it('is stable across key order, so re-saving is not tampering', async () => {
    const a = await payloadHash({ b: 2, a: { y: 1, x: [1, 2] } });
    const b = await payloadHash({ a: { x: [1, 2], y: 1 }, b: 2 });
    expect(a).toBe(b);
  });

  it('changes when any value changes — this is the whole mechanism', async () => {
    const signed = { parts: [{ description: 'ล้างคอยล์', qty: '1' }] };
    const edited = { parts: [{ description: 'เปลี่ยนคอมเพรสเซอร์', qty: '1' }] };

    expect(await payloadHash(edited)).not.toBe(await payloadHash(signed));
  });

  it('verifies a hash the phone took hours earlier', async () => {
    const asSigned = {
      customer: { customerName: 'คุณสมหมาย' },
      photosBefore: ['202608/WorkOrder/wo_1/BEFORE/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'],
    };

    // Taken on the phone with no signal; checked here when the queue drains.
    const takenOnPhone = await payloadHash(asSigned);
    expect(await payloadHashMatches(asSigned, takenOnPhone)).toBe(true);
  });

  it('catches a form edited between signing and syncing', async () => {
    const asSigned = { parts: [{ description: 'ล้างคอยล์', qty: '1' }] };
    const takenOnPhone = await payloadHash(asSigned);

    const edited = { parts: [{ description: 'ล้างคอยล์', qty: '1' }, { description: 'คอมเพรสเซอร์' }] };

    // Adding a part after the customer signed is exactly what must not ride
    // along on their signature.
    expect(await payloadHashMatches(edited, takenOnPhone)).toBe(false);
  });

  it('rejects anything that is not a hash', async () => {
    expect(await payloadHashMatches({}, '')).toBe(false);
    expect(await payloadHashMatches({}, 'not-a-hash')).toBe(false);
    expect(await payloadHashMatches({}, 'ABC123')).toBe(false);
  });

  it('is not confused by a photo key that survives the queue unchanged', async () => {
    // The reason media keys are client-chosen: if the key were rewritten at
    // sync, this hash would no longer match and every offline signature would
    // read as tampered.
    const key = workOrderMediaKey({
      workOrderId: 'wo_1',
      kind: 'BEFORE',
      mediaId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      extension: 'jpg',
      at: new Date('2026-08-11T09:45:00Z'),
    });

    const payload = { photosBefore: [key] };
    const signedOnPhone = await payloadHash(payload);

    // Server side, after the upload lands under that same key.
    expect(await payloadHashMatches({ photosBefore: [key] }, signedOnPhone)).toBe(true);
  });
});

describe('canonical serialisation', () => {
  it('drops undefined but keeps null, which mean different things on a form', () => {
    // undefined is "never touched"; null is "answered, and the answer is none".
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('keeps array order, which is what a parts list says', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
