/**
 * Price resolution (spec §3.1).
 *
 * Two India-specific traps live here, and both are about refusing to invent a
 * number:
 *
 *  §6.18 CARRY FORWARD, NEVER INTERPOLATE. AMFI publishes one NAV per business
 *        day and the exchanges are shut on weekends, Indian holidays and the
 *        odd muhurat-only session. A portfolio valued on a Saturday must use
 *        Friday's close. Interpolating between Friday and Monday would invent a
 *        price that never existed, and looking forward to Monday's close would
 *        value a Saturday portfolio with information from the future.
 *
 *  §6.19 A SUSPENDED SCHEME IS NOT WORTH ZERO. A missing or suspended NAV means
 *        "we do not know", and silently substituting 0 wipes real money off the
 *        balance sheet. The suspension is returned as a flag so the valuation
 *        engine can mark the position UNVALUED instead of marking it down.
 *
 * The book is an immutable snapshot: build it from the points you have, then
 * resolve against it. No I/O, no clock, no globals (spec §10).
 */

import type { DateISO, InstrumentId, PricePoint, PriceSource } from "../domain/types.ts";
import { tradingDaysBetween } from "../domain/dates.ts";

/** A price actually usable for valuation, with the provenance to explain it. */
export interface ResolvedPrice {
  instrumentId: InstrumentId;
  price: number;
  /** The date the price is FROM, which may be earlier than the asOf asked for. */
  priceAsOf: DateISO;
  source: PriceSource;
  /** True when no price existed on asOf itself and an earlier close was used. */
  carriedForward: boolean;
  /** True when the scheme is suspended or the price is unusable (§6.19). */
  suspended: boolean;
}

/**
 * A price older than two trading days is stale (spec §2.3). Weekends are
 * excluded by `tradingDaysBetween`, so a Friday NAV read on Monday or Tuesday
 * is fresh; exchange holidays are not modelled, which makes the rule err toward
 * flagging a price rather than hiding a stale one.
 */
export const STALE_AFTER_TRADING_DAYS = 2;

export function isStale(priceAsOf: DateISO, asOf: DateISO): boolean {
  return tradingDaysBetween(priceAsOf, asOf) > STALE_AFTER_TRADING_DAYS;
}

/**
 * A price is unusable when the source flagged the scheme suspended, or when the
 * number itself cannot be a price. Zero and negative are treated as unusable
 * rather than as a valid mark: no traded instrument is worth exactly nothing,
 * and a zero in a NAV feed is a gap, not a valuation (§6.19).
 */
function isUnusable(p: PricePoint): boolean {
  return p.suspended === true || !(p.price > 0);
}

export interface PriceBook {
  /**
   * Most recent price at or before `asOf`, optionally restricted to one source
   * (SGB needs the exchange quote and the gold reference separately).
   * Returns undefined when nothing was ever published on or before `asOf`.
   */
  resolve(instrumentId: InstrumentId, asOf: DateISO, source?: PriceSource): ResolvedPrice | undefined;
  /** True when `priceAsOf` is more than two trading days behind `asOf`. */
  isStale(priceAsOf: DateISO, asOf: DateISO): boolean;
  /** Every instrument the book knows about. Used for coverage diagnostics. */
  instrumentIds(): InstrumentId[];
}

/**
 * Build an immutable price book. Points may arrive in any order and from any
 * mix of sources; duplicates on the same date are resolved in favour of the
 * LAST point supplied, so a corrected NAV appended after a provisional one wins.
 */
export function createPriceBook(points: PricePoint[]): PriceBook {
  const byInstrument = new Map<InstrumentId, PricePoint[]>();
  for (const p of points) {
    const arr = byInstrument.get(p.instrumentId);
    if (arr) arr.push(p);
    else byInstrument.set(p.instrumentId, [p]);
  }
  // Ascending by date, input order preserved within a date (stable via index).
  for (const [id, arr] of byInstrument) {
    byInstrument.set(
      id,
      arr
        .map((p, i) => ({ p, i }))
        .sort((a, b) => (a.p.asOf === b.p.asOf ? a.i - b.i : a.p.asOf < b.p.asOf ? -1 : 1))
        .map((x) => x.p),
    );
  }

  function resolve(instrumentId: InstrumentId, asOf: DateISO, source?: PriceSource): ResolvedPrice | undefined {
    const arr = byInstrument.get(instrumentId);
    if (!arr) return undefined;
    // Walk backwards: the first point at or before asOf is the carry-forward
    // candidate. Never step past asOf, so the future can never leak in (§6.18).
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      if (p.asOf > asOf) continue;
      if (source && p.source !== source) continue;
      return {
        instrumentId,
        price: p.price,
        priceAsOf: p.asOf,
        source: p.source,
        carriedForward: p.asOf !== asOf,
        suspended: isUnusable(p),
      };
    }
    return undefined;
  }

  return {
    resolve,
    isStale,
    instrumentIds: () => [...byInstrument.keys()],
  };
}
