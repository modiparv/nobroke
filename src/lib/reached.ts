/**
 * When a goal that is on track gets there before its date, said as a month
 * a person can put in a calendar ("Done by Mar 2028"), not as a span
 * ("in about 1y 7m"). One rule for the goal card, the reason list and the
 * sheets, so they never disagree.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar month that is `monthsFromNow` months after `from`, rounded
    up to a whole month: "Mar 2028". Never earlier than this month. */
export function reachedMonth(monthsFromNow: number, from: Date = new Date()): string {
  const ahead = Number.isFinite(monthsFromNow) ? Math.max(0, Math.ceil(monthsFromNow)) : 0;
  const index = from.getFullYear() * 12 + from.getMonth() + ahead;
  return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;
}

/** The words for it: "Covered already" when the money held today is
    enough, otherwise "Done by Mar 2028". */
export function reachedText(monthsFromNow: number, from: Date = new Date()): string {
  return monthsFromNow <= 0 ? "Covered already" : `Done by ${reachedMonth(monthsFromNow, from)}`;
}
