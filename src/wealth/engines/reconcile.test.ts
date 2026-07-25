/**
 * Reconciliation tests (spec §2.3).
 *
 * The engine's whole job is to refuse to be quietly wrong, so each test pins a
 * specific way a portfolio app goes quietly wrong: units drifting from the
 * custodian, a value drifting from the statement, a sell whose purchase we
 * never saw, one holding counted twice across SOA and DEMAT, and a stale mark
 * presented as today's price.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLedger, positionIdFor, type LedgerState } from "./ledger.ts";
import {
  reconcile, STALE_PRICE_MAX_TRADING_DAYS,
  type ReconciliationCheck, type ReconciliationCheckKind, type StatementBalance,
} from "./reconcile.ts";
import { hasBlocking } from "../domain/result.ts";
import type {
  Account, AccountId, Instrument, InstrumentId, PositionValuation, Transaction, ValuationSnapshot,
} from "../domain/types.ts";

/** 2024-06-14 is a Friday, so weekend arithmetic in the staleness rule is visible. */
const AS_OF = "2024-06-14";

function inst(instrumentId: InstrumentId, over: Partial<Instrument> = {}): Instrument {
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

const ACCOUNTS: Record<AccountId, Account> = {
  "acc-mf": {
    accountId: "acc-mf", householdId: "hh1", memberId: "m1", kind: "MF_FOLIO",
    provider: "CAMS", accountRef: "F1", holdingMode: "SOA",
  },
  "acc-dm": {
    accountId: "acc-dm", householdId: "hh1", memberId: "m1", kind: "DEMAT",
    provider: "NSDL", accountRef: "IN300***", holdingMode: "DEMAT",
  },
  "acc-ph": {
    accountId: "acc-ph", householdId: "hh1", memberId: "m1", kind: "PHYSICAL",
    provider: "SELF", holdingMode: "PHYSICAL",
  },
};

function tx(over: Partial<Transaction> & Pick<Transaction, "transactionId" | "type" | "tradeDate">): Transaction {
  return { accountId: "acc-mf", instrumentId: "ALPHA", folioNumber: "F1", ...over } as Transaction;
}

function ledgerOf(txns: Transaction[], instruments: Instrument[] = [inst("ALPHA"), inst("BETA")]): LedgerState {
  return buildLedger({
    transactions: txns,
    instruments: Object.fromEntries(instruments.map((i) => [i.instrumentId, i])),
    accounts: ACCOUNTS,
  });
}

function stmt(
  over: Partial<StatementBalance> & Pick<StatementBalance, "instrumentId" | "closingUnits">,
): StatementBalance {
  return { accountId: "acc-mf", folioNumber: "F1", asOf: AS_OF, ...over };
}

function pv(
  over: Partial<PositionValuation> & Pick<PositionValuation, "positionId" | "instrumentId" | "value">,
): PositionValuation {
  return {
    accountId: "acc-mf",
    memberId: "m1",
    units: 100,
    price: 15,
    investedCost: 1000,
    unrealisedGain: 500,
    method: "UNITS_X_NAV",
    priceAsOf: AS_OF,
    priceSource: "AMFI",
    stalePrice: false,
    illiquid: false,
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    ...over,
  };
}

function snapshot(positions: PositionValuation[]): ValuationSnapshot {
  return {
    householdId: "hh1",
    asOf: AS_OF,
    currency: "INR",
    positions,
    totalAssets: positions.reduce((s, p) => s + p.value, 0),
    totalInvestedCost: positions.reduce((s, p) => s + p.investedCost, 0),
    totalUnrealisedGain: positions.reduce((s, p) => s + p.unrealisedGain, 0),
    hasStalePrices: false,
    hasUnvaluedPositions: false,
  };
}

const ALPHA_POS = positionIdFor("acc-mf", "ALPHA", "F1");
const ALPHA_DEMAT_POS = positionIdFor("acc-dm", "ALPHA", "");

/** The happy-path ledger used by most tests: 100 units of ALPHA bought at 10. */
function baseLedger(): LedgerState {
  return ledgerOf([tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10 })]);
}

function find(checks: ReconciliationCheck[], kind: ReconciliationCheckKind, subjectId: string): ReconciliationCheck {
  const hit = checks.find((c) => c.kind === kind && c.subjectId === subjectId);
  assert.ok(hit, `expected a ${kind} check for ${subjectId}`);
  return hit;
}

// ---------------------------------------------------------------------------

test("a portfolio that agrees with its statements passes with HIGH confidence", () => {
  const ledger = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10 }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-05-10", units: 50, pricePerUnit: 20, accountId: "acc-dm", instrumentId: "BETA", folioNumber: undefined }),
  ]);
  const betaPos = positionIdFor("acc-dm", "BETA", "");

  const res = reconcile({
    asOf: AS_OF,
    ledger,
    statements: [
      stmt({ instrumentId: "ALPHA", closingUnits: 100, closingValue: 1500 }),
      stmt({ accountId: "acc-dm", folioNumber: "", instrumentId: "BETA", closingUnits: 50, closingValue: 1250 }),
    ],
    valuation: snapshot([
      pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1500 }),
      pv({ positionId: betaPos, instrumentId: "BETA", accountId: "acc-dm", units: 50, price: 25, value: 1250 }),
    ]),
  });

  assert.equal(res.data.passed, true);
  assert.equal(res.data.blockingCount, 0);
  assert.equal(res.data.warnCount, 0);
  assert.equal(res.data.positionsChecked, 2);
  assert.deepEqual(res.data.positionsWithoutStatement, []);
  assert.equal(res.confidence, "HIGH");
  assert.equal(res.warnings.length, 0, "a clean run must raise no warnings at all");
  assert.ok(res.data.checks.every((c) => c.passed), "every check should pass");
  assert.equal(res.asOf, AS_OF);
  // Both units and value were compared for both positions, plus one price freshness check each.
  assert.equal(res.data.checks.filter((c) => c.kind === "UNITS").length, 2);
  assert.equal(res.data.checks.filter((c) => c.kind === "VALUE").length, 2);
  assert.equal(res.data.checks.filter((c) => c.kind === "STALE_PRICE").length, 2);
});

test("a 0.0005 unit difference is inside tolerance and passes", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100.0005 })],
  });

  const check = find(res.data.checks, "UNITS", ALPHA_POS);
  assert.equal(check.passed, true);
  assert.equal(check.difference, -0.0005);
  assert.equal(res.data.passed, true);
  assert.equal(res.data.blockingCount, 0);
  assert.equal(res.confidence, "HIGH");
});

test("a 0.05 unit difference breaks reconciliation and blocks the whole report", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100.05 })],
  });

  const check = find(res.data.checks, "UNITS", ALPHA_POS);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "BLOCKING");
  assert.equal(check.expected, 100.05);
  assert.equal(check.actual, 100);
  assert.equal(check.difference, -0.05);

  assert.equal(res.data.passed, false);
  assert.equal(res.data.blockingCount, 1);
  assert.equal(res.confidence, "LOW");
  assert.ok(hasBlocking(res.warnings), "a failed units check must reach the UI as a blocking warning");
  assert.ok(res.warnings.some((w) => w.code === "RECON_UNITS_MISMATCH" && w.subjectId === ALPHA_POS));
});

test("a 0.4% value difference passes but 2% breaks, without blocking the report", () => {
  const near = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, closingValue: 1500 })],
    valuation: snapshot([pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1506 })]), // +0.4%
  });
  assert.equal(find(near.data.checks, "VALUE", ALPHA_POS).passed, true);
  assert.equal(near.data.warnCount, 0);
  assert.equal(near.confidence, "HIGH");

  const far = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, closingValue: 1500 })],
    valuation: snapshot([pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1530 })]), // +2%
  });
  const check = find(far.data.checks, "VALUE", ALPHA_POS);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "WARN");
  assert.equal(check.expected, 1500);
  assert.equal(check.actual, 1530);
  assert.equal(check.difference, 30);

  // Units still agree, so the holding is known and only the price is doubted.
  assert.equal(find(far.data.checks, "UNITS", ALPHA_POS).passed, true);
  assert.equal(far.data.passed, true, "a price disagreement must not claim the portfolio is unknown");
  assert.equal(far.data.warnCount, 1);
  assert.equal(far.data.blockingCount, 0);
  assert.equal(far.confidence, "MEDIUM");
  assert.ok(far.warnings.some((w) => w.code === "RECON_VALUE_MISMATCH" && w.severity === "WARN"));
});

test("an orphan sell forces the report to fail: cost basis is unknowable", () => {
  const ledger = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 40, pricePerUnit: 10 }),
    tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-01-10", units: 100, pricePerUnit: 30 }),
  ]);
  assert.equal(ledger.orphans.length, 1, "precondition: the ledger found the orphan");

  const res = reconcile({ asOf: AS_OF, ledger, statements: [] });

  const check = find(res.data.checks, "ORPHANS", ALPHA_POS);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "BLOCKING");
  assert.equal(check.actual, 60, "40 units were matched, 60 were not");
  assert.equal(res.data.passed, false);
  assert.equal(res.data.blockingCount, 1);
  assert.equal(res.confidence, "LOW");
  assert.ok(res.warnings.some((w) => w.code === "RECON_ORPHAN_SELL" && w.severity === "BLOCKING"));
});

test("every orphan is surfaced, never just the first", () => {
  const ledger = ledgerOf([
    tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-01-10", units: 10, pricePerUnit: 30 }),
    tx({ transactionId: "s2", type: "SELL", tradeDate: "2024-02-10", units: 20, pricePerUnit: 31 }),
  ]);
  const res = reconcile({ asOf: AS_OF, ledger, statements: [] });
  assert.equal(res.data.checks.filter((c) => c.kind === "ORPHANS").length, 2);
  assert.equal(res.data.blockingCount, 2);
});

test("a price 5 trading days old is flagged stale", () => {
  // 2024-06-07 is the Friday before: Mon-Fri of the following week make 5.
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100 })],
    priceAsOfByInstrument: { ALPHA: "2024-06-07" },
  });

  const check = find(res.data.checks, "STALE_PRICE", "ALPHA");
  assert.equal(check.passed, false);
  assert.equal(check.severity, "WARN");
  assert.equal(check.actual, 5);
  assert.equal(check.expected, STALE_PRICE_MAX_TRADING_DAYS);
  assert.equal(res.data.warnCount, 1);
  assert.equal(res.data.passed, true, "a stale price is a disclosure, not a data-integrity failure");
  assert.equal(res.confidence, "MEDIUM");
  assert.ok(res.warnings.some((w) => w.code === "RECON_STALE_PRICE" && w.subjectId === "ALPHA"));
});

test("a price 2 trading days old is still fresh, and a weekend does not age it", () => {
  const res = reconcile({
    asOf: AS_OF, // Friday
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100 })],
    priceAsOfByInstrument: { ALPHA: "2024-06-12" }, // Wednesday: Thu + Fri = 2
  });
  const check = find(res.data.checks, "STALE_PRICE", "ALPHA");
  assert.equal(check.actual, 2);
  assert.equal(check.passed, true);

  // Monday report against Friday's NAV: the weekend must not count.
  const overWeekend = reconcile({
    asOf: "2024-06-17", // Monday
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, asOf: "2024-06-17" })],
    priceAsOfByInstrument: { ALPHA: "2024-06-14" },
  });
  assert.equal(find(overWeekend.data.checks, "STALE_PRICE", "ALPHA").actual, 1);
  assert.equal(overWeekend.confidence, "HIGH");
});

test("the price date is taken from the valuation snapshot when no override is given", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, closingValue: 1500 })],
    valuation: snapshot([pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1500, priceAsOf: "2024-06-07" })]),
  });
  const check = find(res.data.checks, "STALE_PRICE", "ALPHA");
  assert.equal(check.passed, false);
  assert.equal(check.actual, 5);
});

test("a stale price for an instrument we do not hold is ignored", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100 })],
    priceAsOfByInstrument: { ALPHA: AS_OF, GAMMA: "2020-01-01" },
  });
  assert.equal(res.data.checks.filter((c) => c.kind === "STALE_PRICE").length, 1);
  assert.equal(res.confidence, "HIGH");
});

test("a position with no statement row is reported but does not fail the run", () => {
  const ledger = ledgerOf(
    [
      tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10 }),
      tx({ transactionId: "g1", type: "BUY", tradeDate: "2021-08-01", units: 50, pricePerUnit: 4800, accountId: "acc-ph", instrumentId: "GOLD", folioNumber: undefined }),
    ],
    [inst("ALPHA"), inst("GOLD", { instrumentType: "GOLD_PHYSICAL", assetClass: "COMMODITY", taxRegimeKey: "GOLD" })],
  );
  const goldPos = positionIdFor("acc-ph", "GOLD", "");

  const res = reconcile({
    asOf: AS_OF,
    ledger,
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100 })],
  });

  assert.deepEqual(res.data.positionsWithoutStatement, [goldPos]);
  assert.equal(res.data.positionsChecked, 1, "only the position a statement covered was checked");
  const coverage = find(res.data.checks, "COVERAGE", goldPos);
  assert.equal(coverage.severity, "INFO");
  assert.equal(coverage.actual, 50);
  assert.equal(res.data.passed, true);
  assert.equal(res.data.blockingCount, 0);
  assert.equal(res.data.warnCount, 0);
  assert.equal(res.confidence, "HIGH", "an unverifiable manual asset is disclosed, not doubted");
  assert.ok(res.warnings.some((w) => w.code === "RECON_NO_STATEMENT" && w.severity === "INFO"));
});

test("a fully exited position is not reported as missing a statement", () => {
  const ledger = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10 }),
    tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-02-10", units: 100, pricePerUnit: 15 }),
  ]);
  const res = reconcile({ asOf: AS_OF, ledger, statements: [] });
  assert.deepEqual(res.data.positionsWithoutStatement, [], "nothing is held, so there is nothing to verify");
  assert.equal(res.data.checks.length, 0);
  assert.equal(res.confidence, "HIGH");
});

test("a statement row the ledger knows nothing about blocks the report", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [
      stmt({ instrumentId: "ALPHA", closingUnits: 100 }),
      stmt({ instrumentId: "BETA", folioNumber: "F9", closingUnits: 500 }),
    ],
  });

  const check = find(res.data.checks, "UNITS", positionIdFor("acc-mf", "BETA", "F9"));
  assert.equal(check.passed, false);
  assert.equal(check.severity, "BLOCKING");
  assert.equal(check.actual, 0);
  assert.equal(check.expected, 500);
  assert.match(check.message, /never ingested/);
  assert.equal(res.data.passed, false);
  assert.equal(res.data.positionsChecked, 2);
});

test("§6.3 the same scheme under SOA and DEMAT with equal units is flagged as double-counted", () => {
  const ledger = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10 }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10, accountId: "acc-dm", folioNumber: undefined }),
  ]);

  const res = reconcile({
    asOf: AS_OF,
    ledger,
    statements: [
      stmt({ instrumentId: "ALPHA", closingUnits: 100 }),
      stmt({ accountId: "acc-dm", folioNumber: "", instrumentId: "ALPHA", closingUnits: 100 }),
    ],
  });

  const dup = res.data.checks.filter((c) => c.kind === "DUPLICATES");
  assert.equal(dup.length, 1, "one pair, reported once");
  assert.equal(dup[0].passed, false);
  assert.equal(dup[0].severity, "WARN");
  assert.equal(dup[0].checkId, `DUPLICATES:${[ALPHA_POS, ALPHA_DEMAT_POS].sort()[0]}|${[ALPHA_POS, ALPHA_DEMAT_POS].sort()[1]}`);
  // Both units checks pass on their own: only the cross-source view sees the problem.
  assert.ok(res.data.checks.filter((c) => c.kind === "UNITS").every((c) => c.passed));
  assert.equal(res.data.passed, true);
  assert.equal(res.data.warnCount, 1);
  assert.equal(res.confidence, "MEDIUM");
  assert.ok(res.warnings.some((w) => w.code === "RECON_DUPLICATE_POSITION"));
});

test("duplicate detection tolerates statement rounding but not genuinely different sizes", () => {
  const near = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 1000, pricePerUnit: 10 }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-04-10", units: 1000.5, pricePerUnit: 10, accountId: "acc-dm", folioNumber: undefined }),
  ]);
  assert.equal(
    reconcile({ asOf: AS_OF, ledger: near, statements: [] }).data.checks.filter((c) => c.kind === "DUPLICATES").length,
    1,
    "0.05% apart is the same holding rounded differently",
  );

  const apart = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 1000, pricePerUnit: 10 }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-04-10", units: 900, pricePerUnit: 10, accountId: "acc-dm", folioNumber: undefined }),
  ]);
  assert.equal(
    reconcile({ asOf: AS_OF, ledger: apart, statements: [] }).data.checks.filter((c) => c.kind === "DUPLICATES").length,
    0,
    "10% apart is two real holdings",
  );
});

test("two folios of one scheme in the same account are not a duplicate", () => {
  // Same holding mode and same account: this is ordinary, not a cross-source echo.
  const ledger = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10, folioNumber: "F1" }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10, folioNumber: "F2" }),
  ]);
  const res = reconcile({ asOf: AS_OF, ledger, statements: [] });
  assert.equal(res.data.checks.filter((c) => c.kind === "DUPLICATES").length, 0);
});

test("no valuation snapshot means no value checks, and units still reconcile", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, closingValue: 1500 })],
  });
  assert.equal(res.data.checks.filter((c) => c.kind === "VALUE").length, 0);
  assert.equal(res.data.checks.filter((c) => c.kind === "UNITS").length, 1);
  assert.equal(res.data.passed, true);
  assert.equal(res.assumptions.valuationSupplied, false);
});

test("a valued position the statement priced at nothing is disclosed, not silently skipped", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100 })], // suspended NAV: units but no value
    valuation: snapshot([pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1500 })]),
  });
  const check = find(res.data.checks, "VALUE", ALPHA_POS);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "INFO");
  assert.equal(check.actual, 1500);
  assert.equal(res.data.passed, true);
  assert.equal(res.confidence, "HIGH");
  assert.ok(res.warnings.some((w) => w.code === "RECON_NO_STATEMENT_VALUE"));
});

test("a statement position missing from the valuation is disclosed, not silently skipped", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, closingValue: 1500 })],
    valuation: snapshot([]),
  });
  const check = find(res.data.checks, "VALUE", ALPHA_POS);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "INFO");
  assert.ok(res.warnings.some((w) => w.code === "RECON_NOT_VALUED"));
});

test("the later of two statements for one position wins, and the other is disclosed", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [
      stmt({ instrumentId: "ALPHA", closingUnits: 90, asOf: "2024-03-31" }),
      stmt({ instrumentId: "ALPHA", closingUnits: 100, asOf: "2024-05-31" }),
    ],
  });
  assert.equal(res.data.positionsChecked, 1, "one position, not two contradictory checks");
  assert.equal(find(res.data.checks, "UNITS", ALPHA_POS).passed, true, "the 2024-05-31 balance is the live one");
  assert.ok(res.warnings.some((w) => w.code === "RECON_STATEMENT_SUPERSEDED"));
});

test("a statement dated after the report date is called out", () => {
  const res = reconcile({
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100, asOf: "2024-07-31" })],
  });
  assert.ok(res.warnings.some((w) => w.code === "RECON_STATEMENT_AFTER_ASOF" && w.severity === "WARN"));
  assert.equal(res.confidence, "MEDIUM", "comparing against a future balance cannot be HIGH confidence");
});

test("the result carries its provenance and tolerances", () => {
  const res = reconcile({ asOf: AS_OF, ledger: baseLedger(), statements: [] });
  assert.equal(res.asOf, AS_OF);
  assert.equal(res.dataSources[0].kind, "DERIVED");
  assert.equal(res.assumptions.unitsTolerance, 0.001);
  assert.equal(res.assumptions.valueTolerancePct, 0.005);
  assert.equal(res.assumptions.stalePriceMaxTradingDays, 2);
  assert.equal(res.assumptions.exchangeHolidaysModelled, false);
  assert.ok(res.computedAt.length > 0);
});

test("reconcile is pure: the same input twice gives the same report", () => {
  const input = {
    asOf: AS_OF,
    ledger: baseLedger(),
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 100.05, closingValue: 1500 })],
    valuation: snapshot([pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1530 })]),
  };
  const a = reconcile(input);
  const b = reconcile(input);
  assert.deepEqual(a.data, b.data);
  assert.deepEqual(a.warnings, b.warnings);
});

test("every failing check has a matching warning on the envelope", () => {
  // A single portfolio carrying one of every break at once.
  const ledger = ledgerOf([
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10 }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2023-04-10", units: 100, pricePerUnit: 10, accountId: "acc-dm", folioNumber: undefined }),
    tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-01-10", units: 500, pricePerUnit: 30, instrumentId: "BETA", folioNumber: "F7" }),
  ]);

  const res = reconcile({
    asOf: AS_OF,
    ledger,
    statements: [stmt({ instrumentId: "ALPHA", closingUnits: 111, closingValue: 1500 })],
    valuation: snapshot([pv({ positionId: ALPHA_POS, instrumentId: "ALPHA", value: 1800 })]),
    priceAsOfByInstrument: { ALPHA: "2024-06-07" },
  });

  const failed = res.data.checks.filter((c) => c.passed === false);
  assert.ok(failed.length >= 4);
  for (const f of failed) {
    assert.ok(
      res.warnings.some((w) => w.severity === f.severity && w.subjectId === f.subjectId),
      `failing ${f.kind} check on ${f.subjectId} must raise a ${f.severity} warning`,
    );
  }
  assert.equal(res.data.passed, false);
  assert.equal(res.confidence, "LOW");
  // Check ids are unique so a UI can key on them.
  assert.equal(new Set(res.data.checks.map((c) => c.checkId)).size, res.data.checks.length);
});
