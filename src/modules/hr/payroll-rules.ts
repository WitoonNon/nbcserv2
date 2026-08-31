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

export interface PayslipInput {
  basis: WageBasis;
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
  const baseSatang = basePaySatang(input);

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
