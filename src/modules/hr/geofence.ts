/**
 * Deciding whether someone was where they said they were.
 *
 * Pure, and separate from the timeclock service, because this is the part that
 * decides whether a person gets paid — and a rule that decides that should be
 * readable and testable on its own rather than buried in a database write.
 *
 * ## The rule the client agreed, and why it is shaped this way
 *
 * **The anti-fraud measure is the location, not the QR code.** A code printed
 * and stuck on a wall gets photographed and posted to a group chat within the
 * first week. It proves the person had a picture of a wall. Coordinates are
 * what tie a punch to a place.
 *
 * **But a location check never refuses a punch.** A phone with location
 * switched off, a basement car park, an old handset — none of those are the
 * employee's fault, and an employee who cannot clock in does not get paid.
 * So the worst outcome here is a punch that is recorded AND flagged for a
 * supervisor to look at. Refusing is not one of the outcomes.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeofenceCheck {
  /** Where the phone says it is. Null when it would not say. */
  at: Coordinates | null;
  /** Metres of uncertainty the phone reported, if it did. */
  accuracyMetres?: number | null;
  office: Coordinates;
  radiusMetres: number;
}

export type GeofenceVerdict =
  /** Comfortably inside, and the phone was confident about it. */
  | 'INSIDE'
  /** Outside the radius. Recorded, and a supervisor is told. */
  | 'OUTSIDE'
  /** The phone gave nothing. Recorded, and a supervisor is told. */
  | 'NO_FIX'
  /**
   * Nominally inside, but the phone's own margin of error is wider than the
   * fence — so "inside" is not information. Treated as unverified rather than
   * as a pass, because a 2km accuracy circle contains the office from most of
   * the province.
   */
  | 'UNRELIABLE';

export interface GeofenceResult {
  verdict: GeofenceVerdict;
  /** Null when there was no fix to measure. */
  distanceMetres: number | null;
  /** True when a supervisor should look at this punch. */
  needsReview: boolean;
  /** Shown to the employee, so a flag is never a silent one. */
  reasonTh: string | null;
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a flat-earth approximation: the difference is
 * negligible over a 300m fence, but the same function is the obvious one to
 * reach for later when comparing a technician's punch against a customer site
 * across the province, and a subtly wrong distance there would be hard to
 * notice.
 */
export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True for a coordinate that could exist on Earth. */
export function isPlausibleCoordinate(c: Coordinates | null | undefined): c is Coordinates {
  return (
    !!c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180 &&
    // 0,0 is in the Atlantic and is what a broken sensor reports. Nobody
    // clocks in from there.
    !(c.lat === 0 && c.lng === 0)
  );
}

export function checkGeofence(input: GeofenceCheck): GeofenceResult {
  if (!isPlausibleCoordinate(input.at)) {
    return {
      verdict: 'NO_FIX',
      distanceMetres: null,
      needsReview: true,
      reasonTh: 'เครื่องไม่ได้ส่งตำแหน่ง — บันทึกเวลาให้แล้ว รอหัวหน้าตรวจสอบ',
    };
  }

  const distance = Math.round(distanceMetres(input.at, input.office));
  const accuracy = input.accuracyMetres ?? null;

  // Checked before the distance verdict: a fix this vague cannot support
  // either answer, and calling it a pass would make the fence decorative.
  const tooVague = accuracy !== null && Number.isFinite(accuracy) && accuracy > input.radiusMetres;

  if (distance > input.radiusMetres) {
    return {
      verdict: 'OUTSIDE',
      distanceMetres: distance,
      needsReview: true,
      reasonTh: `อยู่ห่างจุดสแกน ${formatDistance(distance)} — บันทึกเวลาให้แล้ว รอหัวหน้าตรวจสอบ`,
    };
  }

  if (tooVague) {
    return {
      verdict: 'UNRELIABLE',
      distanceMetres: distance,
      needsReview: true,
      reasonTh: 'สัญญาณตำแหน่งไม่แม่นพอจะยืนยันได้ — บันทึกเวลาให้แล้ว รอหัวหน้าตรวจสอบ',
    };
  }

  return { verdict: 'INSIDE', distanceMetres: distance, needsReview: false, reasonTh: null };
}

function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} กม.` : `${metres} ม.`;
}
