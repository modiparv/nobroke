/**
 * Valuation tests. Each one pins a way this engine could be confidently wrong:
 * valuing redeemed units, inventing a weekend NAV, marking a suspended scheme to
 * zero, accruing an FD past maturity, or quietly pricing an SGB below the gold
 * it represents.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPriceBook } from "./prices.ts";
import { accruedValue, valuePortfolio, type ValuationInput } from "./valuation.ts";
import { buildLedger, positionIdFor } from "./ledger.ts";
import type {
  Account, Instrument, InstrumentId, Lot, Position, PricePoint, Transaction,
} from "../domain/types.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT: Account = {
  accountId: "acc1",
  householdId: "hh1",
  memberId: "m1",
  kind: "MF_FOLIO",
  provider: "CAMS",
  accountRef: "F123",
  holdingMode: "SOA",
};

function inst(instrumentId: InstrumentId, over: Partial<Instrument> = {}): Instrument {
  return {
    instrumentId,
    name: instrumentId,
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    liquidityTier: "T3",
    riskBand: 5,
    currency: "INR",
    listingStatus: "LISTED",
    plan: "DIRECT",
    option: "GROWTH",
    ...over,
  };
}

function pos(instrumentId: InstrumentId, over: Partial<Position> = {}): Position {
  return {
    positionId: `pos:${instrumentId}`,
    accountId: "acc1",
    instrumentId,
    holdingMode: "SOA",
    status: "OPEN",
    ...over,
  };
}

let lotSeq = 0;
function lot(positionId: string, instrumentId: InstrumentId, units: number, costPerUnit: number, acquiredOn = "2022-01-01", over: Partial<Lot> = {}): Lot {
  return {
    lotId: `lot:${++lotSeq}`,
    positionId,
    instrumentId,
    acquiredOn,
    units,
    originalUnits: units,
    costPerUnit,
    acquisitionKind: "PURCHASE",
    closed: false,
    ...over,
  };
}

function nav(instrumentId: string, asOf: string, price: number, over: Partial<PricePoint> = {}): PricePoint {
  return { instrumentId, asOf, price, source: "AMFI", ...over };
}

function value(over: Partial<ValuationInput> & Pick<ValuationInput, "asOf" | "positions" | "lots"> & { instrumentList?: Instrument[]; prices?: PricePoint[] }) {
  const { instrumentList = [], prices = [], ...rest } = over;
  return valuePortfolio({
    householdId: "hh1",
    accounts: { acc1: ACCOUNT },
    instruments: Object.fromEntries(instrumentList.map((i) => [i.instrumentId, i])),
    priceBook: createPriceBook(prices),
    ...rest,
  } as ValuationInput);
}

// 2024-03-01 Friday, 03-02 Saturday, 03-04 Monday.
const FRI = "2024-03-01";
const SAT = "2024-03-02";

// ---------------------------------------------------------------------------
// Units x NAV
// ---------------------------------------------------------------------------

test("an MF position is units x NAV, counting OPEN lots only after a partial sell", () => {
  // Build the lots through the real ledger so the FIFO consumption is genuine.
  const txns: Transaction[] = [
    { transactionId: "b1", accountId: "acc1", instrumentId: "MF1", folioNumber: "F123", type: "BUY", tradeDate: "2022-01-10", units: 100, pricePerUnit: 10 },
    { transactionId: "b2", accountId: "acc1", instrumentId: "MF1", folioNumber: "F123", type: "BUY", tradeDate: "2023-01-10", units: 100, pricePerUnit: 20 },
    { transactionId: "s1", accountId: "acc1", instrumentId: "MF1", folioNumber: "F123", type: "SELL", tradeDate: "2023-06-10", units: 150, pricePerUnit: 25 },
  ];
  const instruments = { MF1: inst("MF1") };
  const ledger = buildLedger({ transactions: txns, instruments, accounts: { acc1: ACCOUNT } });
  const pid = positionIdFor("acc1", "MF1", "F123");

  const r = value({
    asOf: FRI,
    positions: ledger.positions,
    lots: ledger.lots,
    instrumentList: [instruments.MF1],
    prices: [nav("MF1", FRI, 30)],
  });

  const v = r.data.positions[0];
  assert.equal(v.method, "UNITS_X_NAV");
  assert.equal(v.units, 50, "the 150 redeemed units must not be valued");
  assert.equal(v.price, 30);
  assert.equal(v.value, 1500, "50 x 30");
  assert.equal(v.investedCost, 1000, "only the surviving lot's cost remains");
  assert.equal(v.unrealisedGain, 500);
  assert.equal(v.stalePrice, false);
  assert.equal(v.illiquid, false);
  assert.equal(v.memberId, "m1", "ownership is carried from the account");
  assert.equal(v.assetClass, "EQUITY");
  assert.equal(v.taxRegimeKey, "EQUITY_MF");
  assert.equal(r.confidence, "HIGH");
  assert.equal(r.data.totalAssets, 1500);
  assert.equal(r.data.hasUnvaluedPositions, false);
});

test("unrealisedGain is value minus invested cost, including when it is negative", () => {
  const p = pos("MF1");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "MF1", 100, 25)],
    instrumentList: [inst("MF1")],
    prices: [nav("MF1", FRI, 18.5)],
  });
  const v = r.data.positions[0];
  assert.equal(v.value, 1850);
  assert.equal(v.investedCost, 2500);
  assert.equal(v.unrealisedGain, -650);
  assert.equal(v.unrealisedGain, v.value - v.investedCost);
  assert.equal(r.data.totalUnrealisedGain, -650);
});

test("a stock uses QTY_X_CLOSE and an ETF uses UNITS_X_NAV", () => {
  const s = pos("REL");
  const e = pos("NIFTYBEES");
  const r = value({
    asOf: FRI,
    positions: [s, e],
    lots: [lot(s.positionId, "REL", 10, 2000), lot(e.positionId, "NIFTYBEES", 100, 200)],
    instrumentList: [
      inst("REL", { instrumentType: "STOCK", taxRegimeKey: "LISTED_EQUITY" }),
      inst("NIFTYBEES", { instrumentType: "ETF" }),
    ],
    prices: [nav("REL", FRI, 2500, { source: "EXCHANGE" }), nav("NIFTYBEES", FRI, 250, { source: "EXCHANGE" })],
  });
  assert.equal(r.data.positions[0].method, "QTY_X_CLOSE");
  assert.equal(r.data.positions[0].value, 25_000);
  assert.equal(r.data.positions[1].method, "UNITS_X_NAV");
  assert.equal(r.data.positions[1].value, 25_000);
  assert.equal(r.data.totalAssets, 50_000);
});

test("§6.18 a Saturday valuation carries Friday's NAV forward and never interpolates", () => {
  const p = pos("MF1");
  const r = value({
    asOf: SAT,
    positions: [p],
    lots: [lot(p.positionId, "MF1", 100, 10)],
    instrumentList: [inst("MF1")],
    // Monday's NAV exists in the book and must be ignored on Saturday.
    prices: [nav("MF1", FRI, 30), nav("MF1", "2024-03-04", 40)],
  });
  const v = r.data.positions[0];
  assert.equal(v.price, 30, "Friday's close, not a blend of 30 and 40 and not Monday's 40");
  assert.equal(v.priceAsOf, FRI);
  assert.equal(v.value, 3000);
  assert.equal(v.stalePrice, false, "one calendar day and zero trading days behind");
  assert.ok(v.notes?.some((n) => n.includes("carried forward")), "the carry-forward must be explained, not hidden");
  assert.equal(r.confidence, "HIGH");
});

test("a NAV more than two trading days old is stale and drags confidence to MEDIUM", () => {
  const p = pos("MF1");
  const r = value({
    asOf: "2024-03-06", // Wednesday: Mon, Tue, Wed = 3 trading days after Friday
    positions: [p],
    lots: [lot(p.positionId, "MF1", 100, 10)],
    instrumentList: [inst("MF1")],
    prices: [nav("MF1", FRI, 30)],
  });
  assert.equal(r.data.positions[0].stalePrice, true);
  assert.equal(r.data.hasStalePrices, true);
  assert.equal(r.confidence, "MEDIUM");
  assert.equal(r.data.positions[0].value, 3000, "a stale price is still the best mark we have");
});

// ---------------------------------------------------------------------------
// §6.19 suspended / missing prices
// ---------------------------------------------------------------------------

test("§6.19 a suspended NAV does not value the holding at zero", () => {
  const p = pos("MF1");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "MF1", 100, 10)],
    instrumentList: [inst("MF1")],
    prices: [nav("MF1", "2024-02-28", 30), nav("MF1", FRI, 0, { suspended: true })],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "UNVALUED");
  assert.equal(v.value, 0, "an unknown value is reported as unvalued, not as a mark of zero");
  assert.equal(v.investedCost, 1000, "what was paid is still known and must not be lost");
  assert.equal(r.data.hasUnvaluedPositions, true);
  assert.equal(r.data.totalAssets, 0);
  assert.equal(r.confidence, "LOW");

  const w = r.warnings.find((x) => x.code === "PRICE_SUSPENDED");
  assert.ok(w, "the suspension must be surfaced");
  assert.equal(w!.subjectId, p.positionId, "the warning names the position");
  assert.ok(w!.message.includes("NOT worth zero"));
});

test("a position with no price at all is UNVALUED, warned about, and drags confidence to LOW", () => {
  const good = pos("MF1");
  const bad = pos("MF2");
  const r = value({
    asOf: FRI,
    positions: [good, bad],
    lots: [lot(good.positionId, "MF1", 100, 10), lot(bad.positionId, "MF2", 50, 12)],
    instrumentList: [inst("MF1"), inst("MF2")],
    prices: [nav("MF1", FRI, 30)],
  });
  const v = r.data.positions[1];
  assert.equal(v.method, "UNVALUED");
  assert.equal(v.value, 0);
  assert.equal(v.price, 0, "no price was invented");
  assert.equal(r.data.hasUnvaluedPositions, true);
  assert.equal(r.confidence, "LOW");
  assert.equal(r.data.totalAssets, 3000, "the priced position is still valued");

  const w = r.warnings.find((x) => x.code === "NO_PRICE");
  assert.ok(w);
  assert.equal(w!.severity, "WARN");
  assert.equal(w!.subjectId, bad.positionId);
});

test("a position emptied by redemption is not reported as an unvalued problem", () => {
  const p = pos("MF1", { status: "CLOSED" });
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "MF1", 0, 10, "2022-01-01", { closed: true })],
    instrumentList: [inst("MF1")],
    prices: [],
  });
  assert.equal(r.data.positions[0].value, 0);
  assert.equal(r.data.hasUnvaluedPositions, false, "nothing was lost: there is nothing left to value");
  assert.equal(r.warnings.length, 0);
  assert.equal(r.confidence, "HIGH");
});

test("a position whose instrument is unknown blocks rather than silently vanishing", () => {
  const p = pos("GHOST");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "GHOST", 10, 100)],
    instrumentList: [],
    prices: [],
  });
  assert.equal(r.data.positions.length, 0);
  const w = r.warnings.find((x) => x.code === "MISSING_INSTRUMENT");
  assert.ok(w);
  assert.equal(w!.severity, "BLOCKING");
  assert.equal(r.confidence, "LOW");
});

// ---------------------------------------------------------------------------
// Accrual: FD / RD
// ---------------------------------------------------------------------------

function fd(over: Partial<Instrument> = {}): Instrument {
  return inst("FD1", {
    instrumentType: "FD",
    assetClass: "DEBT",
    taxRegimeKey: "SLAB_ONLY",
    liquidityTier: "T1",
    riskBand: 1,
    plan: "NA",
    option: "NA",
    accrual: { annualRate: 0.07, compounding: "SIMPLE", startDate: "2023-01-01", maturityDate: "2024-01-01", principal: 100_000 },
    ...over,
  });
}

test("FD SIMPLE interest over exactly one year is principal x (1 + r)", () => {
  // 2023-01-01 to 2024-01-01 is 365 days, so ACT/365 gives exactly 1 year.
  // 100000 x (1 + 0.07 x 365/365) = 107000.00
  const p = pos("FD1");
  const r = value({
    asOf: "2024-01-01",
    positions: [p],
    lots: [lot(p.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [fd()],
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "ACCRUED_INTEREST");
  assert.equal(v.value, 107_000);
  assert.equal(v.investedCost, 100_000);
  assert.equal(v.unrealisedGain, 7000);
  assert.equal(v.priceSource, "COMPUTED_ACCRUAL");
  assert.equal(v.stalePrice, false, "a contractual accrual cannot go stale");
});

test("FD QUARTERLY compounding over exactly one year", () => {
  // 100000 x (1 + 0.07/4)^4 = 100000 x 1.0175^4
  // 1.0175^2 = 1.03530625; 1.03530625^2 = 1.0718590312890625 -> 107185.90
  const p = pos("FD1");
  const r = value({
    asOf: "2024-01-01",
    positions: [p],
    lots: [lot(p.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [fd({ accrual: { annualRate: 0.07, compounding: "QUARTERLY", startDate: "2023-01-01", maturityDate: "2024-01-01", principal: 100_000 } })],
    prices: [],
  });
  assert.equal(r.data.positions[0].value, 107_185.90);
});

test("FD SIMPLE interest part-way through the term uses actual elapsed days", () => {
  // 2023-01-01 to 2023-07-01 is 181 days: 100000 x (1 + 0.07 x 181/365) = 103471.23
  const p = pos("FD1");
  const r = value({
    asOf: "2023-07-01",
    positions: [p],
    lots: [lot(p.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [fd()],
    prices: [],
  });
  assert.equal(r.data.positions[0].value, 103_471.23);
});

test("an FD does not accrue past its maturity date", () => {
  const p = pos("FD1");
  const r = value({
    asOf: "2025-01-01", // a full year after maturity
    positions: [p],
    lots: [lot(p.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [fd()],
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.value, 107_000, "interest stops at maturity, not at asOf");
  assert.equal(v.priceAsOf, "2024-01-01");
  assert.ok(v.notes?.some((n) => n.includes("Matured on 2024-01-01")));
});

test("an FD is not accrued before its start date", () => {
  const p = pos("FD1");
  const r = value({
    asOf: "2022-12-01",
    positions: [p],
    lots: [lot(p.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [fd()],
    prices: [],
  });
  assert.equal(r.data.positions[0].value, 100_000);
});

test("accruedValue matches the compounding frequency it is given", () => {
  assert.equal(accruedValue(100_000, 0.07, "SIMPLE", "2023-01-01", "2024-01-01"), 107_000);
  assert.equal(accruedValue(100_000, 0.07, "ANNUAL", "2023-01-01", "2024-01-01"), 107_000);
  assert.ok(Math.abs(accruedValue(100_000, 0.07, "HALF_YEARLY", "2023-01-01", "2024-01-01") - 107_122.50) < 1e-6);
  assert.ok(Math.abs(accruedValue(100_000, 0.07, "QUARTERLY", "2023-01-01", "2024-01-01") - 107_185.9031289) < 1e-6);
  assert.ok(Math.abs(accruedValue(100_000, 0.07, "MONTHLY", "2023-01-01", "2024-01-01") - 107_229.0080856) < 1e-6);
});

test("an RD accrues each instalment from its own credit date, not from account opening", () => {
  // Three 10,000 instalments at 7% simple, valued on 2023-04-01:
  //   01-Jan (90 days): 10000 x (1 + 0.07 x 90/365)  = 10172.602739726027
  //   01-Feb (59 days): 10000 x (1 + 0.07 x 59/365)  = 10113.150684931507
  //   01-Mar (31 days): 10000 x (1 + 0.07 x 31/365)  = 10059.452054794521
  // Total 30345.205479452055 -> 30345.21
  const p = pos("RD1");
  const r = value({
    asOf: "2023-04-01",
    positions: [p],
    lots: [
      lot(p.positionId, "RD1", 10_000, 1, "2023-01-01"),
      lot(p.positionId, "RD1", 10_000, 1, "2023-02-01"),
      lot(p.positionId, "RD1", 10_000, 1, "2023-03-01"),
    ],
    instrumentList: [inst("RD1", {
      instrumentType: "RD",
      assetClass: "DEBT",
      taxRegimeKey: "SLAB_ONLY",
      accrual: { annualRate: 0.07, compounding: "SIMPLE", startDate: "2023-01-01" },
    })],
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "ACCRUED_INTEREST");
  assert.equal(v.value, 30_345.21);
  assert.equal(v.investedCost, 30_000);
});

test("an FD without accrual terms is UNVALUED rather than guessed at", () => {
  const p = pos("FD1");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [fd({ accrual: undefined })],
    prices: [],
  });
  assert.equal(r.data.positions[0].method, "UNVALUED");
  assert.ok(r.warnings.some((w) => w.code === "NO_ACCRUAL_TERMS"));
  assert.equal(r.confidence, "LOW");
});

// ---------------------------------------------------------------------------
// PPF / EPF
// ---------------------------------------------------------------------------

test("PPF uses the statement balance when one is supplied", () => {
  const p = pos("PPF1");
  const r = value({
    asOf: "2024-03-31",
    positions: [p],
    lots: [lot(p.positionId, "PPF1", 500_000, 1, "2019-04-01")],
    instrumentList: [inst("PPF1", {
      instrumentType: "PPF", assetClass: "DEBT", taxRegimeKey: "SLAB_ONLY",
      accrual: { annualRate: 0.071, compounding: "ANNUAL", startDate: "2019-04-01" },
    })],
    providerBalances: { [p.positionId]: { value: 612_345.67, asOf: "2024-03-31" } },
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "STATEMENT_BALANCE");
  assert.equal(v.value, 612_345.67, "the passbook wins over any computed estimate");
  assert.equal(v.priceSource, "STATEMENT");
  assert.equal(v.stalePrice, false);
});

test("EPF falls back to accrual at the notified rate and declares it as an assumption", () => {
  const p = pos("EPF1");
  const r = value({
    asOf: "2024-01-01",
    positions: [p],
    lots: [lot(p.positionId, "EPF1", 100_000, 1, "2023-01-01")],
    instrumentList: [inst("EPF1", {
      instrumentType: "EPF", assetClass: "DEBT", taxRegimeKey: "SLAB_ONLY",
      accrual: { annualRate: 0.0815, compounding: "ANNUAL", startDate: "2023-01-01" },
    })],
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "ACCRUED_INTEREST");
  assert.ok(Math.abs(v.value - 108_150) < 0.01);
  assert.equal(v.stalePrice, true, "an estimate is not a fresh mark");
  assert.ok(v.notes?.some((n) => n.includes("ESTIMATE")));
  assert.ok(String(r.assumptions.providentFundFallback).includes("notified rate"));
  assert.equal(r.confidence, "MEDIUM");
});

// ---------------------------------------------------------------------------
// SGB
// ---------------------------------------------------------------------------

function sgbInput(quoted: number | undefined, goldRef: number | undefined) {
  const p = pos("SGB1");
  const prices: PricePoint[] = [];
  if (quoted != null) prices.push(nav("SGB1", FRI, quoted, { source: "EXCHANGE" }));
  if (goldRef != null) prices.push(nav("SGB1", FRI, goldRef, { source: "GOLD_REFERENCE" }));
  return value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "SGB1", 50, 4500, "2020-05-01")],
    instrumentList: [inst("SGB1", { instrumentType: "SGB", assetClass: "COMMODITY", taxRegimeKey: "GOLD" })],
    prices,
  });
}

test("an SGB takes the HIGHER of the exchange quote and the gold reference price", () => {
  // Thin secondary market: the screen quote sits below the gold it represents.
  const discounted = sgbInput(6000, 6400).data.positions[0];
  assert.equal(discounted.method, "SGB_HIGHER_OF");
  assert.equal(discounted.price, 6400, "the RBI redeems at the gold reference, so the discount is not the value");
  assert.equal(discounted.value, 320_000, "50 grams x 6400");

  // And when the market trades above gold, the market wins.
  const premium = sgbInput(6600, 6400).data.positions[0];
  assert.equal(premium.price, 6600);
  assert.equal(premium.value, 330_000);
});

test("an SGB with only one of the two prices is still valued, with the gap noted", () => {
  const quoteOnly = sgbInput(6000, undefined).data.positions[0];
  assert.equal(quoteOnly.value, 300_000);
  assert.ok(quoteOnly.notes?.some((n) => n.includes("No gold reference price")));

  const goldOnly = sgbInput(undefined, 6400).data.positions[0];
  assert.equal(goldOnly.value, 320_000);
  assert.ok(goldOnly.notes?.some((n) => n.includes("No exchange quote")));
});

test("the SGB coupon is flagged as income and excluded from capital value", () => {
  const v = sgbInput(6000, 6400).data.positions[0];
  assert.ok(v.notes?.some((n) => n.includes("2.5% annual coupon") && n.includes("NOT capital value")));
});

test("an SGB with no price at all is UNVALUED", () => {
  const r = sgbInput(undefined, undefined);
  assert.equal(r.data.positions[0].method, "UNVALUED");
  assert.ok(r.warnings.some((w) => w.code === "NO_PRICE"));
});

// ---------------------------------------------------------------------------
// Property / physical gold / unlisted / ULIP
// ---------------------------------------------------------------------------

test("a property valued two years ago is still valued, but illiquid and stale", () => {
  const p = pos("FLAT");
  const r = value({
    asOf: "2024-03-01",
    positions: [p],
    lots: [lot(p.positionId, "FLAT", 1, 8_500_000, "2016-06-01")],
    instrumentList: [inst("FLAT", {
      instrumentType: "PROPERTY", assetClass: "REAL_ASSET", taxRegimeKey: "PROPERTY",
      liquidityTier: "ILLIQUID", listingStatus: "UNLISTED", plan: "NA", option: "NA",
    })],
    declaredValues: { [p.positionId]: { value: 14_000_000, lastValuedOn: "2022-03-01" } },
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "USER_DECLARED");
  assert.equal(v.value, 14_000_000);
  assert.equal(v.illiquid, true);
  assert.equal(v.stalePrice, true, "a two-year-old valuation is not a mark");
  assert.equal(v.unrealisedGain, 5_500_000);
  assert.ok(v.notes?.some((n) => n.includes("731 days old")));
  assert.equal(r.data.hasStalePrices, true);
  assert.equal(r.confidence, "MEDIUM");
  assert.equal(r.assumptions.declaredValueStaleAfterDays, 365);
});

test("a recently declared property value is not stale but is still illiquid", () => {
  const p = pos("FLAT");
  const r = value({
    asOf: "2024-03-01",
    positions: [p],
    lots: [lot(p.positionId, "FLAT", 1, 8_500_000, "2016-06-01")],
    instrumentList: [inst("FLAT", { instrumentType: "PROPERTY", assetClass: "REAL_ASSET", taxRegimeKey: "PROPERTY" })],
    declaredValues: { [p.positionId]: { value: 14_000_000, lastValuedOn: "2023-12-01" } },
    prices: [],
  });
  assert.equal(r.data.positions[0].stalePrice, false);
  assert.equal(r.data.positions[0].illiquid, true);
  assert.equal(r.confidence, "MEDIUM", "a user-declared mark is never HIGH confidence");
});

test("physical gold with no declared value is UNVALUED, not priced off some other feed", () => {
  const p = pos("JEWEL");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "JEWEL", 100, 4000, "2018-01-01")],
    instrumentList: [inst("JEWEL", { instrumentType: "GOLD_PHYSICAL", assetClass: "COMMODITY", taxRegimeKey: "GOLD" })],
    prices: [],
  });
  assert.equal(r.data.positions[0].method, "UNVALUED");
  assert.ok(r.warnings.some((w) => w.code === "NO_DECLARED_VALUE"));
});

test("unlisted shares mark at the last round price and stay illiquid", () => {
  const p = pos("STARTUP");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "STARTUP", 1000, 150, "2021-08-01")],
    instrumentList: [inst("STARTUP", {
      instrumentType: "UNLISTED", taxRegimeKey: "UNLISTED_EQUITY", listingStatus: "UNLISTED", liquidityTier: "ILLIQUID",
    })],
    prices: [{ instrumentId: "STARTUP", asOf: "2021-08-01", price: 150, source: "USER_DECLARED" }],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "LAST_ROUND_PRICE");
  assert.equal(v.value, 150_000);
  assert.equal(v.illiquid, true);
  assert.equal(v.stalePrice, true);
  assert.equal(r.confidence, "MEDIUM");
});

test("a ULIP is valued at the insurer's fund value, never at premiums paid", () => {
  const p = pos("ULIP1");
  const withStatement = value({
    asOf: "2024-03-01",
    positions: [p],
    lots: [lot(p.positionId, "ULIP1", 5, 100_000, "2020-04-01")], // 5 premiums of 1,00,000
    instrumentList: [inst("ULIP1", { instrumentType: "ULIP", assetClass: "HYBRID", taxRegimeKey: "SLAB_ONLY" })],
    providerBalances: { [p.positionId]: { value: 430_000, asOf: "2024-02-15" } },
    prices: [],
  });
  const v = withStatement.data.positions[0];
  assert.equal(v.method, "FUND_VALUE");
  assert.equal(v.value, 430_000, "charges are already deducted; premiums paid (500000) would overstate it");
  assert.equal(v.unrealisedGain, -70_000);

  const noStatement = value({
    asOf: "2024-03-01",
    positions: [p],
    lots: [lot(p.positionId, "ULIP1", 5, 100_000, "2020-04-01")],
    instrumentList: [inst("ULIP1", { instrumentType: "ULIP", assetClass: "HYBRID", taxRegimeKey: "SLAB_ONLY" })],
    prices: [],
  });
  assert.equal(noStatement.data.positions[0].method, "UNVALUED");
  assert.equal(noStatement.data.positions[0].value, 0, "premiums paid must NOT be substituted for fund value");
  assert.ok(noStatement.warnings.some((w) => w.code === "NO_FUND_VALUE"));
});

// ---------------------------------------------------------------------------
// Bonds
// ---------------------------------------------------------------------------

test("a quoted bond is clean price plus interest accrued since the last coupon", () => {
  // Issued 2023-01-01, 8% half-yearly on a face of 1000. Last coupon 2023-07-01,
  // so on 2023-10-01 (92 days) accrued = 10 x 1000 x 0.08 x 92/365 = 201.6438...
  const p = pos("BOND1");
  const r = value({
    asOf: "2023-10-01",
    positions: [p],
    lots: [lot(p.positionId, "BOND1", 10, 1000, "2023-01-01")],
    instrumentList: [inst("BOND1", {
      instrumentType: "BOND", assetClass: "DEBT", taxRegimeKey: "SLAB_ONLY",
      accrual: { annualRate: 0.08, compounding: "HALF_YEARLY", startDate: "2023-01-01", maturityDate: "2028-01-01", principal: 1000 },
    })],
    prices: [{ instrumentId: "BOND1", asOf: "2023-10-01", price: 1020, source: "EXCHANGE" }],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "CLEAN_PRICE_PLUS_ACCRUED");
  assert.equal(v.value, 10_401.64, "10200 clean + 201.64 accrued");
  assert.ok(v.notes?.some((n) => n.includes("2023-07-01")));
});

test("an unquoted bond falls back to amortised cost and says so", () => {
  const p = pos("BOND1");
  const r = value({
    asOf: "2024-01-01",
    positions: [p],
    lots: [lot(p.positionId, "BOND1", 10, 1000, "2023-01-01")],
    instrumentList: [inst("BOND1", {
      instrumentType: "BOND", assetClass: "DEBT", taxRegimeKey: "SLAB_ONLY",
      accrual: { annualRate: 0.08, compounding: "ANNUAL", startDate: "2023-01-01", maturityDate: "2028-01-01", principal: 1000 },
    })],
    prices: [],
  });
  const v = r.data.positions[0];
  assert.equal(v.method, "AMORTISED_COST");
  assert.ok(Math.abs(v.value - 10_800) < 0.01);
  assert.equal(v.stalePrice, true, "amortised cost is not a market price");
  assert.ok(v.notes?.some((n) => n.includes("not a market price")));
});

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

test("the envelope carries asOf, real assumptions and the sources actually used", () => {
  const m = pos("MF1");
  const f = pos("FD1");
  const r = value({
    asOf: "2024-01-01",
    positions: [m, f],
    lots: [lot(m.positionId, "MF1", 100, 10), lot(f.positionId, "FD1", 100_000, 1, "2023-01-01")],
    instrumentList: [inst("MF1"), fd()],
    prices: [nav("MF1", "2024-01-01", 30)],
  });
  assert.equal(r.asOf, "2024-01-01");
  assert.equal(r.data.currency, "INR");
  assert.equal(r.assumptions.accrualDayCount, "ACT/365");
  assert.equal(r.assumptions.stalePriceThresholdTradingDays, 2);
  assert.ok(String(r.assumptions.priceCarryForward).includes("never interpolated"));

  const kinds = r.dataSources.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["AMFI_NAV", "DERIVED"]);
  assert.equal(r.dataSources.find((d) => d.kind === "AMFI_NAV")!.asOf, "2024-01-01");

  // Totals tie out to the sum of the lines the user can see.
  assert.equal(r.data.totalAssets, 3000 + 107_000);
  assert.equal(r.data.totalInvestedCost, 1000 + 100_000);
  assert.equal(r.data.totalUnrealisedGain, r.data.totalAssets - r.data.totalInvestedCost);
});

test("valuation is pure: the same inputs produce the same snapshot", () => {
  const p = pos("MF1");
  const args = {
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "MF1", 100, 10)],
    instrumentList: [inst("MF1")],
    prices: [nav("MF1", FRI, 30)],
  };
  assert.deepEqual(value(args).data, value(args).data);
});

test("a foreign-currency holding blocks rather than being silently added to a rupee total", () => {
  const p = pos("AAPL");
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "AAPL", 10, 150)],
    instrumentList: [inst("AAPL", { instrumentType: "STOCK", currency: "USD", taxRegimeKey: "UNLISTED_EQUITY" })],
    prices: [nav("AAPL", FRI, 180, { source: "EXCHANGE" })],
  });
  const w = r.warnings.find((x) => x.code === "CURRENCY_MISMATCH");
  assert.ok(w);
  assert.equal(w!.severity, "BLOCKING");
  assert.equal(r.confidence, "LOW");
});

test("a position on an unknown account is still valued, with ownership flagged", () => {
  const p = pos("MF1", { accountId: "acc_missing" });
  const r = value({
    asOf: FRI,
    positions: [p],
    lots: [lot(p.positionId, "MF1", 100, 10)],
    instrumentList: [inst("MF1")],
    prices: [nav("MF1", FRI, 30)],
  });
  assert.equal(r.data.positions[0].value, 3000);
  assert.equal(r.data.positions[0].memberId, "");
  assert.ok(r.warnings.some((w) => w.code === "MISSING_ACCOUNT"));
});
