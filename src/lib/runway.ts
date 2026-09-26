/**
 * How long the cash lasts: months of expenses the money in the bank would
 * cover. One rule for the plan band, the advisor note and the cash sheet,
 * so they never disagree.
 */

/** Months of expenses covered by cash, or null when spending is unknown. */
export function runwayMonths(cash: number, monthlyExpenses: number): number | null {
  if (!(monthlyExpenses > 0)) return null;
  return Math.max(0, cash) / monthlyExpenses;
}

/** "2.9 months", "1.0 month", "12+ months". Null reads as a dash. */
export function runwayLabel(months: number | null): string {
  if (months === null) return "—";
  if (months >= 12) return "12+ months";
  const fixed = months.toFixed(1);
  return `${fixed} ${fixed === "1.0" ? "month" : "months"}`;
}

/** The band the advisor keeps within reach: 3 to 6 months of expenses. */
export const RUNWAY_FLOOR_MONTHS = 3;
export const RUNWAY_COMFORT_MONTHS = 6;

/** The cash that brings the runway up to the floor, or 0 if it is there. */
export function cashToFloor(cash: number, monthlyExpenses: number): number {
  if (!(monthlyExpenses > 0)) return 0;
  return Math.max(0, Math.ceil(RUNWAY_FLOOR_MONTHS * monthlyExpenses - Math.max(0, cash)));
}
