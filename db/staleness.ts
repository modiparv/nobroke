/**
 * Trading-day staleness for price quotes. A quote is stale once it is older
 * than the allowed number of trading days. The calendar here is weekends
 * only; exchange holidays would refine this per data source later, which can
 * only make quotes *less* likely to be flagged, never more.
 *
 * All date maths is done on ISO date strings and UTC day numbers, never on
 * float epoch arithmetic.
 */

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function isWeekday(day: number): boolean {
  // Day 0 (1970-01-01) was a Thursday; (day + 4) % 7 gives 0 = Sunday.
  const dow = (day + 4) % 7;
  return dow >= 1 && dow <= 5;
}

/** Trading days strictly after `from`, up to and including `to`. */
export function tradingDaysBetween(fromIso: string, toIso: string): number {
  const from = dayNumber(fromIso);
  const to = dayNumber(toIso);
  if (to <= from) return 0;
  let count = 0;
  for (let d = from + 1; d <= to; d++) if (isWeekday(d)) count++;
  return count;
}

export function isStale(quoteIso: string, todayIso: string, maxTradingDays = 2): boolean {
  return tradingDaysBetween(quoteIso, todayIso) > maxTradingDays;
}

/**
 * The newest quote date that is already stale as seen from `today`: quotes on
 * or before this date get flagged. Used to translate "older than N trading
 * days" into a single cutoff for one UPDATE.
 */
export function staleCutoff(todayIso: string, maxTradingDays = 2): string {
  let day = dayNumber(todayIso);
  let remaining = maxTradingDays;
  while (remaining > 0) {
    day--;
    if (isWeekday(day)) remaining--;
  }
  // One day earlier again: quotes ON the walked-to date are exactly at the
  // limit and still fresh; staleness begins strictly beyond it.
  day--;
  const dt = new Date(day * 86_400_000);
  return dt.toISOString().slice(0, 10);
}
