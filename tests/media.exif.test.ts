import { describe, it, expect } from 'vitest';
import { readExif } from '../src/lib/media/exif';

/**
 * EXIF reading, against JPEGs built byte by byte here.
 *
 * A binary fixture would say nothing about WHY a test passes; a builder makes
 * the structure being parsed — marker, TIFF header, three IFDs, inline versus
 * indirect values — visible in the test itself, and lets each case vary one
 * part of it.
 *
 * Pure functions, no browser and no database needed.
 */

interface BuildOptions {
  bigEndian?: boolean;
  date?: string;
  /** Degrees/minutes/seconds, as stored. */
  lat?: [number, number, number];
  lng?: [number, number, number];
  latRef?: string;
  lngRef?: string;
  omitGps?: boolean;
  omitDate?: boolean;
}

/** A JPEG carrying nothing but an APP1 EXIF segment. */
function buildJpeg(opts: BuildOptions = {}): ArrayBuffer {
  const le = !opts.bigEndian;
  const date = opts.date ?? '2026:08:09 14:30:00';

  const gpsEntries = opts.omitGps ? 0 : 4;
  const exifEntries = opts.omitDate ? 0 : 1;

  // Layout, all offsets relative to the start of the TIFF header.
  const IFD0 = 8;
  const EXIF_IFD = IFD0 + 2 + 2 * 12 + 4;
  const GPS_IFD = EXIF_IFD + 2 + exifEntries * 12 + 4;
  const DATE_AT = GPS_IFD + 2 + gpsEntries * 12 + 4;
  const LAT_AT = DATE_AT + 20;
  const LNG_AT = LAT_AT + 24;
  const tiffSize = LNG_AT + 24;

  const tiff = new DataView(new ArrayBuffer(tiffSize));
  const putAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) tiff.setUint8(offset + i, text.charCodeAt(i));
    tiff.setUint8(offset + text.length, 0);
  };
  const putRationals = (offset: number, values: [number, number, number]) => {
    values.forEach((v, i) => {
      tiff.setUint32(offset + i * 8, v, le);
      tiff.setUint32(offset + i * 8 + 4, 1, le);
    });
  };

  // TIFF header.
  tiff.setUint16(0, le ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 0x002a, le);
  tiff.setUint32(4, IFD0, le);

  // IFD0 — two pointers, nothing else.
  tiff.setUint16(IFD0, 2, le);
  const pointer = (at: number, tag: number, target: number) => {
    tiff.setUint16(at, tag, le);
    tiff.setUint16(at + 2, 4, le); // LONG
    tiff.setUint32(at + 4, 1, le);
    tiff.setUint32(at + 8, target, le);
  };
  pointer(IFD0 + 2, 0x8769, EXIF_IFD);
  pointer(IFD0 + 2 + 12, 0x8825, GPS_IFD);
  tiff.setUint32(IFD0 + 2 + 24, 0, le);

  // Exif sub-IFD — DateTimeOriginal, too long to sit inline.
  tiff.setUint16(EXIF_IFD, exifEntries, le);
  if (!opts.omitDate) {
    tiff.setUint16(EXIF_IFD + 2, 0x9003, le);
    tiff.setUint16(EXIF_IFD + 4, 2, le); // ASCII
    tiff.setUint32(EXIF_IFD + 6, 20, le);
    tiff.setUint32(EXIF_IFD + 10, DATE_AT, le);
    putAscii(DATE_AT, date.slice(0, 19));
  }
  tiff.setUint32(EXIF_IFD + 2 + exifEntries * 12, 0, le);

  // GPS IFD — the refs are two bytes, so they live inside their own entries.
  tiff.setUint16(GPS_IFD, gpsEntries, le);
  if (!opts.omitGps) {
    const ref = (at: number, tag: number, letter: string) => {
      tiff.setUint16(at, tag, le);
      tiff.setUint16(at + 2, 2, le); // ASCII
      tiff.setUint32(at + 4, 2, le);
      putAscii(at + 8, letter);
    };
    const coordinate = (at: number, tag: number, target: number) => {
      tiff.setUint16(at, tag, le);
      tiff.setUint16(at + 2, 5, le); // RATIONAL
      tiff.setUint32(at + 4, 3, le);
      tiff.setUint32(at + 8, target, le);
    };

    ref(GPS_IFD + 2, 0x0001, opts.latRef ?? 'N');
    coordinate(GPS_IFD + 2 + 12, 0x0002, LAT_AT);
    ref(GPS_IFD + 2 + 24, 0x0003, opts.lngRef ?? 'E');
    coordinate(GPS_IFD + 2 + 36, 0x0004, LNG_AT);

    putRationals(LAT_AT, opts.lat ?? [13, 44, 30]);
    putRationals(LNG_AT, opts.lng ?? [100, 30, 0]);
  }
  tiff.setUint32(GPS_IFD + 2 + gpsEntries * 12, 0, le);

  // Wrap it: SOI, APP1 marker, segment length, the "Exif\0\0" tag, then TIFF.
  const out = new Uint8Array(2 + 2 + 2 + 6 + tiffSize);
  const head = new DataView(out.buffer);
  head.setUint16(0, 0xffd8); // SOI
  head.setUint16(2, 0xffe1); // APP1
  head.setUint16(4, 2 + 6 + tiffSize); // length counts itself
  out.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6); // "Exif\0\0"
  out.set(new Uint8Array(tiff.buffer), 12);
  return out.buffer;
}

describe('reading capture time', () => {
  it('reads DateTimeOriginal out of the Exif sub-IFD', () => {
    const { takenAt } = readExif(buildJpeg({ date: '2026:08:09 14:30:00' }));

    expect(takenAt).toBeDefined();
    const parsed = new Date(takenAt!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7); // August
    expect(parsed.getDate()).toBe(9);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  it('reads a big-endian file the same way', () => {
    // Byte order is per-file, not per-vendor; a reader that assumes one of them
    // silently returns nothing for half the cameras in the field.
    const little = readExif(buildJpeg({ bigEndian: false }));
    const big = readExif(buildJpeg({ bigEndian: true }));

    expect(big.takenAt).toBe(little.takenAt);
    expect(big.lat).toBeCloseTo(little.lat!, 6);
  });

  it('ignores the zero date a camera with a dead clock writes', () => {
    expect(readExif(buildJpeg({ date: '0000:00:00 00:00:00' })).takenAt).toBeUndefined();
  });
});

describe('reading GPS', () => {
  it('converts degrees, minutes and seconds to a decimal position', () => {
    const { lat, lng } = readExif(buildJpeg({ lat: [13, 44, 30], lng: [100, 30, 0] }));

    expect(lat).toBeCloseTo(13.741667, 5);
    expect(lng).toBeCloseTo(100.5, 5);
  });

  it('applies the hemisphere letters, which carry the sign', () => {
    // Dropping the ref puts a site in Bangkok on the wrong side of the equator
    // and of the meridian — the coordinates still look plausible, which is
    // what makes it dangerous.
    const { lat, lng } = readExif(
      buildJpeg({ lat: [13, 44, 30], lng: [100, 30, 0], latRef: 'S', lngRef: 'W' }),
    );

    expect(lat).toBeCloseTo(-13.741667, 5);
    expect(lng).toBeCloseTo(-100.5, 5);
  });

  it('returns a time on its own when the camera recorded no position', () => {
    const result = readExif(buildJpeg({ omitGps: true }));

    expect(result.takenAt).toBeDefined();
    expect(result.lat).toBeUndefined();
    expect(result.lng).toBeUndefined();
  });
});

describe('files that carry no usable metadata', () => {
  it('returns nothing for a JPEG with no EXIF segment', () => {
    // SOI, then straight to a scan.
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    expect(readExif(bare.buffer)).toEqual({});
  });

  it('returns nothing for a PNG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(readExif(png.buffer)).toEqual({});
  });

  it('returns nothing rather than throwing on a truncated file', () => {
    // A half-uploaded photo must still be attachable; losing the metadata is
    // acceptable, losing the photograph is not.
    const full = new Uint8Array(buildJpeg());
    for (const cut of [14, 30, 60, 100]) {
      expect(() => readExif(full.slice(0, cut).buffer)).not.toThrow();
    }
  });

  it('returns nothing for an empty buffer', () => {
    expect(readExif(new ArrayBuffer(0))).toEqual({});
  });
});
