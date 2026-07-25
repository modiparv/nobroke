/**
 * End-to-end Phase 1 pipeline.
 *
 * Every other suite tests one engine in isolation. This one runs the whole
 * "Truth" path exactly as production would:
 *
 *   CAS artifacts -> normalise -> ledger -> valuation -> reconcile -> net worth
 *
 * It exists because the modules were built independently against a shared
 * contract, and a contract that type-checks can still fail to compose: an
 * accountId minted by ingestion has to be the same accountId the ledger keys
 * positions by, and the statement rows ingestion emits have to be the ones
 * reconciliation can actually match.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { SEED_INSTRUMENTS, resolveTaxRegime } from "./data/instruments.ts";
import { createCasRowResolver, normaliseCasArtifacts, type RawArtifact } from "./ingest/cas.ts";
import { buildLedger, openUnits } from "./engines/ledger.ts";
import { createPriceBook } from "./engines/prices.ts";
import { valuePortfolio } from "./engines/valuation.ts";
import { reconcile } from "./engines/reconcile.ts";
import { computeNetWorth, decomposeChange } from "./engines/networth.ts";
import { createSnapshotStore } from "./engines/snapshots.ts";
import type { Account, AccountId, Instrument, InstrumentId, Liability, PricePoint } from "./domain/types.ts";

const HOUSEHOLD = "hh_1";
const MEMBER = "mem_self";
const AS_OF = "2024-06-28"; // a Friday
const FOLIO = "12345678/90";

const INSTRUMENTS: Record<InstrumentId, Instrument> = Object.fromEntries(
  SEED_INSTRUMENTS.map((i) => [i.instrumentId, i]),
);

/** CAMS eCAS: the equity SIP, an ELSS instalment, a redemption, a debt fund. */
const ECAS: RawArtifact = {
  artifactId: "cams_2024q1",
  sourceKind: "CAS_CAMS_KFINTECH",
  label: "CAMS eCAS FY24-25",
  receivedAt: "2024-07-01T00:00:00.000Z",
  statementPeriod: { from: "2023-01-01", to: AS_OF },
  householdId: HOUSEHOLD,
  memberId: MEMBER,
  panMasked: "ABCxxxx1F",
  rows: [
    // Parag Parikh Flexi Cap, Direct Growth: two SIP instalments then a partial exit.
    { folio: FOLIO, schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", isin: "INF879O01019", date: "2024-01-10", description: "Purchase - SIP", amount: 50000, units: 1000, nav: 50 },
    { folio: FOLIO, schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", isin: "INF879O01019", date: "2024-02-10", description: "Purchase - SIP", amount: 50000, units: 800, nav: 62.5 },
    {
      folio: FOLIO, schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", isin: "INF879O01019",
      date: "2024-05-10", description: "Redemption", amount: 32500, units: 500, nav: 65,
      closingBalanceUnits: 1300, closingValue: 91000, closingAsOf: AS_OF,
    },
    // ELSS: lock-in must be stamped per instalment, not per folio (§6.9).
    {
      folio: FOLIO, schemeName: "Mirae Asset ELSS Tax Saver Fund - Direct Plan - Growth", isin: "INF769K01DS4",
      date: "2024-01-10", description: "Purchase - SIP", amount: 25000, units: 1000, nav: 25,
      closingBalanceUnits: 1000, closingValue: 30000, closingAsOf: AS_OF,
    },
    // Debt fund with lots either side of the 2023-04-01 regime change (§6.10).
    { folio: FOLIO, schemeName: "ICICI Prudential Corporate Bond Fund - Direct Plan - Growth", isin: "INF109K01VQ1", date: "2023-03-15", description: "Purchase", amount: 10000, units: 1000, nav: 10 },
    {
      folio: FOLIO, schemeName: "ICICI Prudential Corporate Bond Fund - Direct Plan - Growth", isin: "INF109K01VQ1",
      date: "2023-05-15", description: "Purchase", amount: 11000, units: 1000, nav: 11,
      closingBalanceUnits: 2000, closingValue: 24000, closingAsOf: AS_OF,
    },
  ],
};

/**
 * NSDL depository CAS covering the SAME folio. The first SIP instalment is
 * printed here too, because the units are held in demat form. If the two
 * statements are not deduped against each other the portfolio doubles (§6.3).
 */
const DEMAT_CAS: RawArtifact = {
  artifactId: "nsdl_2024q1",
  sourceKind: "CAS_NSDL",
  label: "NSDL CAS FY24-25",
  receivedAt: "2024-07-01T00:00:00.000Z",
  statementPeriod: { from: "2023-01-01", to: AS_OF },
  householdId: HOUSEHOLD,
  memberId: MEMBER,
  rows: [
    { folio: FOLIO, schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", isin: "INF879O01019", date: "2024-01-10", description: "Purchase - SIP", amount: 50000, units: 1000, nav: 50 },
  ],
};

const PRICES: PricePoint[] = [
  { instrumentId: "MF_PPFC_DIR_G", asOf: AS_OF, price: 70, source: "AMFI" },
  { instrumentId: "MF_MIRAE_ELSS_DIR_G", asOf: AS_OF, price: 30, source: "AMFI" },
  { instrumentId: "MF_ICICI_CORPBOND_DIR_G", asOf: AS_OF, price: 12, source: "AMFI" },
];

const LIABILITIES: Liability[] = [
  { liabilityId: "li_1", householdId: HOUSEHOLD, memberId: MEMBER, kind: "PERSONAL_LOAN", lender: "HDFC", outstanding: 45000, asOf: AS_OF },
];

/** Run the whole Phase 1 path once and hand back every intermediate. */
function runPipeline() {
  const resolver = createCasRowResolver(SEED_INSTRUMENTS);
  const ingest = normaliseCasArtifacts([ECAS, DEMAT_CAS], resolver, { computedAt: "2024-07-01T00:00:00.000Z" });

  const accounts: Record<AccountId, Account> = Object.fromEntries(
    ingest.data.accounts.map((a) => [a.accountId, a]),
  );

  const ledger = buildLedger({ transactions: ingest.data.transactions, instruments: INSTRUMENTS, accounts });

  const valuation = valuePortfolio({
    householdId: HOUSEHOLD,
    asOf: AS_OF,
    positions: ledger.positions,
    lots: ledger.lots,
    instruments: INSTRUMENTS,
    accounts,
    priceBook: createPriceBook(PRICES),
  });

  const recon = reconcile({ asOf: AS_OF, ledger, statements: ingest.data.statements, valuation: valuation.data });

  const networth = computeNetWorth({ valuation, liabilities: LIABILITIES, accounts, instruments: INSTRUMENTS });

  return { ingest, accounts, ledger, valuation, recon, networth };
}

test("pipeline: CAS artifacts flow all the way to a reconciled net worth", () => {
  const { ingest, ledger, valuation, recon, networth } = runPipeline();

  assert.equal(ingest.data.unmapped.length, 0, "every seeded row should map to an instrument");
  assert.ok(ledger.positions.length > 0, "the ledger must produce positions from ingested transactions");
  assert.equal(ledger.orphans.length, 0, "no orphan sells in a complete statement");
  assert.equal(recon.data.passed, true, `reconciliation should pass, got: ${JSON.stringify(recon.data.checks.filter((c) => !c.passed))}`);
  assert.equal(networth.data.netWorth, networth.data.totalAssets - networth.data.totalLiabilities);
});

test("§6.3 the same purchase in the eCAS and the depository CAS is counted once", () => {
  const { ingest, ledger } = runPipeline();

  const ppfcBuys = ingest.data.transactions.filter(
    (t) => t.instrumentId === "MF_PPFC_DIR_G" && t.type === "BUY",
  );
  assert.equal(ppfcBuys.length, 2, "the duplicated January SIP must collapse to one buy");

  // 1000 + 800 bought, 500 redeemed.
  const pos = ledger.positions.find((p) => p.instrumentId === "MF_PPFC_DIR_G")!;
  assert.ok(Math.abs(openUnits(ledger.lots, pos.positionId) - 1300) < 1e-9, "double counting would show 2300 units");
});

test("the ledger's replayed units agree with the statement's own closing balance", () => {
  const { ingest, ledger, recon } = runPipeline();

  const unitChecks = recon.data.checks.filter((c) => c.kind === "UNITS");
  assert.ok(unitChecks.length >= 3, "each scheme with a closing balance should be unit-checked");
  assert.ok(unitChecks.every((c) => c.passed), "replayed units must match the statement");

  // The statement is the independent witness: we never adjust one to fit the other.
  const ppfcStatement = ingest.data.statements.find((s) => s.instrumentId === "MF_PPFC_DIR_G")!;
  assert.equal(ppfcStatement.closingUnits, 1300);
});

test("valuation prices open lots only, and net worth subtracts liabilities", () => {
  const { valuation, networth } = runPipeline();

  const ppfc = valuation.data.positions.find((p) => p.instrumentId === "MF_PPFC_DIR_G")!;
  assert.ok(Math.abs(ppfc.units - 1300) < 1e-9);
  assert.ok(Math.abs(ppfc.value - 91_000) < 0.01, "1300 units x NAV 70");
  // FIFO: the 500 redeemed units come off the 1000-unit lot bought at 50.
  assert.ok(Math.abs(ppfc.investedCost - 75_000) < 0.01, "500x50 remaining + 800x62.5");
  assert.ok(Math.abs(ppfc.unrealisedGain - 16_000) < 0.01);

  // 91,000 + 30,000 (ELSS) + 24,000 (debt) = 145,000
  assert.ok(Math.abs(valuation.data.totalAssets - 145_000) < 0.01);
  assert.ok(Math.abs(networth.data.totalAssets - 145_000) < 0.01);
  assert.ok(Math.abs(networth.data.totalLiabilities - 45_000) < 0.01);
  assert.ok(Math.abs(networth.data.netWorth - 100_000) < 0.01);
});

test("§6.10 one debt-fund position yields two different tax regimes across the Apr-2023 cutover", () => {
  const { ledger } = runPipeline();

  const debt = ledger.positions.find((p) => p.instrumentId === "MF_ICICI_CORPBOND_DIR_G")!;
  const lots = ledger.lots
    .filter((l) => l.positionId === debt.positionId)
    .sort((a, b) => (a.acquiredOn < b.acquiredOn ? -1 : 1));
  assert.equal(lots.length, 2);

  const instrument = INSTRUMENTS["MF_ICICI_CORPBOND_DIR_G"];
  assert.equal(resolveTaxRegime(instrument, lots[0].acquiredOn), "DEBT_MF_PRE_APR2023");
  assert.equal(resolveTaxRegime(instrument, lots[1].acquiredOn), "DEBT_MF_POST_APR2023");
});

test("§6.9 ELSS lock-in survives ingestion and lands on the lot", () => {
  const { ledger } = runPipeline();

  const elss = ledger.lots.find((l) => l.instrumentId === "MF_MIRAE_ELSS_DIR_G")!;
  assert.equal(elss.acquiredOn, "2024-01-10");
  assert.equal(elss.lockInEndDate, "2027-01-10", "36 months from THIS instalment");
});

test("every engine hands back its provenance, so no figure is unattributable", () => {
  const { ingest, valuation, recon, networth } = runPipeline();

  for (const [name, res] of Object.entries({ ingest, valuation, recon, networth })) {
    assert.equal(res.asOf !== undefined, true, `${name} must carry asOf`);
    assert.ok(typeof res.computedAt === "string", `${name} must carry computedAt`);
    assert.ok(Array.isArray(res.warnings), `${name} must carry warnings`);
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(res.confidence), `${name} must carry confidence`);
    assert.equal(typeof res.assumptions, "object", `${name} must carry assumptions`);
  }
});

test("a snapshot round-trips and the change identity holds across the pipeline", () => {
  const { valuation, ingest } = runPipeline();

  const store = createSnapshotStore();
  store.put(valuation.data);
  assert.ok(store.latest(HOUSEHOLD), "the snapshot must be retrievable");

  // Opening from nothing: the whole closing value is contribution plus growth.
  const decomposition = decomposeChange(undefined, valuation.data, ingest.data.transactions);
  const d = decomposition.data;
  assert.ok(
    Math.abs(d.openingValue + d.netContribution + d.marketMovement - d.closingValue) < 0.01,
    "opening + contribution + movement must equal closing exactly",
  );
});

test("a missing price degrades confidence rather than valuing the position at zero", () => {
  const resolver = createCasRowResolver(SEED_INSTRUMENTS);
  const ingest = normaliseCasArtifacts([ECAS], resolver, { computedAt: "2024-07-01T00:00:00.000Z" });
  const accounts: Record<AccountId, Account> = Object.fromEntries(ingest.data.accounts.map((a) => [a.accountId, a]));
  const ledger = buildLedger({ transactions: ingest.data.transactions, instruments: INSTRUMENTS, accounts });

  // Price book deliberately missing the ELSS and debt schemes.
  const valuation = valuePortfolio({
    householdId: HOUSEHOLD,
    asOf: AS_OF,
    positions: ledger.positions,
    lots: ledger.lots,
    instruments: INSTRUMENTS,
    accounts,
    priceBook: createPriceBook([PRICES[0]]),
  });

  assert.equal(valuation.data.hasUnvaluedPositions, true);
  assert.equal(valuation.confidence, "LOW", "an unpriced position cannot leave the portfolio HIGH confidence");
  assert.ok(valuation.warnings.length > 0, "the unpriced position must be named, not silently zeroed");

  const networth = computeNetWorth({ valuation, liabilities: LIABILITIES, accounts, instruments: INSTRUMENTS });
  assert.equal(networth.confidence, "LOW", "net worth must not out-confide its own valuation");
});
