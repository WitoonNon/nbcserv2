import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '../src/lib/db';
import { cleanExif } from '../src/modules/media/attachment.service';
import {
  CAPTURE_DEFAULTS,
  CAPTURE_KEYS,
  getCapturePolicy,
  setCapturePolicy,
} from '../src/modules/platform/capture-policy';

/**
 * What a photograph is allowed to remember.
 *
 * The client asked to be able to switch this off. The switch has to bite at
 * the WRITE, not by trusting the phone to stop sending — a client that keeps
 * sending would otherwise still be stored, and "we turned it off" would be
 * false in the only place that matters.
 */

const EXIF = { takenAt: '2026-08-01T10:00:00.000Z', lat: 13.91, lng: 100.41 };

afterEach(async () => {
  await prisma.appConfig.deleteMany({
    where: { key: { in: [CAPTURE_KEYS.takenAt, CAPTURE_KEYS.location] } },
  });
});

describe('stripping what the office chose not to keep', () => {
  it('keeps both when both are switched on', () => {
    const out = cleanExif(EXIF, { recordTakenAt: true, recordLocation: true });
    expect(out.exifTakenAt).toBeInstanceOf(Date);
    expect(out.lat).toBe(13.91);
    expect(out.lng).toBe(100.41);
  });

  it('drops the coordinates when location is off, and keeps the time', () => {
    const out = cleanExif(EXIF, { recordTakenAt: true, recordLocation: false });
    expect(out.exifTakenAt).toBeInstanceOf(Date);
    expect(out.lat).toBeNull();
    expect(out.lng).toBeNull();
  });

  it('drops the time when time is off, and keeps the coordinates', () => {
    const out = cleanExif(EXIF, { recordTakenAt: false, recordLocation: true });
    expect(out.exifTakenAt).toBeNull();
    expect(out.lat).toBe(13.91);
  });

  it('keeps nothing when both are off', () => {
    const out = cleanExif(EXIF, { recordTakenAt: false, recordLocation: false });
    expect(out).toEqual({ exifTakenAt: null, lat: null, lng: null });
  });

  it('still refuses half a position', () => {
    // Half a coordinate places a site on the equator, which is worse than
    // admitting we do not know.
    const out = cleanExif({ lat: 13.91, lng: null }, { recordTakenAt: true, recordLocation: true });
    expect(out.lat).toBeNull();
    expect(out.lng).toBeNull();
  });

  it('defaults to not recording location', () => {
    // The default is the setting the system actually runs on, because it is
    // the one nobody revisits.
    expect(CAPTURE_DEFAULTS.recordLocation).toBe(false);
    expect(cleanExif(EXIF).lat).toBeNull();
    expect(cleanExif(EXIF).exifTakenAt).toBeInstanceOf(Date);
  });
});

describe('the stored policy', () => {
  it('round-trips through AppConfig', async () => {
    await setCapturePolicy({ recordTakenAt: false, recordLocation: true });
    expect(await getCapturePolicy()).toEqual({ recordTakenAt: false, recordLocation: true });

    await setCapturePolicy({ recordTakenAt: true, recordLocation: false });
    expect(await getCapturePolicy()).toEqual({ recordTakenAt: true, recordLocation: false });
  });

  it('stops counting as an unconfirmed assumption once a human sets it', async () => {
    await setCapturePolicy({ recordTakenAt: true, recordLocation: false });
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: [CAPTURE_KEYS.takenAt, CAPTURE_KEYS.location] } },
      select: { isAssumption: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isAssumption === false)).toBe(true);
  });

  it('falls back to the defaults rather than to collecting more', async () => {
    // Nothing stored at all — the fallback must not be "record everything".
    expect(await getCapturePolicy()).toEqual(CAPTURE_DEFAULTS);
  });
});
