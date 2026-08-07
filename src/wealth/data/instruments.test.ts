/**
 * Instrument master tests. Each one pins a rule that, if it broke, would be
 * invisible in the UI and wrong in the tax file: a lot-dated regime key (§6.10),
 * gold collapsing into a single treatment, Direct and Regular sharing an ISIN
 * (§6.1), Growth and IDCW sharing one (§6.2), and identity resolution guessing
 * when it should refuse.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEBT_MF_REGIME_CUTOVER, ELSS_LOCK_IN_MONTHS, SEED_INSTRUMENTS, buildInstrumentMaster,
  createInstrumentRegistry, equityContentFromComposition, isSgbHeldToMaturity, lockInEndFor,
  normalizeInstrumentName, resolveGoldTreatment, resolveTaxRegime, resolveTaxRegimeDetailed,
  sgbRedemptionWindow,
} from "./instruments.ts";
import type { Composition, Instrument, InstrumentId } from "../domain/types.ts";

const REGISTRY = createInstrumentRegistry(SEED_INSTRUMENTS);

function seed(instrumentId: InstrumentId): Instrument {
  const found = REGISTRY.byId(instrumentId);
  assert.ok(found, `seed is missing ${instrumentId}`);
  return found;
}

/** Ad-hoc instrument for the branches the seed does not need to carry. */
function inst(over: Partial<Instrument> & Pick<Instrument, "instrumentId" | "instrumentType">): Instrument {
  return {
    name: over.instrumentId,
    assetClass: "EQUITY",
    taxRegimeKey: "SLAB_ONLY",
    liquidityTier: "T3",
    riskBand: 3,
    currency: "INR",
    listingStatus: "LISTED",
    plan: "NA",
    option: "NA",
    ...over,
  } as Instrument;
}

// ---------------------------------------------------------------------------
// §6.10 the cutover
// ---------------------------------------------------------------------------

test("§6.10 ONE debt-MF instrument resolves to two different regimes across 1-Apr-2023", () => {
  const debtFund = seed("MF_ICICI_CORPBOND_DIR_G");

  // Same instrument object, same folio, two lots: the acquisition date decides.
  assert.equal(resolveTaxRegime(debtFund, "2023-03-15"), "DEBT_MF_PRE_APR2023");
  assert.equal(resolveTaxRegime(debtFund, "2023-05-15"), "DEBT_MF_POST_APR2023");
  assert.notEqual(resolveTaxRegime(debtFund, "2023-03-15"), resolveTaxRegime(debtFund, "2023-05-15"));
});

test("§6.10 the cutover boundary is inclusive of 1-Apr-2023", () => {
  const debtFund = seed("MF_ICICI_CORPBOND_DIR_G");
  assert.equal(resolveTaxRegime(debtFund, "2023-03-31"), "DEBT_MF_PRE_APR2023");
  assert.equal(resolveTaxRegime(debtFund, DEBT_MF_REGIME_CUTOVER), "DEBT_MF_POST_APR2023");
});

test("only lot-dated regimes are flagged date sensitive", () => {
  assert.equal(resolveTaxRegimeDetailed(seed("MF_ICICI_CORPBOND_DIR_G"), "2024-01-01").dateSensitive, true);
  assert.equal(resolveTaxRegimeDetailed(seed("MF_SBI_LIQUID_DIR_G"), "2024-01-01").dateSensitive, true);
  assert.equal(resolveTaxRegimeDetailed(seed("MF_PPFC_DIR_G"), "2024-01-01").dateSensitive, false);
  assert.equal(resolveTaxRegimeDetailed(seed("STK_HDFCBANK"), "2024-01-01").dateSensitive, false);
});

test("a liquid fund follows the debt cutover too, not the equity regime", () => {
  const liquid = seed("MF_SBI_LIQUID_DIR_G");
  assert.equal(resolveTaxRegime(liquid, "2022-12-01"), "DEBT_MF_PRE_APR2023");
  assert.equal(resolveTaxRegime(liquid, "2024-12-01"), "DEBT_MF_POST_APR2023");
});

// ---------------------------------------------------------------------------
// Gold: one asset class, four treatments
// ---------------------------------------------------------------------------

test("gold ETF, gold fund, physical gold and an SGB do not share one treatment path", () => {
  const etf = seed("ETF_GOLDBEES");
  const fund = seed("MF_SBI_GOLD_DIR_G");
  const physical = seed("GOLD_PHYSICAL_24K");
  const sgb = seed("SGB_2016_17_SERIES_IV");

  const paths = [
    resolveGoldTreatment(etf),
    resolveGoldTreatment(fund),
    resolveGoldTreatment(physical),
    resolveGoldTreatment(sgb, "2025-03-17"),
  ];
  assert.deepEqual(paths, ["GOLD_ETF", "GOLD_FUND", "GOLD_PHYSICAL", "SGB_MATURITY_EXEMPT"]);
  assert.equal(new Set(paths).size, 4, "four instruments, four treatments");

  // They DO share the coarse GOLD key, which is exactly why the key alone must
  // never be the thing a tax engine branches on.
  for (const g of [etf, fund, physical, sgb]) {
    assert.equal(resolveTaxRegime(g, "2024-01-01"), "GOLD");
  }
  assert.equal(resolveTaxRegimeDetailed(sgb, "2024-01-01").coarse, true, "SGB must be flagged coarse");
  assert.equal(resolveTaxRegimeDetailed(etf, "2024-01-01").coarse, true, "a gold ETF is not the same asset as a bangle");
  assert.equal(resolveGoldTreatment(seed("ETF_NIFTYBEES")), "NOT_GOLD");
  assert.equal(resolveGoldTreatment(seed("MF_PPFC_DIR_G")), "NOT_GOLD");
});

test("an SGB sold on the exchange before maturity is a different path from one redeemed at maturity", () => {
  const sgb = seed("SGB_2016_17_SERIES_IV");

  assert.equal(isSgbHeldToMaturity(sgb, "2025-03-16"), false, "one day short of maturity is an exchange sale");
  assert.equal(isSgbHeldToMaturity(sgb, "2025-03-17"), true);
  assert.equal(isSgbHeldToMaturity(sgb, "2026-01-01"), true);

  assert.equal(resolveGoldTreatment(sgb, "2024-06-01"), "SGB_SECONDARY_SALE");
  assert.equal(resolveGoldTreatment(sgb, "2025-03-17"), "SGB_MATURITY_EXEMPT");
  // Without a disposal date we assume the taxable route, never the exemption.
  assert.equal(resolveGoldTreatment(sgb), "SGB_SECONDARY_SALE");
});

test("the SGB predicate is false for anything that is not an SGB, and for an SGB with no dates", () => {
  assert.equal(isSgbHeldToMaturity(seed("ETF_GOLDBEES"), "2030-01-01"), false);
  assert.equal(isSgbHeldToMaturity(inst({ instrumentId: "SGB_X", instrumentType: "SGB" }), "2030-01-01"), false);
});

test("SGB dates cover issue, the year-5 RBI window and maturity", () => {
  const w = sgbRedemptionWindow(seed("SGB_2016_17_SERIES_IV"));
  assert.deepEqual(w, { issuedOn: "2017-03-17", earlyRedemptionFrom: "2022-03-17", maturesOn: "2025-03-17" });
  assert.equal(sgbRedemptionWindow(seed("ETF_GOLDBEES")), undefined);

  // Tenor is derived when only the issue date is known.
  const derived = sgbRedemptionWindow(
    inst({ instrumentId: "SGB_Y", instrumentType: "SGB", accrual: { annualRate: 0.025, compounding: "SIMPLE", startDate: "2020-08-11" } }),
  );
  assert.equal(derived?.maturesOn, "2028-08-11");
});

// ---------------------------------------------------------------------------
// §6.1 / §6.2 identity must never collapse
// ---------------------------------------------------------------------------

test("§6.1 Direct and Regular plans of one scheme are separate rows with separate ISINs", () => {
  const direct = seed("MF_PPFC_DIR_G");
  const regular = seed("MF_PPFC_REG_G");

  assert.notEqual(direct.instrumentId, regular.instrumentId);
  assert.notEqual(direct.isin, regular.isin);
  assert.notEqual(direct.amfiCode, regular.amfiCode);
  assert.equal(direct.plan, "DIRECT");
  assert.equal(regular.plan, "REGULAR");
  // Same scheme, so the only thing separating them in a statement is the plan.
  assert.ok(direct.name.startsWith("Parag Parikh Flexi Cap Fund"));
  assert.ok(regular.name.startsWith("Parag Parikh Flexi Cap Fund"));
});

test("§6.2 Growth and IDCW variants of one plan have different ISINs", () => {
  const growth = seed("MF_PPFC_DIR_G");
  const idcw = seed("MF_PPFC_DIR_IDCW");

  assert.notEqual(growth.instrumentId, idcw.instrumentId);
  assert.notEqual(growth.isin, idcw.isin);
  assert.equal(growth.option, "GROWTH");
  assert.equal(idcw.option, "IDCW_PAYOUT");
  assert.equal(growth.plan, idcw.plan, "same plan, so only the option distinguishes them");
});

test("every ISIN in the seed is unique and ISIN-shaped", () => {
  const isins = SEED_INSTRUMENTS.map((i) => i.isin).filter((i): i is string => !!i);
  assert.equal(new Set(isins).size, isins.length, "a shared ISIN would merge two schemes");
  for (const isin of isins) assert.match(isin, /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/);
});

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

test("resolveIdentity finds an instrument by ISIN and by AMFI code", () => {
  assert.equal(REGISTRY.resolveIdentity({ isin: "INF879O01019" })?.instrumentId, "MF_PPFC_DIR_G");
  assert.equal(REGISTRY.resolveIdentity({ amfiCode: "122640" })?.instrumentId, "MF_PPFC_REG_G");
  assert.equal(REGISTRY.resolveIdentity({ amfiCode: "122641" })?.instrumentId, "MF_PPFC_DIR_IDCW");
  assert.equal(REGISTRY.resolveIdentity({ isin: "nope" }), undefined);
});

test("identifier normalisation survives statement formatting", () => {
  // Lowercase ISIN, padded and space-wrapped AMFI code, lowercase symbol.
  assert.equal(REGISTRY.byIsin(" inf879o01019 ")?.instrumentId, "MF_PPFC_DIR_G");
  assert.equal(REGISTRY.byAmfiCode(" 0122639 ")?.instrumentId, "MF_PPFC_DIR_G");
  assert.equal(REGISTRY.resolveIdentity({ symbol: " goldbees " })?.instrumentId, "ETF_GOLDBEES");
});

test("resolveIdentity matches a name whose punctuation and abbreviations differ", () => {
  const match = REGISTRY.resolveIdentityDetailed({ name: "PARAG PARIKH FLEXI CAP FUND-DIR PLAN-GROWTH OPTION" });
  assert.equal(match.instrument?.instrumentId, "MF_PPFC_DIR_G");
  assert.equal(match.matchedBy, "NAME");
  // The 2021 rename: a statement that still says DIVIDEND means IDCW.
  assert.equal(
    REGISTRY.resolveIdentity({ name: "Parag Parikh Flexi Cap Fund - Direct Plan - Dividend Payout" })?.instrumentId,
    "MF_PPFC_DIR_IDCW",
  );
});

test("§6.1 a name with no plan token resolves to nothing rather than guessing Direct vs Regular", () => {
  const match = REGISTRY.resolveIdentityDetailed({ name: "Parag Parikh Flexi Cap Fund - Growth" });
  assert.equal(match.instrument, undefined);
  assert.equal(match.matchedBy, "NONE");
});

test("two rows that normalise to the same name are reported as ambiguous, never picked", () => {
  const registry = createInstrumentRegistry([
    inst({ instrumentId: "A1", instrumentType: "MF", isin: "INF999A01011", name: "Acme Bluechip Fund - Growth Option" }),
    inst({ instrumentId: "A2", instrumentType: "MF", isin: "INF999A01029", name: "Acme Bluechip Fund Growth" }),
  ]);
  const match = registry.resolveIdentityDetailed({ name: "Acme Bluechip Fund - Growth" });

  assert.equal(match.instrument, undefined, "an ambiguous name must not resolve");
  assert.equal(match.ambiguous, true);
  assert.equal(match.matchedBy, "NAME");
  assert.deepEqual(match.candidates.map((c) => c.instrumentId).sort(), ["A1", "A2"]);
  assert.equal(registry.resolveIdentity({ name: "Acme Bluechip Fund - Growth" }), undefined);
});

test("ISIN wins over a disagreeing AMFI code, and the disagreement is reported", () => {
  const match = REGISTRY.resolveIdentityDetailed({ isin: "INF879O01019", amfiCode: "122640" });
  assert.equal(match.instrument?.instrumentId, "MF_PPFC_DIR_G", "ISIN is the stronger identifier");
  assert.equal(match.matchedBy, "ISIN");
  assert.ok(match.conflict?.includes("MF_PPFC_REG_G"), "the conflicting row must be named, not swallowed");
});

test("a weak identifier still resolves when the strong one is absent from the master", () => {
  const match = REGISTRY.resolveIdentityDetailed({ isin: "INF000UNKNOWN9", amfiCode: "122639" });
  assert.equal(match.instrument?.instrumentId, "MF_PPFC_DIR_G");
  assert.equal(match.matchedBy, "AMFI_CODE");
  assert.equal(match.conflict, undefined);
});

test("normalizeInstrumentName keeps plan and option tokens and drops noise", () => {
  assert.equal(
    normalizeInstrumentName("HDFC Flexi Cap Fund - Direct Plan - Growth Option"),
    "HDFC FLEXI CAP FUND DIRECT GROWTH",
  );
  assert.notEqual(
    normalizeInstrumentName("HDFC Flexi Cap Fund - Direct - Growth"),
    normalizeInstrumentName("HDFC Flexi Cap Fund - Regular - Growth"),
  );
  assert.equal(normalizeInstrumentName("ICICI Pru & Co. Ltd"), "ICICI PRU AND CO LIMITED");
});

// ---------------------------------------------------------------------------
// Registry mechanics
// ---------------------------------------------------------------------------

test("upsert returns a new registry and leaves the original untouched", () => {
  const base = createInstrumentRegistry([seed("MF_PPFC_DIR_G")]);
  const added = base.upsert(inst({ instrumentId: "NEW", instrumentType: "STOCK", isin: "INE111A01019", symbol: "NEWCO" }));

  assert.equal(base.all().length, 1);
  assert.equal(added.all().length, 2);
  assert.equal(base.byId("NEW"), undefined, "the receiver must not see the upsert");
  assert.equal(added.byId("NEW")?.instrumentId, "NEW");
  assert.equal(added.byIsin("INE111A01019")?.instrumentId, "NEW", "indexes are rebuilt, not stale");
});

test("upsert replaces a row by instrumentId, last write winning", () => {
  const updated = createInstrumentRegistry(SEED_INSTRUMENTS).upsert({ ...seed("STK_HDFCBANK"), listingStatus: "DELISTED" });
  assert.equal(updated.all().length, SEED_INSTRUMENTS.length, "an upsert of an existing id must not duplicate it");
  assert.equal(updated.byId("STK_HDFCBANK")?.listingStatus, "DELISTED");
  assert.equal(REGISTRY.byId("STK_HDFCBANK")?.listingStatus, "LISTED");
});

test("all() hands out a copy, so a caller cannot mutate the master", () => {
  const rows = REGISTRY.all();
  rows.pop();
  assert.equal(REGISTRY.all().length, SEED_INSTRUMENTS.length);
});

// ---------------------------------------------------------------------------
// Lock-in
// ---------------------------------------------------------------------------

test("§6.9 lockInEndFor gives ELSS 36 months from EACH instalment date", () => {
  const elss = seed("MF_MIRAE_ELSS_DIR_G");
  assert.equal(elss.lockInMonths, ELSS_LOCK_IN_MONTHS);
  assert.equal(lockInEndFor(elss, "2024-01-10"), "2027-01-10");
  assert.equal(lockInEndFor(elss, "2024-02-10"), "2027-02-10");
  assert.notEqual(lockInEndFor(elss, "2024-01-10"), lockInEndFor(elss, "2024-02-10"));
  // Month-end clamp: a leap-day instalment unlocks on 28-Feb.
  assert.equal(lockInEndFor(elss, "2024-02-29"), "2027-02-28");
});

test("lockInEndFor: ULIP defaults to 60 months, a tax-saver FD to its stated 60", () => {
  assert.equal(lockInEndFor(inst({ instrumentId: "ULIP_X", instrumentType: "ULIP" }), "2024-05-01"), "2029-05-01");
  assert.equal(lockInEndFor(seed("ULIP_BAJAJ_GOAL_ASSURE"), "2024-05-01"), "2029-05-01");
  assert.equal(lockInEndFor(seed("FD_HDFC_TAXSAVER_5Y"), "2023-06-15"), "2028-06-15");
});

test("lockInEndFor: an absolute account maturity beats the lot date, and an unlocked fund has none", () => {
  // PPF matures on its own calendar, not 15 years after a contribution.
  assert.equal(lockInEndFor(seed("PPF_SBI"), "2024-04-05"), "2032-03-31");
  assert.equal(lockInEndFor(seed("MF_PPFC_DIR_G"), "2024-01-10"), undefined);
  assert.equal(lockInEndFor(seed("ETF_NIFTYBEES"), "2024-01-10"), undefined);
  assert.equal(lockInEndFor(seed("NPS_TIER1_SCHEME_E"), "2024-01-10"), undefined, "NPS unlocks on the member's age, not the instrument");
});

// ---------------------------------------------------------------------------
// The rest of the regime map
// ---------------------------------------------------------------------------

test("listed, delisted and unlisted equity are three different keys", () => {
  const listed = seed("STK_HDFCBANK");
  assert.equal(resolveTaxRegime(listed, "2024-01-01"), "LISTED_EQUITY");
  assert.equal(resolveTaxRegime({ ...listed, listingStatus: "DELISTED" }, "2024-01-01"), "UNLISTED_EQUITY");
  assert.equal(resolveTaxRegime({ ...listed, listingStatus: "UNLISTED" }, "2024-01-01"), "UNLISTED_EQUITY");
  // A suspended scrip is still a listed security.
  assert.equal(resolveTaxRegime({ ...listed, listingStatus: "SUSPENDED" }, "2024-01-01"), "LISTED_EQUITY");
  assert.equal(resolveTaxRegime(seed("ETF_NIFTYBEES"), "2024-01-01"), "LISTED_EQUITY");
});

test("ESOP, RSU and unlisted shares resolve to UNLISTED_EQUITY", () => {
  for (const t of ["ESOP", "RSU", "UNLISTED"] as const) {
    assert.equal(resolveTaxRegime(inst({ instrumentId: `X_${t}`, instrumentType: t }), "2024-01-01"), "UNLISTED_EQUITY");
  }
});

test("interest-bearing instruments resolve to SLAB_ONLY, crypto to VDA, property to PROPERTY", () => {
  for (const t of ["FD", "RD", "PPF", "EPF", "NPS", "BOND"] as const) {
    assert.equal(resolveTaxRegime(inst({ instrumentId: `X_${t}`, instrumentType: t }), "2024-01-01"), "SLAB_ONLY");
  }
  assert.equal(resolveTaxRegime(inst({ instrumentId: "X_CRYPTO", instrumentType: "CRYPTO" }), "2024-01-01"), "VDA");
  assert.equal(resolveTaxRegime(inst({ instrumentId: "X_PROP", instrumentType: "PROPERTY" }), "2024-01-01"), "PROPERTY");
  // PPF and EPF interest is actually exempt; SLAB_ONLY is the nearest key we
  // have, so it must be flagged rather than presented as settled.
  assert.equal(resolveTaxRegimeDetailed(seed("PPF_SBI"), "2024-01-01").coarse, true);
});

test("hybrids: default to equity-oriented, but classify by equity content when it is known", () => {
  const hybrid = inst({ instrumentId: "MF_BAF", instrumentType: "MF", assetClass: "HYBRID", name: "Balanced Advantage Fund - Direct - Growth" });

  const fallback = resolveTaxRegimeDetailed(hybrid, "2024-05-01");
  assert.equal(fallback.key, "EQUITY_MF", "documented assumption when no composition is supplied");
  assert.equal(fallback.coarse, true, "the assumption must be visible");

  assert.equal(resolveTaxRegime(hybrid, "2024-05-01", 72), "EQUITY_MF");
  assert.equal(resolveTaxRegime(hybrid, "2024-05-01", 20), "DEBT_MF_POST_APR2023");
  assert.equal(resolveTaxRegime(hybrid, "2022-05-01", 20), "DEBT_MF_PRE_APR2023", "a conservative hybrid is lot-dated too");

  // 35-65% is neither equity-oriented nor a specified mutual fund.
  const middle = resolveTaxRegimeDetailed(hybrid, "2024-05-01", 50);
  assert.equal(middle.coarse, true);
  assert.notEqual(middle.key, "EQUITY_MF");
  assert.notEqual(middle.key, "DEBT_MF_POST_APR2023");
});

test("equity content counts domestic equity only, so an international FoF is not equity-oriented", () => {
  const intlFof: Composition = {
    instrumentId: "MF_INTL",
    asOf: "2024-05-01",
    breakdown: [{ sleeve: "EQUITY_INTL", weightPct: 98 }, { sleeve: "CASH", weightPct: 2 }],
  };
  assert.equal(equityContentFromComposition(intlFof), 0);

  const fof = inst({ instrumentId: "MF_INTL", instrumentType: "MF", assetClass: "EQUITY", name: "Global Equity FoF - Direct - Growth" });
  assert.equal(resolveTaxRegime(fof, "2024-05-01"), "EQUITY_MF", "without a composition we only see the asset class");
  assert.equal(
    resolveTaxRegime(fof, "2024-05-01", equityContentFromComposition(intlFof)),
    "DEBT_MF_POST_APR2023",
    "with the composition it is correctly a non-equity fund",
  );

  const domestic: Composition = {
    instrumentId: "MF_DOM",
    asOf: "2024-05-01",
    breakdown: [
      { sleeve: "EQUITY_LARGE", weightPct: 60 },
      { sleeve: "EQUITY_MID", weightPct: 15 },
      { sleeve: "EQUITY_SMALL", weightPct: 5 },
      { sleeve: "DEBT_SOV", weightPct: 20 },
    ],
  };
  assert.equal(equityContentFromComposition(domestic), 80);
});

test("a gold fund is never reclassified by equity content", () => {
  assert.equal(resolveTaxRegime(seed("MF_SBI_GOLD_DIR_G"), "2024-05-01", 0), "GOLD");
});

// ---------------------------------------------------------------------------
// buildInstrumentMaster
// ---------------------------------------------------------------------------

test("the bundled seed builds cleanly and carries its provenance", () => {
  const res = buildInstrumentMaster({ asOf: "2026-07-25", computedAt: "2026-07-25T09:00:00+05:30" });

  assert.equal(res.data.all().length, SEED_INSTRUMENTS.length);
  assert.equal(res.asOf, "2026-07-25");
  assert.equal(res.computedAt, "2026-07-25T09:00:00+05:30", "the clock is injectable, so the result is reproducible");
  assert.ok(res.dataSources.length > 0, "a result with no data source cannot be defended");
  assert.equal(res.assumptions.debtMfRegimeCutover, DEBT_MF_REGIME_CUTOVER);

  const bad = res.warnings.filter((w) => w.severity !== "INFO");
  assert.deepEqual(bad, [], `seed must be clean, got ${JSON.stringify(bad)}`);
  assert.equal(res.confidence, "HIGH");

  // The two debt funds must announce that their stored key is only a default.
  const lotDated = res.warnings.filter((w) => w.code === "TAX_REGIME_IS_LOT_DATED");
  assert.deepEqual(lotDated.map((w) => w.subjectId).sort(), ["MF_ICICI_CORPBOND_DIR_G", "MF_SBI_LIQUID_DIR_G"]);
});

test("two rows sharing an ISIN are BLOCKING, because that is how Direct and Regular merge", () => {
  const res = buildInstrumentMaster({
    asOf: "2026-07-25",
    instruments: [
      { ...seed("MF_PPFC_DIR_G") },
      { ...seed("MF_PPFC_REG_G"), isin: seed("MF_PPFC_DIR_G").isin },
    ],
  });
  const dup = res.warnings.find((w) => w.code === "DUPLICATE_ISIN");
  assert.ok(dup, "a shared ISIN must be reported");
  assert.equal(dup?.severity, "BLOCKING");
  assert.equal(res.confidence, "LOW");
});

test("a stored tax key that disagrees with the derived one is surfaced, not repaired", () => {
  const res = buildInstrumentMaster({
    asOf: "2026-07-25",
    instruments: [{ ...seed("STK_HDFCBANK"), taxRegimeKey: "EQUITY_MF" }],
  });
  const mismatch = res.warnings.find((w) => w.code === "TAX_REGIME_MISMATCH");
  assert.ok(mismatch);
  assert.equal(res.confidence, "MEDIUM");
  assert.equal(res.data.byId("STK_HDFCBANK")?.taxRegimeKey, "EQUITY_MF", "the row is reported, not silently rewritten");
});

test("malformed and missing identifiers are reported", () => {
  const res = buildInstrumentMaster({
    asOf: "2026-07-25",
    instruments: [
      inst({ instrumentId: "MF_NOISIN", instrumentType: "MF", taxRegimeKey: "EQUITY_MF", name: "No ISIN Fund - Direct - Growth" }),
      inst({ instrumentId: "MF_BADISIN", instrumentType: "MF", taxRegimeKey: "EQUITY_MF", isin: "12345", name: "Bad ISIN Fund - Direct - Growth" }),
    ],
  });
  assert.ok(res.warnings.some((w) => w.code === "MISSING_ISIN" && w.subjectId === "MF_NOISIN"));
  assert.ok(res.warnings.some((w) => w.code === "MALFORMED_ISIN" && w.subjectId === "MF_BADISIN"));
});

test("a duplicate instrumentId is BLOCKING and the last row wins", () => {
  const res = buildInstrumentMaster({
    asOf: "2026-07-25",
    instruments: [seed("STK_HDFCBANK"), { ...seed("STK_HDFCBANK"), name: "HDFC Bank Ltd (corrected)" }],
  });
  assert.ok(res.warnings.some((w) => w.code === "DUPLICATE_INSTRUMENT_ID" && w.severity === "BLOCKING"));
  assert.equal(res.data.byId("STK_HDFCBANK")?.name, "HDFC Bank Ltd (corrected)");
});

test("every seed row's stored tax key agrees with what its type derives", () => {
  for (const i of SEED_INSTRUMENTS) {
    // Date-sensitive rows store the current-regime default, so probe them after
    // the cutover; everything else must agree at any date.
    assert.equal(
      resolveTaxRegime(i, "2024-06-01"),
      i.taxRegimeKey,
      `${i.instrumentId} stores ${i.taxRegimeKey}`,
    );
  }
});

test("the seed spans the shapes Phase 1 has to survive", () => {
  const types = new Set(SEED_INSTRUMENTS.map((i) => i.instrumentType));
  for (const t of ["MF", "ETF", "STOCK", "SGB", "GOLD_PHYSICAL", "FD", "PPF", "EPF", "NPS", "ULIP"]) {
    assert.ok(types.has(t as never), `seed is missing a ${t}`);
  }
  assert.ok(SEED_INSTRUMENTS.length >= 12);
});
