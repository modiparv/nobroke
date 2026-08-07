/**
 * Money and unit precision (spec §6.20).
 *
 * Rule: store units to 4dp and amounts to 2dp, and never round intermediate
 * steps. Rounding is therefore applied ONLY at persistence and display
 * boundaries — engines pass full-precision numbers between each other.
 *
 * We use float64 in rupees rather than integer paise. Household balance sheets
 * sit well inside float64's ~15 significant digits, and every cross-source
 * equality check in this module is tolerance-based (see `UNITS_TOLERANCE` /
 * `VALUE_TOLERANCE_PCT`, spec §2.3) rather than exact, so binary representation
 * error cannot produce a false reconciliation break.
 */

export const UNIT_DP = 4;
export const AMOUNT_DP = 2;

/** Units must agree within 0.001 units (spec §2.3). */
export const UNITS_TOLERANCE = 0.001;
/** Computed value must agree with the statement within 0.5% (spec §2.3). */
export const VALUE_TOLERANCE_PCT = 0.005;

/**
 * Half-away-from-zero rounding, corrected for binary representation error.
 * Plain `Math.round(1.005 * 100)` yields 100 because 1.005 is stored as
 * 1.00499999999999989; the relative nudge fixes that without over-rounding.
 */
export function roundTo(value: number, dp: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** dp;
  const scaled = value * factor;
  const magnitude = Math.abs(scaled);
  const rounded = Math.round(magnitude + magnitude * Number.EPSILON);
  return (scaled < 0 ? -rounded : rounded) / factor;
}

/** Round a unit quantity for storage/display (4dp). */
export function roundUnits(units: number): number {
  return roundTo(units, UNIT_DP);
}

/** Round a rupee amount for storage/display (2dp). */
export function roundAmount(amount: number): number {
  return roundTo(amount, AMOUNT_DP);
}

/** True when two unit quantities agree inside the reconciliation tolerance. */
export function unitsMatch(a: number, b: number, tolerance = UNITS_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * True when two rupee amounts agree inside the relative tolerance. Falls back
 * to an absolute paisa comparison when the expected value is zero.
 */
export function valueMatch(actual: number, expected: number, tolerancePct = VALUE_TOLERANCE_PCT): boolean {
  if (expected === 0) return Math.abs(actual) <= 0.01;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerancePct;
}

/** Signed relative difference, used to describe a reconciliation break. */
export function relativeDiff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1;
  return (actual - expected) / Math.abs(expected);
}

/** Sum without intermediate rounding. */
export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
