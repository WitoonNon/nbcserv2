import { describe, it, expect } from 'vitest';
import {
  basePaySatang,
  buildPayslip,
  hourlyRateSatang,
  LEGAL_MINIMUM_MULTIPLIER,
  overtimeAmount,
  PayrollRuleError,
  toBaht,
  toSatang,
} from '../src/modules/hr/payroll-rules';

/**
 * Turning hours into money.
 *
 * Everything here is somebody's pay, so the cases are chosen for the ways it
 * could be wrong rather than for coverage: a rate read as the wrong kind, an
 * overtime multiplier below the legal floor, rounding that drifts across a
 * month of lines, a deduction that turns a wage negative.
 *
 * Pure functions, no database.
 */

const MONTHLY = { wageRate: 18_000, employmentType: 'MONTHLY' as const };
const DAILY = { wageRate: 500, employmentType: 'DAILY' as const };

describe('the hourly rate overtime is built on', () => {
  it('divides a monthly salary by 30 then by 8, per ม.68', () => {
    // 18,000 / 30 = 600 a day / 8 = 75 an hour.
    expect(toBaht(hourlyRateSatang(MONTHLY))).toBeCloseTo(75, 6);
  });

  it('uses 30 days regardless of the actual month', () => {
    // Dividing February by 28 would pay a higher hourly rate than March for
    // identical work.
    expect(hourlyRateSatang(MONTHLY)).toBeCloseTo(toSatang(18_000) / 30 / 8, 6);
  });

  it('divides a daily rate by 8', () => {
    expect(toBaht(hourlyRateSatang(DAILY))).toBeCloseTo(62.5, 6);
  });

  it('keeps monthly and daily apart', () => {
    // Reading 18,000 as a daily rate pays a year's salary in a fortnight.
    const asDaily = hourlyRateSatang({ wageRate: 18_000, employmentType: 'DAILY' });
    expect(asDaily).toBeGreaterThan(hourlyRateSatang(MONTHLY) * 20);
  });

  it('refuses a rate that cannot be one', () => {
    expect(() => hourlyRateSatang({ wageRate: 0, employmentType: 'DAILY' })).toThrow(
      PayrollRuleError,
    );
    expect(() => hourlyRateSatang({ wageRate: -1, employmentType: 'MONTHLY' })).toThrow();
  });
});

describe('overtime', () => {
  it('pays the statutory multiplier for each kind', () => {
    // 75/hr × 2 hours.
    expect(toBaht(overtimeAmount(MONTHLY, { kind: 'WORKDAY_OT', hours: 2 }).amountSatang))
      .toBeCloseTo(75 * 2 * 1.5, 2);
    expect(toBaht(overtimeAmount(MONTHLY, { kind: 'HOLIDAY_WORK', hours: 2 }).amountSatang))
      .toBeCloseTo(75 * 2 * 2, 2);
    expect(toBaht(overtimeAmount(MONTHLY, { kind: 'HOLIDAY_OT', hours: 2 }).amountSatang))
      .toBeCloseTo(75 * 2 * 3, 2);
  });

  it('lets an employer pay ABOVE the floor', () => {
    const generous = overtimeAmount(MONTHLY, { kind: 'WORKDAY_OT', hours: 1, multiplierOverride: 2 });

    expect(generous.multiplier).toBe(2);
    expect(generous.raisedToLegalMinimum).toBe(false);
  });

  it('raises anything below the floor, and says that it did', () => {
    // A rate below the statutory minimum is not a discount, it is an offence.
    // Silently paying what was typed would make the system the instrument.
    const underpaid = overtimeAmount(MONTHLY, {
      kind: 'WORKDAY_OT',
      hours: 1,
      multiplierOverride: 1,
    });

    expect(underpaid.multiplier).toBe(LEGAL_MINIMUM_MULTIPLIER.WORKDAY_OT);
    expect(underpaid.raisedToLegalMinimum).toBe(true);
    expect(toBaht(underpaid.amountSatang)).toBeCloseTo(75 * 1.5, 2);
  });

  it.each([
    ['WORKDAY_OT', 1.5],
    ['HOLIDAY_WORK', 2],
    ['HOLIDAY_OT', 3],
  ] as const)('never goes below the floor for %s', (kind, floor) => {
    const result = overtimeAmount(DAILY, { kind, hours: 3, multiplierOverride: 0.5 });
    expect(result.multiplier).toBe(floor);
  });

  it('ignores a nonsense multiplier rather than paying nothing', () => {
    const result = overtimeAmount(MONTHLY, {
      kind: 'WORKDAY_OT',
      hours: 1,
      multiplierOverride: Number.NaN,
    });
    expect(result.multiplier).toBe(1.5);
  });

  it('refuses hours that are not hours', () => {
    expect(() => overtimeAmount(MONTHLY, { kind: 'WORKDAY_OT', hours: 0 })).toThrow(
      PayrollRuleError,
    );
    expect(() => overtimeAmount(MONTHLY, { kind: 'WORKDAY_OT', hours: -2 })).toThrow();
  });

  it('handles a half hour without losing satang', () => {
    // 62.5/hr × 0.5 × 1.5 = 46.875 → 46.88
    const result = overtimeAmount(DAILY, { kind: 'WORKDAY_OT', hours: 0.5 });
    expect(result.amountSatang).toBe(4688);
  });
});

describe('base pay', () => {
  it('pays a daily worker for the days they worked', () => {
    expect(toBaht(basePaySatang({ basis: DAILY, daysWorked: 22, unpaidLeaveDays: 0 })))
      .toBeCloseTo(11_000, 2);
  });

  it('does not deduct unpaid leave twice from a daily worker', () => {
    // They simply have no day to be paid for; deducting as well would charge
    // them for not working.
    const worked = basePaySatang({ basis: DAILY, daysWorked: 20, unpaidLeaveDays: 2 });
    expect(toBaht(worked)).toBeCloseTo(10_000, 2);
  });

  it('pays a monthly worker the month', () => {
    expect(toBaht(basePaySatang({ basis: MONTHLY, daysWorked: 22, unpaidLeaveDays: 0 })))
      .toBeCloseTo(18_000, 2);
  });

  it('deducts unpaid leave from a monthly worker at the ม.68 daily rate', () => {
    // 18,000 − (600 × 3) = 16,200. The same divisor as overtime, so the two
    // cannot disagree about what a day of that salary is worth.
    expect(toBaht(basePaySatang({ basis: MONTHLY, daysWorked: 19, unpaidLeaveDays: 3 })))
      .toBeCloseTo(16_200, 2);
  });

  it('never turns a wage negative', () => {
    // A month of unpaid leave zeroes the pay. It does not invoice the employee.
    expect(basePaySatang({ basis: MONTHLY, daysWorked: 0, unpaidLeaveDays: 60 })).toBe(0);
  });
});

describe('the whole payslip', () => {
  it('adds base, overtime and allowances, then takes deductions', () => {
    const slip = buildPayslip({
      basis: MONTHLY,
      daysWorked: 22,
      unpaidLeaveDays: 0,
      overtime: [
        { kind: 'WORKDAY_OT', hours: 10 },
        { kind: 'HOLIDAY_OT', hours: 4 },
      ],
      additions: [{ label: 'ค่าเดินทาง', amount: 1_000 }],
      deductions: [{ label: 'เบิกล่วงหน้า', amount: 2_000 }],
    });

    // 18,000 + (75×10×1.5 = 1,125) + (75×4×3 = 900) + 1,000 − 2,000
    expect(toBaht(slip.baseSatang)).toBeCloseTo(18_000, 2);
    expect(toBaht(slip.overtimeSatang)).toBeCloseTo(2_025, 2);
    expect(toBaht(slip.netSatang)).toBeCloseTo(19_025, 2);
  });

  it('totals exactly what the printed lines add up to', () => {
    // Rounding per line and then summing is what a payslip shows; rounding
    // only at the end would print lines that do not add up to the total.
    const slip = buildPayslip({
      basis: DAILY,
      daysWorked: 20,
      unpaidLeaveDays: 0,
      overtime: [
        { kind: 'WORKDAY_OT', hours: 1.5 },
        { kind: 'WORKDAY_OT', hours: 2.25 },
        { kind: 'HOLIDAY_WORK', hours: 3.75 },
      ],
    });

    const summed = slip.overtime.reduce((t, l) => t + l.amountSatang, 0);
    expect(slip.overtimeSatang).toBe(summed);
    expect(slip.netSatang).toBe(slip.baseSatang + summed);
  });

  it('reports when any line had to be raised to the legal floor', () => {
    const slip = buildPayslip({
      basis: MONTHLY,
      daysWorked: 22,
      unpaidLeaveDays: 0,
      overtime: [
        { kind: 'WORKDAY_OT', hours: 2 },
        { kind: 'HOLIDAY_OT', hours: 1, multiplierOverride: 1.2 },
      ],
    });

    // The payslip has to be able to say it, or the number silently differs
    // from what the office entered.
    expect(slip.anyRaisedToLegalMinimum).toBe(true);
  });

  it('does not pay a negative wage however large the deductions', () => {
    const slip = buildPayslip({
      basis: DAILY,
      daysWorked: 1,
      unpaidLeaveDays: 0,
      overtime: [],
      deductions: [{ label: 'เบิกล่วงหน้า', amount: 99_999 }],
    });
    expect(slip.netSatang).toBe(0);
  });

  it('works with no overtime at all, which is the common case', () => {
    const slip = buildPayslip({
      basis: MONTHLY,
      daysWorked: 22,
      unpaidLeaveDays: 0,
      overtime: [],
    });
    expect(toBaht(slip.netSatang)).toBeCloseTo(18_000, 2);
    expect(slip.anyRaisedToLegalMinimum).toBe(false);
  });
});

describe('money arithmetic', () => {
  it('does not accumulate floating-point error across a month of lines', () => {
    // 0.1 + 0.2 arithmetic on wages drifts; in satang it cannot.
    const lines = Array.from({ length: 30 }, () => ({ kind: 'WORKDAY_OT' as const, hours: 1.1 }));
    const slip = buildPayslip({
      basis: DAILY,
      daysWorked: 0,
      unpaidLeaveDays: 0,
      overtime: lines,
    });

    const perLine = Math.round((toSatang(500) / 8) * 1.1 * 1.5);
    expect(slip.overtimeSatang).toBe(perLine * 30);
    expect(Number.isInteger(slip.overtimeSatang)).toBe(true);
  });
});
