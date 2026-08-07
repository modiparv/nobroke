/**
 * Date arithmetic for holding periods, accruals and staleness.
 *
 * Dates are `YYYY-MM-DD` strings: timezone-free, lexicographically sortable,
 * and immune to the local-midnight bugs that plague `Date` in this domain.
 * Day counts use ACT (real elapsed days) so leap years are handled by
 * construction (trap §6.17); year fractions use ACT/365.
 */

import type { DateISO } from "./types.ts";

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(d: string): d is DateISO {
  const m = DATE_RE.exec(d);
  if (!m) return false;
  const [, y, mo, da] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
  return (
    dt.getUTCFullYear() === Number(y) &&
    dt.getUTCMonth() === Number(mo) - 1 &&
    dt.getUTCDate() === Number(da)
  );
}

function parts(d: DateISO): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(d);
  if (!m) throw new Error(`Invalid date: ${d}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function toEpochDay(d: DateISO): number {
  const { y, m, d: day } = parts(d);
  return Math.floor(Date.UTC(y, m - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(n: number): DateISO {
  const dt = new Date(n * MS_PER_DAY);
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Real elapsed days (ACT). Negative when `to` precedes `from`. */
export function daysBetween(from: DateISO, to: DateISO): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** ACT/365 year fraction, used for interest accrual. */
export function yearFractionAct365(from: DateISO, to: DateISO): number {
  return daysBetween(from, to) / 365;
}

export function addDays(d: DateISO, n: number): DateISO {
  return fromEpochDay(toEpochDay(d) + n);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add months, clamping to month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: DateISO, n: number): DateISO {
  const { y, m, d: day } = parts(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(day, daysInMonth(ny, nm));
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function addYears(d: DateISO, n: number): DateISO {
  return addMonths(d, n * 12);
}

/**
 * Whole calendar months elapsed. Used for holding period (>12 months) and
 * lock-ins. Month-end is clamped so 31-Jan → 28-Feb counts as one full month.
 */
export function completedMonths(from: DateISO, to: DateISO): number {
  const a = parts(from);
  const b = parts(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) {
    // Not a shortfall if `to` is already the last day of its month.
    const lastDayOfTo = daysInMonth(b.y, b.m);
    if (b.d !== lastDayOfTo || a.d <= lastDayOfTo) months -= 1;
  }
  return months;
}

export function isBefore(a: DateISO, b: DateISO): boolean {
  return a < b;
}
export function isOnOrAfter(a: DateISO, b: DateISO): boolean {
  return a >= b;
}
export function minDate(a: DateISO, b: DateISO): DateISO {
  return a <= b ? a : b;
}
export function maxDate(a: DateISO, b: DateISO): DateISO {
  return a >= b ? a : b;
}

/** Today in UTC. Injectable `now` keeps engines pure and testable. */
export function todayISO(now: Date = new Date()): DateISO {
  return fromEpochDay(Math.floor(now.getTime() / MS_PER_DAY));
}

/**
 * Indian markets are closed on weekends; exchange holidays are not modelled in
 * Phase 1. Used only for the "older than 2 trading days" staleness rule, which
 * therefore errs toward flagging rather than hiding a stale price.
 */
export function isWeekend(d: DateISO): boolean {
  const dow = new Date(toEpochDay(d) * MS_PER_DAY).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Count of non-weekend days strictly after `from`, up to and including `to`. */
export function tradingDaysBetween(from: DateISO, to: DateISO): number {
  if (to <= from) return 0;
  let count = 0;
  for (let day = toEpochDay(from) + 1; day <= toEpochDay(to); day++) {
    if (!isWeekend(fromEpochDay(day))) count++;
  }
  return count;
}
