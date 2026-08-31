import { describe, it, expect } from 'vitest';
import {
  checkGeofence,
  distanceMetres,
  isPlausibleCoordinate,
} from '../src/modules/hr/geofence';

/**
 * Whether someone was where they said they were.
 *
 * This decides whether a person gets paid, so the rules under test are as much
 * about what must NOT happen as what must: a location check never refuses a
 * punch, and a fix too vague to mean anything is never read as a pass.
 *
 * Pure functions, no database.
 */

/** The scan point seeded from the client's address — ต.ละหาร, บางบัวทอง. */
const OFFICE = { lat: 13.968264, lng: 100.404581 };
const RADIUS = 300;

/** Move north by a known number of metres. 1° of latitude ≈ 111,320 m. */
function northOf(from: { lat: number; lng: number }, metres: number) {
  return { lat: from.lat + metres / 111_320, lng: from.lng };
}

describe('measuring distance', () => {
  it('is zero at the same point', () => {
    expect(distanceMetres(OFFICE, OFFICE)).toBeCloseTo(0, 5);
  });

  it('measures a known offset to within a metre', () => {
    expect(distanceMetres(OFFICE, northOf(OFFICE, 250))).toBeCloseTo(250, 0);
  });

  it('is symmetric', () => {
    const other = northOf(OFFICE, 400);
    expect(distanceMetres(OFFICE, other)).toBeCloseTo(distanceMetres(other, OFFICE), 6);
  });

  it('handles a long distance without falling apart', () => {
    // Bangkok to Chiang Mai is about 580 km as the crow flies.
    const chiangMai = { lat: 18.7883, lng: 98.9853 };
    const km = distanceMetres(OFFICE, chiangMai) / 1000;
    expect(km).toBeGreaterThan(550);
    expect(km).toBeLessThan(620);
  });
});

describe('coordinates worth believing', () => {
  it('rejects the null island a broken sensor reports', () => {
    // 0,0 is in the Atlantic. Nobody clocks in from there, and treating it as
    // a real fix would put every such punch thousands of km outside the fence
    // instead of flagging it as no fix at all.
    expect(isPlausibleCoordinate({ lat: 0, lng: 0 })).toBe(false);
  });

  it('rejects impossible values', () => {
    expect(isPlausibleCoordinate({ lat: 91, lng: 100 })).toBe(false);
    expect(isPlausibleCoordinate({ lat: 13, lng: 181 })).toBe(false);
    expect(isPlausibleCoordinate({ lat: Number.NaN, lng: 100 })).toBe(false);
    expect(isPlausibleCoordinate(null)).toBe(false);
  });

  it('accepts an ordinary Thai coordinate', () => {
    expect(isPlausibleCoordinate(OFFICE)).toBe(true);
  });
});

describe('checking the fence', () => {
  it('passes someone standing at the scan point', () => {
    const result = checkGeofence({ at: OFFICE, accuracyMetres: 10, office: OFFICE, radiusMetres: RADIUS });

    expect(result.verdict).toBe('INSIDE');
    expect(result.needsReview).toBe(false);
    expect(result.reasonTh).toBeNull();
  });

  it('passes someone just inside the radius', () => {
    const result = checkGeofence({
      at: northOf(OFFICE, 290), accuracyMetres: 15, office: OFFICE, radiusMetres: RADIUS,
    });
    expect(result.verdict).toBe('INSIDE');
  });

  it('flags someone outside, and still records the punch', () => {
    const result = checkGeofence({
      at: northOf(OFFICE, 1200), accuracyMetres: 10, office: OFFICE, radiusMetres: RADIUS,
    });

    expect(result.verdict).toBe('OUTSIDE');
    expect(result.needsReview).toBe(true);
    // The distance is in the message: a supervisor deciding what to do needs
    // to know whether it was 400 metres or four kilometres.
    expect(result.reasonTh).toContain('1.2 กม.');
  });

  it('never refuses a punch when the phone gave no location', () => {
    // A phone with location off, an old handset, a basement car park. None of
    // those are the employee's fault, and an employee who cannot clock in does
    // not get paid.
    const result = checkGeofence({ at: null, office: OFFICE, radiusMetres: RADIUS });

    expect(result.verdict).toBe('NO_FIX');
    expect(result.needsReview).toBe(true);
    expect(result.reasonTh).toContain('บันทึกเวลาให้แล้ว');
  });

  it('does not read a vague fix as a pass', () => {
    // Nominally at the office, but the phone says it could be anywhere within
    // two kilometres — which contains the office from most of the district.
    const result = checkGeofence({
      at: OFFICE, accuracyMetres: 2000, office: OFFICE, radiusMetres: RADIUS,
    });

    expect(result.verdict).toBe('UNRELIABLE');
    expect(result.needsReview).toBe(true);
  });

  it('still reports OUTSIDE when a vague fix is also plainly far away', () => {
    // Vagueness does not excuse being 5 km off; the more specific answer is
    // the more useful one for a supervisor.
    const result = checkGeofence({
      at: northOf(OFFICE, 5000), accuracyMetres: 2000, office: OFFICE, radiusMetres: RADIUS,
    });
    expect(result.verdict).toBe('OUTSIDE');
  });

  it('accepts a fix whose accuracy is tighter than the fence', () => {
    const result = checkGeofence({
      at: northOf(OFFICE, 100), accuracyMetres: 250, office: OFFICE, radiusMetres: RADIUS,
    });
    expect(result.verdict).toBe('INSIDE');
  });

  it('works when the phone reports no accuracy at all', () => {
    // Some browsers omit it. Absent is not the same as bad.
    const result = checkGeofence({ at: OFFICE, office: OFFICE, radiusMetres: RADIUS });
    expect(result.verdict).toBe('INSIDE');
  });

  it('tightening the radius is the only change needed to tighten the rule', () => {
    // The seeded 300 m is a guess from the centre of the sub-district and is
    // meant to come down to 50–100 m once somebody stands at the scan point.
    const at = northOf(OFFICE, 200);

    expect(checkGeofence({ at, accuracyMetres: 10, office: OFFICE, radiusMetres: 300 }).verdict)
      .toBe('INSIDE');
    expect(checkGeofence({ at, accuracyMetres: 10, office: OFFICE, radiusMetres: 100 }).verdict)
      .toBe('OUTSIDE');
  });

  it('reports metres below a kilometre and kilometres above', () => {
    const near = checkGeofence({
      at: northOf(OFFICE, 450), accuracyMetres: 10, office: OFFICE, radiusMetres: RADIUS,
    });
    expect(near.reasonTh).toMatch(/\d+ ม\./);
  });
});
