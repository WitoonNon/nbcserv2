/**
 * Minimal EXIF reader — capture time and GPS only.
 *
 * Why this exists: the browser downscales every photo through a canvas before
 * upload, and a canvas re-encode drops EXIF entirely. Without reading it first,
 * Attachment.exifTakenAt and its GPS columns could never be filled, and the
 * question they exist to answer — "was the technician actually there, and
 * when?" — would have no answer.
 *
 * Why it is hand-written: a general EXIF library carries orientation, maker
 * notes, thumbnails and IPTC. Four tags out of two IFDs is less code than the
 * wrapper around a dependency would be, and it never has to be upgraded.
 *
 * Runs on the client, so what it returns is only as honest as the file it was
 * given. That is inherent to reading metadata from an uploaded file at all —
 * the alternative is uploading the untouched original so the server can read
 * it, which is the 4–8 MB the downscale exists to avoid. Treat these values as
 * what the camera claimed, not as proof.
 */

export interface ExifData {
  /** DateTimeOriginal, as an ISO string. Absent when the tag is missing. */
  takenAt?: string;
  lat?: number;
  lng?: number;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;

const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LNG_REF = 0x0003;
const GPS_LNG = 0x0004;

/** Bytes per component, indexed by the TIFF type code. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

interface Entry {
  type: number;
  count: number;
  /** Offset of the value, already resolved past the inline/indirect rule. */
  valueOffset: number;
}

/** Read the IFD at `offset`, returning its entries by tag. */
function readIfd(view: DataView, tiffStart: number, offset: number, le: boolean): Map<number, Entry> {
  const entries = new Map<number, Entry>();
  if (offset + 2 > view.byteLength) return entries;

  const count = view.getUint16(offset, le);
  for (let i = 0; i < count; i += 1) {
    const at = offset + 2 + i * 12;
    if (at + 12 > view.byteLength) break;

    const tag = view.getUint16(at, le);
    const type = view.getUint16(at + 2, le);
    const componentCount = view.getUint32(at + 4, le);
    const bytes = (TYPE_SIZE[type] ?? 0) * componentCount;

    // A value of four bytes or fewer sits in the entry itself; anything larger
    // is an offset from the start of the TIFF header.
    const valueOffset = bytes <= 4 ? at + 8 : tiffStart + view.getUint32(at + 8, le);
    entries.set(tag, { type, count: componentCount, valueOffset });
  }
  return entries;
}

function readAscii(view: DataView, entry: Entry): string {
  const end = Math.min(entry.valueOffset + entry.count, view.byteLength);
  let out = '';
  for (let i = entry.valueOffset; i < end; i += 1) {
    const code = view.getUint8(i);
    if (code === 0) break; // NUL-terminated
    out += String.fromCharCode(code);
  }
  return out;
}

/** RATIONAL is a numerator/denominator pair of unsigned longs. */
function readRational(view: DataView, offset: number, le: boolean): number {
  const numerator = view.getUint32(offset, le);
  const denominator = view.getUint32(offset + 4, le);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** GPS coordinates are stored as three rationals: degrees, minutes, seconds. */
function readCoordinate(view: DataView, entry: Entry, le: boolean): number | undefined {
  if (entry.count < 3 || entry.valueOffset + 24 > view.byteLength) return undefined;
  const degrees = readRational(view, entry.valueOffset, le);
  const minutes = readRational(view, entry.valueOffset + 8, le);
  const seconds = readRational(view, entry.valueOffset + 16, le);
  return degrees + minutes / 60 + seconds / 3600;
}

/**
 * EXIF spells the date `YYYY:MM:DD HH:MM:SS`, with no timezone. It is local
 * time on the camera, which in this business is Bangkok — but rather than bake
 * that in, the value is kept as written and interpreted as local time by the
 * runtime reading it.
 */
function parseExifDate(raw: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return undefined;

  const [, year, month, day, hour, minute, second] = m;
  const date = new Date(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second),
  );
  // Cameras with a dead clock write 0000:00:00, which is not a date.
  return Number.isNaN(date.getTime()) || date.getFullYear() < 1900 ? undefined : date.toISOString();
}

/** Locate the APP1 segment's TIFF header, or -1 when the file carries no EXIF. */
function findTiffStart(view: DataView): number {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return -1; // not a JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return -1; // out of step with the markers
    const marker = view.getUint8(offset + 1);

    // Start of scan — image data from here on, no more metadata.
    if (marker === 0xda) return -1;

    const length = view.getUint16(offset + 2);
    if (length < 2) return -1;

    if (marker === 0xe1 && offset + 10 <= view.byteLength) {
      // "Exif\0\0" precedes the TIFF header.
      const isExif =
        view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0x0000;
      if (isExif) return offset + 10;
    }
    offset += 2 + length;
  }
  return -1;
}

/**
 * Extract capture time and GPS from a JPEG.
 *
 * Never throws: a photo whose metadata cannot be read is still a photo worth
 * attaching, so every failure path returns an empty result.
 */
export function readExif(buffer: ArrayBuffer): ExifData {
  try {
    const view = new DataView(buffer);
    const tiffStart = findTiffStart(view);
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return {};

    const byteOrder = view.getUint16(tiffStart);
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return {};
    const le = byteOrder === 0x4949; // "II" little-endian, "MM" big-endian

    if (view.getUint16(tiffStart + 2, le) !== 0x002a) return {};

    const ifd0 = readIfd(view, tiffStart, tiffStart + view.getUint32(tiffStart + 4, le), le);
    const result: ExifData = {};

    // DateTimeOriginal lives in the Exif sub-IFD, not IFD0.
    const exifPointer = ifd0.get(TAG_EXIF_IFD);
    if (exifPointer) {
      // A pointer's value is relative to the TIFF header; readIfd wants an
      // offset into the file.
      const exifIfd = readIfd(
        view, tiffStart, tiffStart + view.getUint32(exifPointer.valueOffset, le), le,
      );
      const dateEntry = exifIfd.get(TAG_DATE_TIME_ORIGINAL);
      if (dateEntry) {
        const takenAt = parseExifDate(readAscii(view, dateEntry));
        if (takenAt) result.takenAt = takenAt;
      }
    }

    const gpsPointer = ifd0.get(TAG_GPS_IFD);
    if (gpsPointer) {
      const gps = readIfd(
        view, tiffStart, tiffStart + view.getUint32(gpsPointer.valueOffset, le), le,
      );

      const latEntry = gps.get(GPS_LAT);
      const lngEntry = gps.get(GPS_LNG);
      const latRef = gps.get(GPS_LAT_REF);
      const lngRef = gps.get(GPS_LNG_REF);

      if (latEntry && lngEntry) {
        const lat = readCoordinate(view, latEntry, le);
        const lng = readCoordinate(view, lngEntry, le);
        if (lat !== undefined && lng !== undefined) {
          // The reference letter carries the sign; without it a southern
          // latitude reads as a northern one.
          result.lat = latRef && readAscii(view, latRef).toUpperCase() === 'S' ? -lat : lat;
          result.lng = lngRef && readAscii(view, lngRef).toUpperCase() === 'W' ? -lng : lng;
        }
      }
    }

    return result;
  } catch {
    // Malformed metadata must never cost the technician the photograph.
    return {};
  }
}
