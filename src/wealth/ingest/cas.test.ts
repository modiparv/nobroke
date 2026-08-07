/**
 * CAS ingestion tests.
 *
 * The expensive failures in this layer are quiet ones: a portfolio counted
 * twice because the same units sit in two statements (§6.3), a real holding
 * deleted because it looked like a duplicate, a switch collapsed into one leg
 * (§6.8), or a row dropped because nobody recognised its narration. Each of
 * those gets an explicit assertion.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyDescription, createCasRowResolver, dedupeKeyFor, dedupeTransactions,
  normaliseCas, normaliseCasArtifacts,
  type ParsedRow, type RawArtifact,
} from "./cas.ts";
import { buildLedger, positionIdFor } from "../engines/ledger.ts";
import type { Instrument, InstrumentId, Transaction } from "../domain/types.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const AXIS_DIRECT = mf("AXIS_BC_DIR", {
  isin: "INF846K01EW2",
  name: "Axis Bluechip Fund - Direct Plan - Growth",
});
const AXIS_REGULAR = mf("AXIS_BC_REG", {
  isin: "INF846K01131",
  name: "Axis Bluechip Fund - Regular Plan - Growth",
  plan: "REGULAR",
});
const PARAG = mf("PPFAS_DIR", {
  isin: "INF879O01019",
  name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
});

function row(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    folio: "9876543 / 21",
    schemeName: AXIS_DIRECT.name,
    isin: AXIS_DIRECT.isin,
    date: "2024-05-10",
    description: "Purchase - SIP",
    amount: 5000,
    units: 100.5,
    nav: 49.7512,
    ...over,
  };
}

function artifact(over: Partial<RawArtifact> = {}): RawArtifact {
  return {
    artifactId: "art-ecas",
    sourceKind: "CAS_CAMS_KFINTECH",
    receivedAt: "2024-07-01T10:00:00.000Z",
    statementPeriod: { from: "2024-04-01", to: "2024-06-30" },
    householdId: "hh1",
    memberId: "m1",
    rows: [],
    ...over,
  };
}

const REGISTRY = createCasRowResolver([AXIS_DIRECT, AXIS_REGULAR, PARAG]);
const FIXED = { computedAt: "2024-07-01T12:00:00.000Z" };

// ---------------------------------------------------------------------------
// §6.3 cross-source dedupe
// ---------------------------------------------------------------------------

test("§6.3 the same buy in the eCAS and the depository CAS survives exactly once", () => {
  // NSDL republishes RTA folios alongside true demat holdings, with the folio
  // spaced differently. Ingesting both must not double the portfolio.
  const ecas = artifact({ artifactId: "art-ecas", rows: [row()] });
  const demat = artifact({
    artifactId: "art-nsdl",
    sourceKind: "CAS_NSDL",
    rows: [row({ folio: "9876543/21", holdingMode: "SOA" })],
  });

  const res = normaliseCasArtifacts([ecas, demat], REGISTRY, FIXED);

  assert.equal(res.data.transactions.length, 1, "the same units must not be counted twice");
  assert.equal(res.data.transactions[0].sourceId, "art-ecas", "the first source wins");
  assert.equal(res.data.accounts.length, 1, "one folio is one account regardless of how many statements list it");

  const dup = res.warnings.find((w) => w.code === "DUPLICATE_DROPPED");
  assert.ok(dup, "the drop must be reported, not silent");
  assert.equal(dup!.severity, "INFO");
  assert.match(dup!.message, /art-nsdl/, "the warning names what was dropped");
  assert.match(dup!.message, /art-ecas/, "and what it duplicated");
  assert.equal(res.dataSources.length, 2, "both statements stay in the provenance trail");
});

test("§6.3 dedupe still fires when the depository reports the units as demat-held", () => {
  const ecas = artifact({ artifactId: "art-ecas", rows: [row()] });
  const demat = artifact({
    artifactId: "art-nsdl",
    sourceKind: "CAS_NSDL", // holdingMode defaults to DEMAT
    rows: [row()],
  });

  const res = normaliseCasArtifacts([ecas, demat], REGISTRY, FIXED);

  assert.equal(res.data.transactions.length, 1, "custody mode must not defeat the natural key");
  assert.equal(res.data.accounts.length, 1, "the demat account has nothing left pointing at it");
  assert.equal(res.data.accounts[0].holdingMode, "SOA");
});

test("§6.3 same ISIN, date and units in DIFFERENT folios are both kept, with a warning", () => {
  const a = artifact({
    rows: [row({ folio: "111/11" }), row({ folio: "222/22" })],
  });

  const res = normaliseCas(a, REGISTRY, FIXED);

  assert.equal(res.data.transactions.length, 2, "two folios are two real holdings, never one");
  assert.equal(res.data.accounts.length, 2);
  const near = res.warnings.find((w) => w.code === "NEAR_DUPLICATE_FOLIOS");
  assert.ok(near, "a human must be asked before anything is deleted");
  assert.equal(near!.severity, "WARN");
  assert.match(near!.message, /111\/11/);
  assert.match(near!.message, /222\/22/);
});

test("dedupe leaves genuinely different rows alone", () => {
  const a = artifact({
    rows: [
      row({ units: 100.5, amount: 5000 }),
      row({ units: 40.2, amount: 2000 }), // same folio, same day, different size
    ],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions.length, 2);
  assert.equal(res.warnings.filter((w) => w.code === "DUPLICATE_DROPPED").length, 0);
});

test("dedupeTransactions is a pure engine returning the standard envelope", () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    transactionId: "t?", accountId: "a1", instrumentId: "A", folioNumber: "F1",
    type: "BUY", tradeDate: "2024-01-05", units: 10, amount: 100, ...over,
  });
  const input = [t({ transactionId: "t1" }), t({ transactionId: "t2" }), t({ transactionId: "t3", tradeDate: "2024-02-05" })];
  const res = dedupeTransactions(input, FIXED);

  assert.equal(res.data.kept.length, 2);
  assert.equal(res.data.dropped.length, 1);
  assert.equal(res.data.dropped[0].duplicateOf, "t1");
  assert.equal(res.asOf, "2024-02-05", "asOf falls back to the latest trade date");
  assert.equal(res.computedAt, FIXED.computedAt, "no hidden clock");
  assert.equal(input.length, 3, "the input array is not mutated");
});

test("the dedupe key ignores folio formatting but not folio identity", () => {
  const base = { instrumentId: "A", tradeDate: "2024-05-10", type: "BUY" as const, units: 100.5, amount: 5000 };
  assert.equal(
    dedupeKeyFor({ ...base, folioNumber: "9876543 / 21" }, "INF846K01EW2"),
    dedupeKeyFor({ ...base, folioNumber: "9876543/21" }, "INF846K01EW2"),
  );
  assert.notEqual(
    dedupeKeyFor({ ...base, folioNumber: "111" }, "INF846K01EW2"),
    dedupeKeyFor({ ...base, folioNumber: "222" }, "INF846K01EW2"),
  );
  // Units at 4dp and amounts at 2dp are the statement's own precision (§6.20).
  assert.equal(
    dedupeKeyFor({ ...base, folioNumber: "F", units: 100.50000001 }),
    dedupeKeyFor({ ...base, folioNumber: "F", units: 100.5 }),
  );
});

// ---------------------------------------------------------------------------
// §6.8 switches
// ---------------------------------------------------------------------------

test("§6.8 a switch produces two linked transactions, not one transfer", () => {
  const a = artifact({
    rows: [
      row({ description: "Switch Out - To Parag Parikh Flexi Cap", units: -80, amount: 4200, nav: 52.5 }),
      row({
        description: "Switch In - From Axis Bluechip",
        schemeName: PARAG.name, isin: PARAG.isin, units: 60, amount: 4200, nav: 70,
      }),
    ],
  });

  const res = normaliseCas(a, REGISTRY, FIXED);
  const [out, into] = res.data.transactions;

  assert.equal(res.data.transactions.length, 2, "both legs are real events");
  assert.equal(out.type, "SWITCH_OUT");
  assert.equal(into.type, "SWITCH_IN");
  assert.ok(out.linkId, "the legs must be linked");
  assert.equal(out.linkId, into.linkId);
  assert.equal(out.relatedInstrumentId, PARAG.instrumentId);
  assert.equal(into.relatedInstrumentId, AXIS_DIRECT.instrumentId);
  assert.equal(out.units, 80, "the redemption leg is stored as a positive magnitude");

  // And the ledger treats it as a disposal plus a fresh holding period.
  const state = buildLedger({
    transactions: [
      { transactionId: "seed", accountId: out.accountId, instrumentId: AXIS_DIRECT.instrumentId, folioNumber: out.folioNumber, type: "BUY", tradeDate: "2021-01-01", units: 80, pricePerUnit: 20 },
      ...res.data.transactions,
    ],
    instruments: { [AXIS_DIRECT.instrumentId]: AXIS_DIRECT, [PARAG.instrumentId]: PARAG },
    accounts: Object.fromEntries(res.data.accounts.map((acc) => [acc.accountId, acc])),
  });
  assert.equal(state.disposals.length, 1, "the switch-out realises units");
  assert.equal(state.lots.find((l) => l.instrumentId === PARAG.instrumentId)!.acquiredOn, "2024-05-10");
});

test("a switch leg with no counter-leg is flagged rather than quietly halved", () => {
  const a = artifact({ rows: [row({ description: "Switch Out", units: -80, amount: 4200, nav: 52.5 })] });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions.length, 1, "the leg we do have is still real");
  assert.ok(res.warnings.some((w) => w.code === "UNPAIRED_LEG" && w.severity === "WARN"));
});

test("§6.4 merger legs are linked and the conversion ratio is derived from the units", () => {
  const a = artifact({
    rows: [
      row({ description: "Redemption due to Merger", units: 100, amount: 0, nav: undefined }),
      row({ description: "Units allotted on Merger", schemeName: PARAG.name, isin: PARAG.isin, units: 50, amount: 0 }),
    ],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  const [out, into] = res.data.transactions;

  assert.equal(out.type, "MERGER_OUT");
  assert.equal(into.type, "MERGER_IN");
  assert.equal(out.linkId, into.linkId);
  assert.equal(out.relatedInstrumentId, PARAG.instrumentId);
  assert.equal(out.ratio, 0.5, "50 new units for 100 old ones");
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test("real CAS narrations classify case-insensitively", () => {
  const cases: Array<[string, string]> = [
    ["Purchase", "BUY"],
    ["PURCHASE - SIP", "BUY"],
    ["Systematic Investment", "BUY"],
    ["purchase-sip installment no 12", "BUY"],
    ["Redemption", "SELL"],
    ["Systematic Withdrawal", "SELL"],
    ["Repurchase", "SELL"],
    ["Switch Out", "SWITCH_OUT"],
    ["Switch Over Out", "SWITCH_OUT"],
    ["switch in", "SWITCH_IN"],
    ["Switch Over In", "SWITCH_IN"],
    ["Dividend Payout", "IDCW_PAYOUT"],
    ["IDCW Payout", "IDCW_PAYOUT"],
    ["Dividend Reinvestment", "IDCW_REINVEST"],
    ["IDCW Reinvest", "IDCW_REINVEST"],
    ["Bonus", "BONUS"],
    ["Bonus Units Allotted", "BONUS"],
    ["Stock Split", "SPLIT"],
    ["Split", "SPLIT"],
    ["Merger Out", "MERGER_OUT"],
    ["Merger In", "MERGER_IN"],
    ["Segregated Portfolio Creation", "SEGREGATION"],
    ["Side Pocket", "SEGREGATION"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(classifyDescription(text), expected, `"${text}" should classify as ${expected}`);
  }
});

test("ambiguous narrations classify as nothing rather than as something plausible", () => {
  // A bare dividend could be a payout or a reinvestment, and a reinvestment
  // creates a lot (§6.2). A merger without a direction would either carry cost
  // basis over or destroy it (§6.4). Neither is guessable.
  assert.equal(classifyDescription("Dividend"), undefined);
  assert.equal(classifyDescription("Merger"), undefined);
  assert.equal(classifyDescription("*** Reversal ***"), undefined);
  assert.equal(classifyDescription(""), undefined);
});

test("an unrecognised narration lands in unmapped and is escalated, never dropped", () => {
  const a = artifact({
    rows: [row(), row({ description: "Adjustment towards NAV rectification", units: 3.21, amount: 160 })],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);

  assert.equal(res.data.transactions.length, 1);
  assert.equal(res.data.unmapped.length, 1, "the row is preserved for a human");
  assert.equal(res.data.unmapped[0].description, "Adjustment towards NAV rectification");

  const w = res.warnings.find((w) => w.code === "UNCLASSIFIED_DESCRIPTION");
  assert.ok(w);
  assert.equal(w!.severity, "BLOCKING", "it carries units, so the portfolio total is wrong without it");
  assert.equal(res.confidence, "LOW");
});

test("a row whose scheme is not in the master is quarantined with its units", () => {
  const a = artifact({ rows: [row({ schemeName: "Some Unknown Fund - Growth", isin: "INF000X00001" })] });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions.length, 0);
  assert.equal(res.data.unmapped.length, 1);
  assert.ok(res.warnings.some((w) => w.code === "UNRESOLVED_INSTRUMENT" && w.severity === "BLOCKING"));
});

test("an unmappable balance line is escalated too, because it hides a whole holding", () => {
  const a = artifact({
    rows: [row({
      schemeName: "Some Unknown Fund - Growth", isin: "INF000X00001",
      description: "Closing Unit Balance", units: undefined, amount: undefined, closingBalanceUnits: 812.4,
    })],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.statements.length, 0);
  assert.equal(res.data.unmapped.length, 1);
  assert.ok(res.warnings.some((w) => w.code === "UNRESOLVED_INSTRUMENT" && w.severity === "BLOCKING"));
});

test("a row with an unusable date cannot be placed on the timeline and is quarantined", () => {
  const a = artifact({ rows: [row({ date: "10-May-2024" })] });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions.length, 0);
  assert.equal(res.data.unmapped.length, 1);
  assert.ok(res.warnings.some((w) => w.code === "INVALID_ROW_DATE" && w.severity === "BLOCKING"));
});

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

test("STT, stamp duty and exit load printed in the narration reach the transaction", () => {
  const a = artifact({
    rows: [
      row({ description: "Purchase - SIP ***Stamp Duty Rs. 0.25***", units: 100, amount: 5000 }),
      row({ description: "Redemption *** STT 12.50 *** Exit Load: 1,050.75", units: -100, amount: 6000, nav: 60 }),
    ],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  const [buy, sell] = res.data.transactions;

  assert.equal(buy.stampDuty, 0.25);
  assert.equal(sell.stt, 12.5);
  assert.equal(sell.exitLoad, 1050.75, "thousands separators are stripped");
  assert.equal(sell.type, "SELL");
});

test("explicit charge columns win over anything parsed out of the narration", () => {
  const a = artifact({ rows: [row({ description: "Redemption *** STT 12.50 ***", units: -10, stt: 9.99, tds: 300 })] });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions[0].stt, 9.99);
  assert.equal(res.data.transactions[0].tds, 300);
});

// ---------------------------------------------------------------------------
// Statement balances
// ---------------------------------------------------------------------------

test("closing balances become StatementBalance rows for the reconciler", () => {
  const a = artifact({
    rows: [row({ closingBalanceUnits: 1234.5678, closingValue: 61425.31 })],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);

  assert.equal(res.data.statements.length, 1);
  const s = res.data.statements[0];
  assert.equal(s.instrumentId, AXIS_DIRECT.instrumentId);
  assert.equal(s.folioNumber, "9876543 / 21");
  assert.equal(s.closingUnits, 1234.5678);
  assert.equal(s.closingValue, 61425.31);
  assert.equal(s.asOf, "2024-06-30", "a CAS closing figure is as of the period end");
  assert.equal(s.accountId, res.data.accounts[0].accountId);
  assert.equal(res.data.transactions.length, 1, "the same row is still a transaction");
});

test("a standalone closing balance line is a balance, not an unmapped row", () => {
  const a = artifact({
    rows: [row(), row({ description: "Closing Unit Balance", units: undefined, amount: undefined, unitBalance: 300.75 })],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.unmapped.length, 0);
  assert.equal(res.data.statements.length, 1);
  assert.equal(res.data.statements[0].closingUnits, 300.75);
});

test("an opening balance means history we do not have, and says so", () => {
  const a = artifact({
    rows: [row({ description: "Opening Unit Balance", units: undefined, amount: undefined, unitBalance: 500 })],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions.length, 0, "an opening balance is not a purchase");
  assert.equal(res.data.statements[0].asOf, "2024-04-01");
  assert.equal(res.data.statements[0].closingUnits, 500);
  assert.ok(res.warnings.some((w) => w.code === "OPENING_BALANCE_WITHOUT_HISTORY"));
});

test("two sources that agree on a closing balance collapse; two that disagree both survive", () => {
  const agree = normaliseCasArtifacts(
    [
      artifact({ artifactId: "a1", rows: [row({ closingBalanceUnits: 100 })] }),
      artifact({ artifactId: "a2", sourceKind: "CAS_NSDL", rows: [row({ closingBalanceUnits: 100, holdingMode: "SOA" })] }),
    ],
    REGISTRY, FIXED,
  );
  assert.equal(agree.data.statements.length, 1);
  assert.ok(agree.warnings.some((w) => w.code === "DUPLICATE_STATEMENT_BALANCE" && w.severity === "INFO"));

  const disagree = normaliseCasArtifacts(
    [
      artifact({ artifactId: "a1", rows: [row({ closingBalanceUnits: 100 })] }),
      artifact({ artifactId: "a2", sourceKind: "CAS_NSDL", rows: [row({ closingBalanceUnits: 140, holdingMode: "SOA" })] }),
    ],
    REGISTRY, FIXED,
  );
  assert.equal(disagree.data.statements.length, 2, "reconciliation needs both figures to describe the break");
  assert.ok(disagree.warnings.some((w) => w.code === "STATEMENT_BALANCE_CONFLICT" && w.severity === "WARN"));
});

// ---------------------------------------------------------------------------
// Instrument registry
// ---------------------------------------------------------------------------

test("§6.1 Direct and Regular rows of one scheme resolve to different instruments", () => {
  const a = artifact({
    rows: [
      row({ isin: undefined, schemeName: "AXIS BLUECHIP FUND-DIRECT PLAN-GROWTH", folio: "111" }),
      row({ isin: undefined, schemeName: "Axis Bluechip Fund - Regular Plan - Growth Option", folio: "222" }),
    ],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);

  assert.equal(res.data.transactions.length, 2);
  assert.equal(res.data.transactions[0].instrumentId, AXIS_DIRECT.instrumentId);
  assert.equal(res.data.transactions[1].instrumentId, AXIS_REGULAR.instrumentId);
  assert.ok(
    res.warnings.some((w) => w.code === "INSTRUMENT_MATCHED_BY_NAME"),
    "a name match is weaker than an ISIN match and must be declared",
  );
  assert.equal(res.confidence, "MEDIUM");
});

test("ISIN beats the scheme name when the two disagree", () => {
  const r = createCasRowResolver([AXIS_DIRECT, AXIS_REGULAR]);
  const m = r.resolve({ folio: "1", schemeName: "Axis Bluechip Fund - Regular Plan - Growth", isin: "INF846K01EW2", date: "2024-05-10", description: "Purchase" });
  assert.equal(m!.instrument.instrumentId, AXIS_DIRECT.instrumentId);
  assert.equal(m!.basis, "ISIN");
});

test("a scheme name with no plan token reads as Regular, and an ambiguous one resolves to nothing", () => {
  const r = createCasRowResolver([AXIS_DIRECT, AXIS_REGULAR]);
  const noPlan = r.resolve({ folio: "1", schemeName: "Axis Bluechip Fund - Growth", date: "2024-05-10", description: "Purchase" });
  assert.equal(noPlan!.instrument.instrumentId, AXIS_REGULAR.instrumentId, "distributor statements omit 'Regular'");

  // §6.2: an IDCW variant that is not in the master must not fall back to Growth.
  const wrongOption = r.resolve({ folio: "1", schemeName: "Axis Bluechip Fund - Direct Plan - IDCW", date: "2024-05-10", description: "Purchase" });
  assert.equal(wrongOption, undefined);
});

test("the AMFI code resolves a row that carries no ISIN", () => {
  const coded = mf("SBI_SC", { isin: undefined, amfiCode: "125497", name: "SBI Small Cap Fund - Direct - Growth" });
  const r = createCasRowResolver([coded]);
  const m = r.resolve({ folio: "1", schemeName: "SBI SMALLCAP", amfiCode: "125497", date: "2024-05-10", description: "Purchase" });
  assert.equal(m!.basis, "AMFI_CODE");
  assert.equal(m!.instrument.instrumentId, "SBI_SC");
});

// ---------------------------------------------------------------------------
// Folios and accounts
// ---------------------------------------------------------------------------

test("two folios of one scheme under one PAN become two accounts and two positions", () => {
  const a = artifact({
    rows: [
      row({ folio: "111/11", units: 100, amount: 5000, date: "2024-04-10" }),
      row({ folio: "222/22", units: 250, amount: 12500, date: "2024-05-10" }),
    ],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);

  assert.equal(res.data.accounts.length, 2, "folios never merge: FIFO, exit load and lock-in all run per folio");
  assert.notEqual(res.data.transactions[0].accountId, res.data.transactions[1].accountId);
  assert.deepEqual(res.data.accounts.map((acc) => acc.accountRef).sort(), ["111/11", "222/22"]);
  assert.equal(res.data.accounts[0].kind, "MF_FOLIO");
  assert.equal(res.data.accounts[0].memberId, "m1");
  assert.equal(res.data.accounts[0].householdId, "hh1");

  const state = buildLedger({
    transactions: res.data.transactions,
    instruments: { [AXIS_DIRECT.instrumentId]: AXIS_DIRECT },
    accounts: Object.fromEntries(res.data.accounts.map((acc) => [acc.accountId, acc])),
  });
  assert.equal(state.positions.length, 2, "one scheme in two folios is two positions");
  const first = res.data.transactions[0];
  assert.ok(state.positions.some((p) => p.positionId === positionIdFor(first.accountId, AXIS_DIRECT.instrumentId, "111/11")));
});

test("a demat CAS row builds a demat account, not an MF folio", () => {
  const a = artifact({
    artifactId: "art-nsdl",
    sourceKind: "CAS_NSDL",
    rows: [row({ folio: "IN300214-1234XXXX" })],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.accounts[0].kind, "DEMAT");
  assert.equal(res.data.accounts[0].holdingMode, "DEMAT");
  assert.equal(res.data.accounts[0].provider, "NSDL");
});

// ---------------------------------------------------------------------------
// Corporate actions that a statement under-describes
// ---------------------------------------------------------------------------

test("§6.5 a side pocket is attached to its parent scheme and its cost split is declared unknown", () => {
  const parent = mf("DEBT_FUND", { isin: "INF209K01ZZ1", name: "Franklin Ultra Short Bond Fund - Direct - Growth", assetClass: "DEBT" });
  const pocket = mf("DEBT_FUND_SP", {
    isin: "INF209K01ZZ9",
    name: "Franklin Ultra Short Bond Fund - Segregated Portfolio 1 - Direct - Growth",
    assetClass: "DEBT",
    isSegregatedPortfolio: true,
    parentInstrumentId: "DEBT_FUND",
  });
  const r = createCasRowResolver([parent, pocket]);
  const a = artifact({
    rows: [row({ schemeName: pocket.name, isin: pocket.isin, description: "Segregated Portfolio Creation", units: 1000, amount: 0 })],
  });

  const res = normaliseCas(a, r, FIXED);
  const t = res.data.transactions[0];
  assert.equal(t.type, "SEGREGATION");
  assert.equal(t.instrumentId, "DEBT_FUND", "the carve-out is applied to the position it came out of");
  assert.equal(t.relatedInstrumentId, "DEBT_FUND_SP");
  assert.ok(res.warnings.some((w) => w.code === "SEGREGATION_COST_SPLIT_UNKNOWN"));
});

test("§6.7 a split with no ratio is flagged instead of guessed from '1:10'", () => {
  const a = artifact({ rows: [row({ description: "Stock Split", units: undefined, amount: undefined })] });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions[0].type, "SPLIT");
  assert.equal(res.data.transactions[0].ratio, undefined);
  assert.ok(res.warnings.some((w) => w.code === "SPLIT_RATIO_MISSING"));

  const supplied = normaliseCas(
    artifact({ rows: [row({ description: "Stock Split", units: undefined, amount: undefined, ratio: 10 })] }),
    REGISTRY, FIXED,
  );
  assert.equal(supplied.data.transactions[0].ratio, 10);
  assert.equal(supplied.warnings.filter((w) => w.code === "SPLIT_RATIO_MISSING").length, 0);
});

test("an IDCW payout and an IDCW reinvestment are different events", () => {
  const a = artifact({
    rows: [
      row({ description: "IDCW Payout", units: undefined, amount: 750 }),
      row({ description: "IDCW Reinvestment", units: 15.05, amount: 750, nav: 49.8339 }),
    ],
  });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions[0].type, "IDCW_PAYOUT");
  assert.equal(res.data.transactions[0].units, undefined, "a payout adds no units");
  assert.equal(res.data.transactions[1].type, "IDCW_REINVEST");
  assert.equal(res.data.transactions[1].units, 15.05, "a reinvestment is a fresh lot with a fresh holding period");
});

test("a purchase row carrying negative units is normalised and questioned", () => {
  const a = artifact({ rows: [row({ description: "Purchase", units: -100.5 })] });
  const res = normaliseCas(a, REGISTRY, FIXED);
  assert.equal(res.data.transactions[0].units, 100.5);
  assert.ok(res.warnings.some((w) => w.code === "NEGATIVE_INFLOW_UNITS"));
});

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

test("the result carries provenance, and a clean statement is HIGH confidence", () => {
  const a = artifact({ label: "CAMS eCAS Apr-Jun 2024", rows: [row()] });
  const res = normaliseCas(a, REGISTRY, FIXED);

  assert.equal(res.asOf, "2024-06-30");
  assert.equal(res.computedAt, FIXED.computedAt);
  assert.equal(res.confidence, "HIGH");
  assert.deepEqual(res.dataSources, [{ kind: "CAS_CAMS_KFINTECH", label: "CAMS eCAS Apr-Jun 2024", asOf: "2024-06-30" }]);
  assert.equal(res.warnings.length, 0);
  assert.ok(res.assumptions.switchPairing);
  assert.ok(res.data.transactions[0].dedupeKey, "every transaction is persisted with its natural key");
  assert.equal(res.data.transactions[0].sourceId, "art-ecas");
});

test("an empty statement is not an error", () => {
  const res = normaliseCas(artifact({ rows: [] }), REGISTRY, FIXED);
  assert.deepEqual(res.data.transactions, []);
  assert.deepEqual(res.data.accounts, []);
  assert.deepEqual(res.data.statements, []);
  assert.deepEqual(res.data.unmapped, []);
  assert.equal(res.confidence, "HIGH");
});
