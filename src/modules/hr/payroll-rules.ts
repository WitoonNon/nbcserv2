import type { EmploymentType } from '@/generated/prisma';

/**
 * Turning hours into money.
 *
 * Pure and on its own, because this is where wrong pay comes from. Every rule
 * below is either the law or a decision the client made, and both need to be
 * readable by somebody who is not going to read the service around them.
 *
 * ## Nothing here rounds in the employer's favour by accident
 *
 * Money is computed in satang (integers) and only presented as baht. Doing it
 * in floating-point baht means 0.1 + 0.2 arithmetic on somebody's wages, and
 * the error compounds across a month of overtime lines.
 */

/** Normal working hours in a day, used to derive an hourly rate. */
export const STANDARD_HOURS_PER_DAY = 8;

/**
 * Days a monthly salary is divided by to reach a daily rate.
 *
 * 30, per พ.ร.บ.คุ้มครองแรงงาน ม.68 — not the actual number of days in the
 * month. A February computed on 28 would pay a higher hourly rate than a
 * March computed on 31 for identical work.
 */
export const MONTHLY_DIVISOR_DAYS = 30;

export type OvertimeKind =
  /** เกินเวลาทำงานปกติในวันทำงาน — ม.61 */
  | 'WORKDAY_OT'
  /** ทำงานในวันหยุด — ม.62 */
  | 'HOLIDAY_WORK'
  /** เกินเวลาทำงานปกติในวันหยุด — ม.63 */
  | 'HOLIDAY_OT';

/**
 * The lowest multiplier the law allows for each kind.
 *
 * A rate below these is not a discount, it is an offence, so the calculator
 * raises anything lower rather than trusting a number typed into a form.
 *
 * ⚠️ One simplification the client should be asked about: ม.62 sets the
 * holiday-work floor at 1× extra for staff who are already paid for that
 * holiday (monthly) and 2× for staff who are not (daily). A flat 2× is used
 * here because the client specified 1.5 / 2 / 3. It is never below the legal
 * floor for either group — but it pays monthly staff more than the law
 * requires on holidays, which costs money and should be a decision rather
 * than an accident.
 */
export const LEGAL_MINIMUM_MULTIPLIER: Record<OvertimeKind, number> = {
  WORKDAY_OT: 1.5,
  HOLIDAY_WORK: 2,
  HOLIDAY_OT: 3,
};

export const OVERTIME_LABEL_TH: Record<OvertimeKind, string> = {
  WORKDAY_OT: 'โอทีวันทำงาน (1.5 เท่า)',
  HOLIDAY_WORK: 'ทำงานวันหยุด (2 เท่า)',
  HOLIDAY_OT: 'โอทีวันหยุด (3 เท่า)',
};

/**
 * What an employee may pick on the request form.
 *
 * The client asked for holiday overtime to be taken off the list on
 * 2 ก.ย. 2569 — they do not run it, and an option nobody should choose is an
 * option somebody eventually chooses by mistake.
 *
 * It is removed from the form, not from the system. HOLIDAY_OT stays in the
 * enum, in LEGAL_MINIMUM_MULTIPLIER and in the calculator, because dropping a
 * value that approved rows may point at turns their history into an error —
 * and because ม.63 does not stop applying just because the form stopped
 * offering it. If the client ever works a holiday past normal hours, the rate
 * is still here and correct.
 */
export const SELECTABLE_OVERTIME_KINDS: OvertimeKind[] = ['WORKDAY_OT', 'HOLIDAY_WORK'];

export class PayrollRuleError extends Error {}

/** Baht as an integer number of satang. */
export function toSatang(baht: number): number {
  return Math.round(baht * 100);
}

export function toBaht(satang: number): number {
  return satang / 100;
}

export interface WageBasis {
  wageRate: number;
  employmentType: EmploymentType;
}

/**
 * The hourly rate overtime is calculated from, in satang.
 *
 * A monthly salary and a daily rate are not comparable numbers, which is why
 * `employmentType` travels with every wage record — reading 18,000 as a daily
 * rate would pay someone a year's salary in a fortnight.
 */
export function hourlyRateSatang(basis: WageBasis): number {
  if (!Number.isFinite(basis.wageRate) || basis.wageRate <= 0) {
    throw new PayrollRuleError('ค่าแรงต้องมากกว่าศูนย์');
  }

  const dailySatang =
    basis.employmentType === 'MONTHLY'
      ? toSatang(basis.wageRate) / MONTHLY_DIVISOR_DAYS
      : toSatang(basis.wageRate);

  return dailySatang / STANDARD_HOURS_PER_DAY;
}

export interface OvertimeLine {
  kind: OvertimeKind;
  hours: number;
  /** Only ever used when it is ABOVE the legal floor. */
  multiplierOverride?: number | null;
}

export interface OvertimeResult {
  kind: OvertimeKind;
  hours: number;
  multiplier: number;
  /** True when a supplied multiplier was below the floor and was raised. */
  raisedToLegalMinimum: boolean;
  amountSatang: number;
}

/**
 * What one overtime line is worth.
 *
 * The multiplier can be set higher than the law — a company may pay better —
 * but never lower. A number below the floor is corrected and the correction
 * is reported, so a payslip can say it happened rather than quietly differing
 * from what somebody entered.
 */
export function overtimeAmount(basis: WageBasis, line: OvertimeLine): OvertimeResult {
  if (!Number.isFinite(line.hours) || line.hours <= 0) {
    throw new PayrollRuleError('จำนวนชั่วโมงโอทีต้องมากกว่าศูนย์');
  }

  const floor = LEGAL_MINIMUM_MULTIPLIER[line.kind];
  const asked = line.multiplierOverride;
  const usable = typeof asked === 'number' && Number.isFinite(asked) ? asked : floor;

  const multiplier = Math.max(usable, floor);
  const raisedToLegalMinimum = usable < floor;

  const hourly = hourlyRateSatang(basis);
  // Rounded per line, because a payslip shows lines and its total has to be
  // the sum of what is printed on it.
  const amountSatang = Math.round(hourly * line.hours * multiplier);

  return { kind: line.kind, hours: line.hours, multiplier, raisedToLegalMinimum, amountSatang };
}

export interface BasePayInput {
  basis: WageBasis;
  /** Days actually worked. Only used for daily-rate staff. */
  daysWorked: number;
  /** Days of unpaid leave taken in the period. Deducted for monthly staff. */
  unpaidLeaveDays: number;
}

/**
 * The base pay before overtime.
 *
 * Daily staff are paid for days worked. Monthly staff are paid the month and
 * have unpaid leave deducted at the ม.68 daily rate — the same divisor used
 * for overtime, so the two cannot disagree about what a day of that salary is
 * worth.
 */
export function basePaySatang(input: BasePayInput): number {
  const { basis, daysWorked, unpaidLeaveDays } = input;
  if (!Number.isFinite(basis.wageRate) || basis.wageRate < 0) {
    throw new PayrollRuleError('ค่าแรงไม่ถูกต้อง');
  }

  if (basis.employmentType === 'DAILY') {
    if (daysWorked < 0) throw new PayrollRuleError('จำนวนวันทำงานติดลบไม่ได้');
    // Unpaid leave needs no deduction here: a daily-rate employee who did not
    // work simply has no day to be paid for.
    return Math.round(toSatang(basis.wageRate) * daysWorked);
  }

  const monthly = toSatang(basis.wageRate);
  const perDay = monthly / MONTHLY_DIVISOR_DAYS;
  const deduction = Math.round(perDay * Math.max(0, unpaidLeaveDays));

  // Never negative: a month of unpaid leave zeroes the pay, it does not
  // invoice the employee.
  return Math.max(0, monthly - deduction);
}

/**
 * One stretch of the period during which the wage did not change.
 *
 * Payroll used to resolve a single rate for a whole period, taken on its last
 * day. That is right for the common case — a raise entered in October must not
 * reprice a September run — and wrong for a raise that takes effect *inside*
 * the period, which was then applied to the days before it as well.
 *
 * On an 18,000 salary raised to 30,000 on the 15th of a 30-day month, the
 * whole month was paid at 30,000: about 5,600 baht of overpayment, per person,
 * per mid-period raise, with nothing on the payslip to show it.
 */
export interface WageSegment {
  wageRate: number;
  employmentType: EmploymentType;
  /** Calendar days of the period this rate covered. */
  calendarDays: number;
  /** Days actually worked within it. Daily staff only. */
  daysWorked: number;
}

export interface SegmentedBasePayInput {
  segments: WageSegment[];
  /** Calendar days in the whole period — the denominator for a monthly share. */
  periodDays: number;
  unpaidLeaveDays: number;
}

/**
 * Base pay across a period whose wage may have changed part-way through.
 *
 * Daily staff are paid each day at the rate in force that day. Monthly staff
 * have the salary apportioned by how much of the period each rate covered, so
 * a full period on one rate still pays exactly that rate and nothing is
 * introduced for the ordinary case.
 *
 * Unpaid leave is deducted at the period's weighted daily rate rather than at
 * one segment's. The system records how many unpaid days were taken, not which
 * calendar days they fell on, so attributing them to a segment would be a
 * guess — and a guess that changes someone's pay depending on which way it
 * went. The weighted rate is the honest reading of what is known.
 */
export function segmentedBasePaySatang(input: SegmentedBasePayInput): number {
  const { segments, periodDays, unpaidLeaveDays } = input;
  if (segments.length === 0) throw new PayrollRuleError('ไม่มีข้อมูลค่าแรงในงวดนี้');
  if (periodDays <= 0) throw new PayrollRuleError('ช่วงเวลาของงวดไม่ถูกต้อง');

  for (const seg of segments) {
    if (!Number.isFinite(seg.wageRate) || seg.wageRate < 0) {
      throw new PayrollRuleError('ค่าแรงไม่ถูกต้อง');
    }
    if (seg.daysWorked < 0) throw new PayrollRuleError('จำนวนวันทำงานติดลบไม่ได้');
  }

  const daily = segments.filter((s) => s.employmentType === 'DAILY');
  if (daily.length === segments.length) {
    // No unpaid-leave deduction: a daily-rate employee who did not work simply
    // has no day to be paid for.
    return Math.round(
      segments.reduce((sum, s) => sum + toSatang(s.wageRate) * s.daysWorked, 0),
    );
  }

  // Mixed daily/monthly inside one period would mean the employment type
  // changed part-way through. Each segment is still paid on its own terms.
  let earned = 0;
  for (const seg of segments) {
    if (seg.employmentType === 'DAILY') {
      earned += toSatang(seg.wageRate) * seg.daysWorked;
    } else {
      earned += (toSatang(seg.wageRate) * seg.calendarDays) / periodDays;
    }
  }

  // Weighted daily rate for the deduction — see the note above.
  const weightedMonthly = segments
    .filter((s) => s.employmentType === 'MONTHLY')
    .reduce((sum, s) => sum + (toSatang(s.wageRate) * s.calendarDays) / periodDays, 0);
  const perDay = weightedMonthly / MONTHLY_DIVISOR_DAYS;
  const deduction = perDay * Math.max(0, unpaidLeaveDays);

  // Never negative: a period of unpaid leave zeroes the pay, it does not
  // invoice the employee.
  return Math.max(0, Math.round(earned - deduction));
}

export interface PayslipInput {
  basis: WageBasis;
  /**
   * The period split by wage changes. When absent, `basis` and `daysWorked`
   * are used as a single segment — the shape every caller had before
   * mid-period raises were handled.
   */
  segments?: WageSegment[];
  /** Calendar days in the period. Required alongside `segments`. */
  periodDays?: number;
  daysWorked: number;
  unpaidLeaveDays: number;
  overtime: OvertimeLine[];
  /** Additions the office entered — allowance, bonus. Baht. */
  additions?: { label: string; amount: number }[];
  /** Deductions the office entered — advance, damage. Baht. */
  deductions?: { label: string; amount: number }[];
}

export interface Payslip {
  baseSatang: number;
  overtime: OvertimeResult[];
  overtimeSatang: number;
  additionsSatang: number;
  deductionsSatang: number;
  /** What the employee is paid, before statutory withholding. */
  netSatang: number;
  /**
   * True when any overtime line was entered below the legal floor and raised.
   * Surfaced so the payslip and the office screen can both say so.
   */
  anyRaisedToLegalMinimum: boolean;
}

/**
 * The whole payslip.
 *
 * ⚠️ `netSatang` is BEFORE social security and withholding tax. Neither is
 * modelled — the client has not provided rates, and guessing at a statutory
 * deduction is worse than not showing one. Anything that prints this number
 * must say so, or the employee reads it as what lands in their account.
 */
export function buildPayslip(input: PayslipInput): Payslip {
  const baseSatang =
    input.segments && input.segments.length > 0 && input.periodDays
      ? segmentedBasePaySatang({
          segments: input.segments,
          periodDays: input.periodDays,
          unpaidLeaveDays: input.unpaidLeaveDays,
        })
      : basePaySatang(input);

  const overtime = input.overtime.map((line) => overtimeAmount(input.basis, line));
  const overtimeSatang = overtime.reduce((sum, line) => sum + line.amountSatang, 0);

  const additionsSatang = (input.additions ?? []).reduce(
    (sum, item) => sum + toSatang(item.amount),
    0,
  );
  const deductionsSatang = (input.deductions ?? []).reduce(
    (sum, item) => sum + toSatang(item.amount),
    0,
  );

  const netSatang = Math.max(
    0,
    baseSatang + overtimeSatang + additionsSatang - deductionsSatang,
  );

  return {
    baseSatang,
    overtime,
    overtimeSatang,
    additionsSatang,
    deductionsSatang,
    netSatang,
    anyRaisedToLegalMinimum: overtime.some((line) => line.raisedToLegalMinimum),
  };
}

/** Baht, formatted the way a payslip shows it. */
export function formatBaht(satang: number): string {
  return toBaht(satang).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
