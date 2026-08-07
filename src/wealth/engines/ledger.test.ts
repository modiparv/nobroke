/**
 * Ledger tests — one per India-specific correctness trap the ledger owns
 * (spec §6). These are the failure modes that make a portfolio app quietly
 * wrong, so each gets an explicit assertion rather than a smoke test.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLedger, openCost, openUnits, positionIdFor } from "./ledger.ts";
import type { Account, Instrument, InstrumentId, Transaction } from "../domain/types.ts";

function mf(instrumentId: InstrumentId, over: Partial<Instrument> = {}): Instrument {
  return {
    instrumentId,
    isin: `ISIN_${instrumentId}`,
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

const ACCOUNT: Account = {
  accountId: "acc1",
  householdId: "hh1",
  memberId: "m1",
  kind: "MF_FOLIO",
  provider: "CAMS",
  accountRef: "F123",
  holdingMode: "SOA",
};

function run(txns: Transaction[], instruments: Instrument[]) {
  return buildLedger({
    transactions: txns,
    instruments: Object.fromEntries(instruments.map((i) => [i.instrumentId, i])),
    accounts: { acc1: ACCOUNT },
  });
}

function tx(over: Partial<Transaction> & Pick<Transaction, "transactionId" | "type" | "tradeDate">): Transaction {
  return { accountId: "acc1", instrumentId: "A", folioNumber: "F123", ...over } as Transaction;
}

test("§6.1 Regular and Direct plans of one scheme never merge", () => {
  const s = run(
    [
      tx({ transactionId: "t1", type: "BUY", tradeDate: "2023-04-10", instrumentId: "SCHEME_DIR", units: 100, pricePerUnit: 10 }),
      tx({ transactionId: "t2", type: "BUY", tradeDate: "2023-04-10", instrumentId: "SCHEME_REG", units: 50, pricePerUnit: 10 }),
    ],
    [mf("SCHEME_DIR", { plan: "DIRECT" }), mf("SCHEME_REG", { plan: "REGULAR" })],
  );
  assert.equal(s.positions.length, 2, "Direct and Regular must be two positions");
});

test("§6.2 Growth and IDCW variants never merge", () => {
  const s = run(
    [
      tx({ transactionId: "t1", type: "BUY", tradeDate: "2023-04-10", instrumentId: "SCH_G", units: 100, pricePerUnit: 10 }),
      tx({ transactionId: "t2", type: "BUY", tradeDate: "2023-04-10", instrumentId: "SCH_IDCW", units: 100, pricePerUnit: 10 }),
    ],
    [mf("SCH_G", { option: "GROWTH" }), mf("SCH_IDCW", { option: "IDCW_PAYOUT" })],
  );
  assert.equal(s.positions.length, 2);
});

test("multiple folios of the same scheme stay separate positions", () => {
  const s = run(
    [
      tx({ transactionId: "t1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10, folioNumber: "F1" }),
      tx({ transactionId: "t2", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10, folioNumber: "F2" }),
    ],
    [mf("A")],
  );
  assert.equal(s.positions.length, 2);
});

test("sells consume lots FIFO and preserve each lot's acquisition date", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2022-01-10", units: 100, pricePerUnit: 10 }),
      tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-01-10", units: 100, pricePerUnit: 20 }),
      tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-01-10", units: 150, pricePerUnit: 30 }),
    ],
    [mf("A")],
  );
  const pid = positionIdFor("acc1", "A", "F123");
  assert.ok(Math.abs(openUnits(s.lots, pid) - 50) < 1e-9, "50 units should remain");

  // Oldest lot fully consumed first, then half the newer one.
  assert.equal(s.disposals.length, 2);
  assert.equal(s.disposals[0].acquiredOn, "2022-01-10");
  assert.equal(s.disposals[0].units, 100);
  assert.equal(s.disposals[1].acquiredOn, "2023-01-10");
  assert.equal(s.disposals[1].units, 50);
  // Remaining basis is the newer lot only: 50 × 20.
  assert.ok(Math.abs(openCost(s.lots, pid) - 1000) < 1e-9);
});

test("§6.6 bonus units carry zero cost and a fresh holding period", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2020-01-10", units: 100, pricePerUnit: 10 }),
      tx({ transactionId: "bo1", type: "BONUS", tradeDate: "2024-03-01", units: 100 }),
    ],
    [mf("A")],
  );
  const bonus = s.lots.find((l) => l.acquisitionKind === "BONUS")!;
  assert.equal(bonus.costPerUnit, 0, "bonus units cost nothing");
  assert.equal(bonus.acquiredOn, "2024-03-01", "holding period restarts at the bonus date");

  const original = s.lots.find((l) => l.acquisitionKind === "PURCHASE")!;
  assert.equal(original.acquiredOn, "2020-01-10", "the original lot is untouched");
  // Total cost unchanged by a bonus; only unit count grows.
  const pid = positionIdFor("acc1", "A", "F123");
  assert.equal(openUnits(s.lots, pid), 200);
  assert.equal(openCost(s.lots, pid), 1000);
});

test("§6.7 split multiplies units, divides cost per unit, and leaves holding period alone", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2019-06-01", units: 100, pricePerUnit: 500 }),
      tx({ transactionId: "sp1", type: "SPLIT", tradeDate: "2023-08-01", ratio: 10 }),
    ],
    [mf("A", { instrumentType: "STOCK", taxRegimeKey: "LISTED_EQUITY" })],
  );
  const lot = s.lots[0];
  assert.equal(lot.units, 1000, "units scale by the ratio");
  assert.equal(lot.costPerUnit, 50, "cost per unit divides by the ratio");
  assert.equal(lot.acquiredOn, "2019-06-01", "a split does not restart the holding period");
  // Total cost is invariant across a split.
  assert.equal(lot.units * lot.costPerUnit, 50_000);
});

test("§6.4 scheme merger carries BOTH cost basis and holding period to the new ISIN", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2018-05-01", units: 100, pricePerUnit: 10, instrumentId: "OLD" }),
      tx({ transactionId: "m1", type: "MERGER_OUT", tradeDate: "2023-02-01", instrumentId: "OLD", relatedInstrumentId: "NEW", ratio: 0.5, linkId: "MG1" }),
    ],
    [mf("OLD"), mf("NEW")],
  );
  const oldPid = positionIdFor("acc1", "OLD", "F123");
  const newPid = positionIdFor("acc1", "NEW", "F123");

  assert.equal(openUnits(s.lots, oldPid), 0, "old scheme is emptied");
  assert.equal(openUnits(s.lots, newPid), 50, "units convert at the merger ratio");
  assert.equal(openCost(s.lots, newPid), 1000, "total cost basis is preserved, not reset");

  const carried = s.lots.find((l) => l.positionId === newPid)!;
  assert.equal(carried.acquiredOn, "2018-05-01", "holding period carries over — this is not a fresh purchase");
});

test("a paired MERGER_IN does not double-count after MERGER_OUT", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2018-05-01", units: 100, pricePerUnit: 10, instrumentId: "OLD" }),
      tx({ transactionId: "m1", type: "MERGER_OUT", tradeDate: "2023-02-01", instrumentId: "OLD", relatedInstrumentId: "NEW", ratio: 0.5, linkId: "MG1" }),
      tx({ transactionId: "m2", type: "MERGER_IN", tradeDate: "2023-02-01", instrumentId: "NEW", units: 50, pricePerUnit: 20, linkId: "MG1" }),
    ],
    [mf("OLD"), mf("NEW")],
  );
  assert.equal(openUnits(s.lots, positionIdFor("acc1", "NEW", "F123")), 50, "units must not double");
});

test("§6.5 side pocket becomes a separate position, keeps holding period, and is not a realised loss", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2019-09-01", units: 1000, pricePerUnit: 10, instrumentId: "DEBT" }),
      // 8% of the basis is carved into the segregated portfolio.
      tx({ transactionId: "sg1", type: "SEGREGATION", tradeDate: "2020-04-24", instrumentId: "DEBT", relatedInstrumentId: "DEBT_SP", ratio: 0.08 }),
    ],
    [mf("DEBT", { assetClass: "DEBT" }), mf("DEBT_SP", { assetClass: "DEBT", isSegregatedPortfolio: true })],
  );
  const mainPid = positionIdFor("acc1", "DEBT", "F123");
  const spPid = positionIdFor("acc1", "DEBT_SP", "F123");

  assert.equal(s.positions.length, 2, "the side pocket is its own position");
  assert.equal(s.disposals.length, 0, "carving a side pocket realises nothing");
  assert.equal(openUnits(s.lots, spPid), 1000, "unit-for-unit carve-out");
  assert.ok(Math.abs(openCost(s.lots, spPid) - 800) < 1e-9, "8% of basis moves across");
  assert.ok(Math.abs(openCost(s.lots, mainPid) - 9200) < 1e-9, "92% stays behind");
  assert.equal(s.lots.find((l) => l.positionId === spPid)!.acquiredOn, "2019-09-01");
  const sp = s.positions.find((p) => p.positionId === spPid)!;
  assert.equal(sp.segregatedFromPositionId, mainPid);
});

test("§6.8 a switch is a real redemption plus a real purchase", () => {
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2021-01-01", units: 100, pricePerUnit: 10, instrumentId: "FROM" }),
      tx({ transactionId: "so", type: "SWITCH_OUT", tradeDate: "2024-01-01", units: 100, pricePerUnit: 25, instrumentId: "FROM", linkId: "SW1" }),
      tx({ transactionId: "si", type: "SWITCH_IN", tradeDate: "2024-01-01", units: 50, pricePerUnit: 50, instrumentId: "TO", linkId: "SW1" }),
    ],
    [mf("FROM"), mf("TO")],
  );
  assert.equal(s.disposals.length, 1, "the switch-out is a taxable disposal, not a transfer");
  assert.equal(s.disposals[0].proceedsPerUnit, 25);
  const toLot = s.lots.find((l) => l.instrumentId === "TO")!;
  assert.equal(toLot.acquiredOn, "2024-01-01", "the switch-in starts a brand-new holding period");
});

test("§6.9 ELSS lock-in is stamped per instalment, not per folio", () => {
  const s = run(
    [
      tx({ transactionId: "s1", type: "BUY", tradeDate: "2023-01-10", units: 10, pricePerUnit: 100 }),
      tx({ transactionId: "s2", type: "BUY", tradeDate: "2023-02-10", units: 10, pricePerUnit: 100 }),
    ],
    [mf("A", { lockInMonths: 36 })],
  );
  const [first, second] = s.lots;
  assert.equal(first.lockInEndDate, "2026-01-10");
  assert.equal(second.lockInEndDate, "2026-02-10", "each SIP instalment unlocks on its own date");
});

test("a sell with no matching lot is flagged, never silently dropped", () => {
  const s = run(
    [tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-01-10", units: 100, pricePerUnit: 30 })],
    [mf("A")],
  );
  assert.equal(s.orphans.length, 1);
  assert.equal(s.orphans[0].unmatchedUnits, 100);
  assert.ok(s.warnings.some((w) => w.code === "ORPHAN_SELL" && w.severity === "BLOCKING"));
});

test("corporate actions are applied before same-day trades", () => {
  // Statement lists the sell first, but the split must land first or the
  // remaining unit count is wrong by 10x.
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2020-01-01", units: 100, pricePerUnit: 500 }),
      tx({ transactionId: "s1", type: "SELL", tradeDate: "2023-08-01", units: 500, pricePerUnit: 60 }),
      tx({ transactionId: "sp1", type: "SPLIT", tradeDate: "2023-08-01", ratio: 10 }),
    ],
    [mf("A")],
  );
  assert.equal(openUnits(s.lots, positionIdFor("acc1", "A", "F123")), 500);
});

test("a debt-fund position keeps lots on both sides of 1-Apr-2023 distinguishable", () => {
  // Phase 1 owes the tax engine lot-dated truth, not the tax rate itself (§6.10).
  const s = run(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-03-15", units: 100, pricePerUnit: 10 }),
      tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-05-15", units: 100, pricePerUnit: 11 }),
    ],
    [mf("A", { assetClass: "DEBT", taxRegimeKey: "DEBT_MF_POST_APR2023" })],
  );
  assert.equal(s.lots.length, 2);
  assert.deepEqual(s.lots.map((l) => l.acquiredOn), ["2023-03-15", "2023-05-15"]);
});
