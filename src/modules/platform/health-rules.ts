/**
 * What counts as healthy, and what merely counts as worrying.
 *
 * Pure, so the thresholds can be read and tested without a database — and
 * because the interesting question here is not "did the query run" but "how
 * far ahead does this system stop working, and does anybody know yet".
 *
 * ## The distinction the whole file turns on
 *
 * `DOWN` means the system cannot serve customers now. `WARN` means it will
 * stop on a date you can read off the screen. A monitor that pages for both
 * gets muted within a fortnight, and then the DOWN goes unread too — so only
 * DOWN sets the failing HTTP status, and WARN is for the people who can
 * actually act on it.
 */

export type HealthLevel = 'OK' | 'WARN' | 'DOWN';

export interface HealthCheck {
  key: string;
  labelTh: string;
  level: HealthLevel;
  /** What a person should read. Never a stack trace. */
  detailTh: string;
}

/** The worst of a set — one dead check makes the system dead. */
export function overallLevel(checks: HealthCheck[]): HealthLevel {
  if (checks.some((c) => c.level === 'DOWN')) return 'DOWN';
  if (checks.some((c) => c.level === 'WARN')) return 'WARN';
  return 'OK';
}

/**
 * How much runway the quota calendar has left.
 *
 * Buckets are materialised 90 days ahead by a nightly cron. If that cron
 * stops, nothing breaks today — bookings keep working off the buckets already
 * written — and then one morning the far end of the calendar arrives and
 * every customer is told the day is closed, with nothing in the logs to say
 * why. That silence is the failure mode this check exists for.
 */
export const QUOTA_RUNWAY_WARN_DAYS = 30;
export const QUOTA_RUNWAY_DOWN_DAYS = 7;

export function quotaRunwayCheck(daysAhead: number | null): HealthCheck {
  if (daysAhead === null) {
    return {
      key: 'quota-runway',
      labelTh: 'ปฏิทินโควตา',
      level: 'DOWN',
      detailTh: 'ไม่มีปฏิทินโควตาเลย — ลูกค้าจองไม่ได้ทั้งระบบ',
    };
  }
  if (daysAhead <= QUOTA_RUNWAY_DOWN_DAYS) {
    return {
      key: 'quota-runway',
      labelTh: 'ปฏิทินโควตา',
      level: 'DOWN',
      detailTh: `เหลืออีก ${daysAhead} วันจะไม่มีวันให้จอง — cron หยุดทำงานแล้ว`,
    };
  }
  if (daysAhead <= QUOTA_RUNWAY_WARN_DAYS) {
    return {
      key: 'quota-runway',
      labelTh: 'ปฏิทินโควตา',
      level: 'WARN',
      detailTh: `มีวันให้จองอีก ${daysAhead} วัน — ปกติควรอยู่ที่ 90 วัน`,
    };
  }
  return {
    key: 'quota-runway',
    labelTh: 'ปฏิทินโควตา',
    level: 'OK',
    detailTh: `มีวันให้จองล่วงหน้า ${daysAhead} วัน`,
  };
}

/**
 * Whether the holiday calendar still covers the days people can book.
 *
 * A year with no holidays on record does not fail loudly — it quietly treats
 * 1 January as an ordinary working day and dispatches technicians to it. The
 * check is deliberately generous about WHY a year is empty: the lunar dates
 * change annually and only the client can confirm them, so this is a reminder
 * addressed to a person, not a fault in the code.
 */
export function holidayCoverageCheck(params: {
  /** Last holiday on record, or null when there are none at all. */
  lastHolidayOn: Date | null;
  /** Furthest day a customer can currently book. */
  bookableUntil: Date | null;
  today: Date;
}): HealthCheck {
  const label = 'วันหยุดนักขัตฤกษ์';

  if (!params.lastHolidayOn) {
    return {
      key: 'holidays',
      labelTh: label,
      level: 'WARN',
      detailTh: 'ยังไม่มีวันหยุดในระบบเลย — ระบบจะรับงานทุกวันรวมวันหยุด',
    };
  }

  const until = params.bookableUntil ?? params.today;
  if (params.lastHolidayOn >= until) {
    return {
      key: 'holidays',
      labelTh: label,
      level: 'OK',
      detailTh: `ครอบคลุมถึง ${params.lastHolidayOn.toISOString().slice(0, 10)}`,
    };
  }

  const gapDays = Math.max(
    0,
    Math.round((until.getTime() - params.lastHolidayOn.getTime()) / 86_400_000),
  );
  return {
    key: 'holidays',
    labelTh: label,
    level: 'WARN',
    detailTh:
      `มีถึง ${params.lastHolidayOn.toISOString().slice(0, 10)} แต่เปิดจองถึง ` +
      `${until.toISOString().slice(0, 10)} — ขาดอยู่ ${gapDays} วัน ` +
      `(วันจันทรคติต้องให้ลูกค้ายืนยันรายปี ระบบเดาเองไม่ได้)`,
  };
}

/**
 * How old the newest backup is.
 *
 * Supabase's free plan takes none, so this measures the project's own export
 * script. A backup nobody has taken for a month is the same as no backup, and
 * the only moment anybody checks is the moment it is already too late.
 */
export const BACKUP_WARN_HOURS = 36;
export const BACKUP_DOWN_HOURS = 24 * 7;

export function backupCheck(ageHours: number | null): HealthCheck {
  const label = 'สำรองข้อมูล';
  if (ageHours === null) {
    return {
      key: 'backup',
      labelTh: label,
      level: 'WARN',
      detailTh: 'ยังไม่เคยสำรองข้อมูลเลย — รัน `npm run backup`',
    };
  }
  if (ageHours >= BACKUP_DOWN_HOURS) {
    return {
      key: 'backup',
      labelTh: label,
      level: 'DOWN',
      detailTh: `สำรองครั้งล่าสุดเมื่อ ${Math.round(ageHours / 24)} วันก่อน`,
    };
  }
  if (ageHours >= BACKUP_WARN_HOURS) {
    return {
      key: 'backup',
      labelTh: label,
      level: 'WARN',
      detailTh: `สำรองครั้งล่าสุดเมื่อ ${Math.round(ageHours)} ชั่วโมงก่อน`,
    };
  }
  return {
    key: 'backup',
    labelTh: label,
    level: 'OK',
    detailTh: `สำรองล่าสุดเมื่อ ${Math.round(ageHours)} ชั่วโมงก่อน`,
  };
}

/** Values still flagged as assumptions — a guess nobody has replaced. */
export function assumptionCheck(outstanding: string[]): HealthCheck {
  const label = 'ค่าที่ยังเป็นค่าประมาณ';
  if (outstanding.length === 0) {
    return { key: 'assumptions', labelTh: label, level: 'OK', detailTh: 'ยืนยันครบแล้ว' };
  }
  return {
    key: 'assumptions',
    labelTh: label,
    level: 'WARN',
    detailTh: `${outstanding.length} ค่ายังไม่ได้ยืนยัน — ${outstanding.slice(0, 4).join(', ')}${
      outstanding.length > 4 ? ' …' : ''
    }`,
  };
}
