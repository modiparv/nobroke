/**
 * Price book tests. The two rules worth breaking a build over are §6.18
 * (carry forward, never interpolate, never look forward) and §6.19 (a
 * suspended scheme is unknown, not zero).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPriceBook, isStale, STALE_AFTER_TRADING_DAYS } from "./prices.ts";
import type { PricePoint } from "../domain/types.ts";

function nav(instrumentId: string, asOf: string, price: number, over: Partial<PricePoint> = {}): PricePoint {
  return { instrumentId, asOf, price, source: "AMFI", ...over };
}

// 2024-03-01 is a Friday, 03-02 Saturday, 03-03 Sunday, 03-04 Monday.
const FRI = "2024-03-01";
const SAT = "2024-03-02";
const SUN = "2024-03-03";
const MON = "2024-03-04";
const TUE = "2024-03-05";
const WED = "2024-03-06";

test("an exact-date price is returned without a carry-forward flag", () => {
  const book = createPriceBook([nav("A", FRI, 100)]);
  const r = book.resolve("A", FRI)!;
  assert.equal(r.price, 100);
  assert.equal(r.priceAsOf, FRI);
  assert.equal(r.carriedForward, false);
  assert.equal(r.suspended, false);
  assert.equal(r.source, "AMFI");
});

test("§6.18 a Saturday valuation carries Friday's NAV forward and never interpolates", () => {
  const book = createPriceBook([nav("A", FRI, 100), nav("A", MON, 110)]);
  const sat = book.resolve("A", SAT)!;
  assert.equal(sat.price, 100, "Saturday must use Friday's close, not a blend of Friday and Monday");
  assert.equal(sat.priceAsOf, FRI);
  assert.equal(sat.carriedForward, true);

  const sun = book.resolve("A", SUN)!;
  assert.equal(sun.price, 100);
  assert.equal(sun.priceAsOf, FRI);
});

test("§6.18 resolution never looks forward", () => {
  const book = createPriceBook([nav("A", MON, 110)]);
  assert.equal(book.resolve("A", FRI), undefined, "a price published after asOf must not be used");
});

test("a long gap still carries the last known close forward", () => {
  const book = createPriceBook([nav("A", "2024-01-05", 90)]);
  const r = book.resolve("A", "2024-03-04")!;
  assert.equal(r.price, 90);
  assert.equal(r.priceAsOf, "2024-01-05");
  assert.equal(r.carriedForward, true);
  assert.equal(isStale(r.priceAsOf, "2024-03-04"), true);
});

test("points may arrive unsorted and from mixed sources", () => {
  const book = createPriceBook([
    nav("A", MON, 110),
    nav("A", "2024-02-01", 80),
    nav("A", FRI, 100),
  ]);
  assert.equal(book.resolve("A", TUE)!.price, 110);
  assert.equal(book.resolve("A", FRI)!.price, 100);
  assert.equal(book.resolve("A", "2024-02-20")!.price, 80);
});

test("a corrected NAV appended for the same date wins", () => {
  const book = createPriceBook([nav("A", FRI, 100), nav("A", FRI, 101.5)]);
  assert.equal(book.resolve("A", FRI)!.price, 101.5);
});

test("§6.19 a suspended NAV is surfaced, not silently replaced by an older good one", () => {
  const book = createPriceBook([nav("A", FRI, 100), nav("A", MON, 0, { suspended: true })]);
  const r = book.resolve("A", MON)!;
  assert.equal(r.suspended, true, "the suspension must reach the caller");
  assert.equal(r.priceAsOf, MON, "we must not pretend Friday's NAV still applies");
});

test("§6.19 a zero or negative price is unusable, not a valuation of zero", () => {
  const book = createPriceBook([nav("A", FRI, 0), nav("B", FRI, -5)]);
  assert.equal(book.resolve("A", FRI)!.suspended, true);
  assert.equal(book.resolve("B", FRI)!.suspended, true);
});

test("a source filter separates the exchange quote from the gold reference", () => {
  const book = createPriceBook([
    nav("SGB", FRI, 6000, { source: "EXCHANGE" }),
    nav("SGB", FRI, 6200, { source: "GOLD_REFERENCE" }),
  ]);
  assert.equal(book.resolve("SGB", FRI, "EXCHANGE")!.price, 6000);
  assert.equal(book.resolve("SGB", FRI, "GOLD_REFERENCE")!.price, 6200);
  assert.equal(book.resolve("SGB", FRI, "AMFI"), undefined);
});

test("a source filter still carries forward within that source only", () => {
  const book = createPriceBook([
    nav("SGB", "2024-02-26", 5900, { source: "EXCHANGE" }),
    nav("SGB", FRI, 6200, { source: "GOLD_REFERENCE" }),
  ]);
  const quoted = book.resolve("SGB", FRI, "EXCHANGE")!;
  assert.equal(quoted.price, 5900);
  assert.equal(quoted.carriedForward, true);
});

test("instruments do not bleed into one another", () => {
  const book = createPriceBook([nav("A", FRI, 100), nav("B", FRI, 200)]);
  assert.equal(book.resolve("A", FRI)!.price, 100);
  assert.equal(book.resolve("B", FRI)!.price, 200);
  assert.equal(book.resolve("C", FRI), undefined);
  assert.deepEqual(book.instrumentIds().sort(), ["A", "B"]);
});

test("an empty book resolves nothing", () => {
  assert.equal(createPriceBook([]).resolve("A", FRI), undefined);
});

test("staleness counts trading days, so a Friday NAV survives the weekend", () => {
  assert.equal(STALE_AFTER_TRADING_DAYS, 2);
  assert.equal(isStale(FRI, SAT), false);
  assert.equal(isStale(FRI, MON), false, "one trading day behind");
  assert.equal(isStale(FRI, TUE), false, "exactly two trading days behind is the limit");
  assert.equal(isStale(FRI, WED), true, "three trading days behind is stale");
  assert.equal(isStale(FRI, FRI), false);
});
