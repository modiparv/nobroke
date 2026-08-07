/**
 * Net worth tests (spec §4.1).
 *
 * Two things are being defended: a total that refuses to look more certain than
 * the marks under it, and the contribution vs market-movement split, which is
 * the number users get wrong on their own every single month.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeNetWorth, decomposeChange } from "./networth.ts";
import { roundAmount } from "../domain/money.ts";
import { ok } from "../domain/result.ts";
import type {
  Account, AccountId, Liability, Member, MemberId, PositionValuation, Transaction, ValuationSnapshot,
} from "../domain/types.ts";

const AS_OF = "2024-06-14";

function position(over: Partial<PositionValuation> = {}): PositionValuation {
  return {
    positionId: `pos:${over.instrumentId ?? "INST1"}:${over.accountId ?? "acc-mf"}`,
    instrumentId: "INST1",
    accountId: "acc-mf",
    memberId: "m1",
    units: 100,
    price: 10,
    value: 1000,
    investedCost: 800,
    unrealisedGain: 200,
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

/** Totals are derived from the positions so the fixture can never disagree with itself. */
function snapshot(positions: PositionValuation[], over: Partial<ValuationSnapshot> = {}): ValuationSnapshot {
  const totalAssets = positions.reduce((s, p) => s + p.value, 0);
  const totalInvestedCost = positions.reduce((s, p) => s + p.investedCost, 0);
  return {
    householdId: "hh1",
    asOf: AS_OF,
    currency: "INR",
    positions,
    totalAssets,
    totalInvestedCost,
    totalUnrealisedGain: totalAssets - totalInvestedCost,
    hasStalePrices: positions.some((p) => p.stalePrice),
    hasUnvaluedPositions: positions.some((p) => p.method === "UNVALUED"),
    ...over,
  };
}

const ACCOUNTS: Record<AccountId, Account> = {
  "acc-mf": {
    accountId: "acc-mf", householdId: "hh1", memberId: "m1", kind: "MF_FOLIO",
    provider: "CAMS", accountRef: "F1", holdingMode: "SOA",
  },
  "acc-dm": {
    accountId: "acc-dm", householdId: "hh1", memberId: "m2", kind: "DEMAT",
    provider: "NSDL", accountRef: "IN300***", holdingMode: "DEMAT",
  },
  "acc-ph": {
    accountId: "acc-ph", householdId: "hh1", memberId: "m1", kind: "PHYSICAL",
    provider: "SELF", holdingMode: "PHYSICAL",
  },
};

const MEMBERS: Record<MemberId, Member> = {
  m1: { memberId: "m1", householdId: "hh1", name: "Asha", relation: "SELF", residency: "RESIDENT" },
  m2: { memberId: "m2", householdId: "hh1", name: "Ravi", relation: "SPOUSE", residency: "RESIDENT" },
};

function liability(over: Partial<Liability> & Pick<Liability, "liabilityId" | "memberId" | "outstanding">): Liability {
  return {
    householdId: "hh1",
    kind: "HOME_LOAN",
    lender: "HDFC",
    asOf: AS_OF,
    ...over,
  } as Liability;
}

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

test("net worth is assets minus liabilities, attributed to the member who owns each", () => {
  const valuation = snapshot([
    position({ accountId: "acc-mf", memberId: "m1", instrumentId: "MF1", value: 600_000, investedCost: 500_000 }),
    position({ accountId: "acc-dm", memberId: "m2", instrumentId: "STK1", value: 200_000, investedCost: 150_000, instrumentType: "STOCK", taxRegimeKey: "LISTED_EQUITY" }),
  ]);
  const result = computeNetWorth({
    valuation,
    liabilities: [
      liability({ liabilityId: "L1", memberId: "m1", outstanding: 300_000 }),
      liability({ liabilityId: "L2", memberId: "m2", outstanding: 50_000, kind: "CREDIT_CARD", lender: "Axis" }),
    ],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });

  assert.equal(result.data.totalAssets, 800_000);
  assert.equal(result.data.totalLiabilities, 350_000);
  assert.equal(result.data.netWorth, 450_000);
  assert.equal(result.asOf, AS_OF);
  assert.equal(result.data.currency, "INR");

  const asha = result.data.byMember.find((m) => m.memberId === "m1")!;
  assert.equal(asha.memberName, "Asha");
  assert.equal(asha.assets, 600_000);
  assert.equal(asha.liabilities, 300_000);
  assert.equal(asha.net, 300_000);

  const ravi = result.data.byMember.find((m) => m.memberId === "m2")!;
  assert.equal(ravi.assets, 200_000);
  assert.equal(ravi.liabilities, 50_000);
  assert.equal(ravi.net, 150_000);

  // The member slices must reconcile to the household total, or the attribution
  // is quietly losing money.
  assert.equal(result.data.byMember.reduce((s, m) => s + m.net, 0), result.data.netWorth);
});

test("a member with only a liability still appears, with negative net", () => {
  const valuation = snapshot([position({ memberId: "m1", value: 100_000 })]);
  const result = computeNetWorth({
    valuation,
    liabilities: [liability({ liabilityId: "L1", memberId: "m2", outstanding: 40_000, kind: "EDUCATION_LOAN", lender: "SBI" })],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });
  const ravi = result.data.byMember.find((m) => m.memberId === "m2")!;
  assert.equal(ravi.assets, 0);
  assert.equal(ravi.net, -40_000);
  assert.equal(result.data.netWorth, 60_000);
});

test("asset class and instrument type shares sum to 100% of total assets", () => {
  const valuation = snapshot([
    position({ instrumentId: "MF1", value: 600_000, assetClass: "EQUITY", instrumentType: "MF" }),
    position({ instrumentId: "DEBT1", value: 300_000, assetClass: "DEBT", instrumentType: "MF" }),
    position({ instrumentId: "GOLD1", value: 100_000, assetClass: "COMMODITY", instrumentType: "SGB" }),
  ]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS, members: MEMBERS });

  const classShare = result.data.byAssetClass.reduce((s, x) => s + x.sharePct, 0);
  assert.ok(Math.abs(classShare - 100) < 0.01, `asset class shares summed to ${classShare}`);
  const typeShare = result.data.byInstrumentType.reduce((s, x) => s + x.sharePct, 0);
  assert.ok(Math.abs(typeShare - 100) < 0.01, `instrument type shares summed to ${typeShare}`);

  // Slices are ordered largest first and MF is aggregated across asset classes.
  assert.equal(result.data.byAssetClass[0].assetClass, "EQUITY");
  assert.equal(result.data.byAssetClass[0].sharePct, 60);
  assert.equal(result.data.byInstrumentType[0].instrumentType, "MF");
  assert.equal(result.data.byInstrumentType[0].value, 900_000);
});

test("an empty portfolio produces zeroes, never NaN", () => {
  const valuation = snapshot([]);
  const result = computeNetWorth({
    valuation,
    liabilities: [liability({ liabilityId: "L1", memberId: "m1", outstanding: 250_000 })],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });

  assert.equal(result.data.totalAssets, 0);
  assert.equal(result.data.netWorth, -250_000);
  assert.deepEqual(result.data.byAssetClass, []);
  assert.deepEqual(result.data.byInstrumentType, []);
  assert.equal(result.data.liquidVsIlliquid.liquid, 0);
  assert.equal(result.data.liquidVsIlliquid.illiquid, 0);

  const numbers = [
    result.data.totalAssets, result.data.totalLiabilities, result.data.netWorth,
    result.data.liquidVsIlliquid.liquid, result.data.liquidVsIlliquid.illiquid,
    ...result.data.byMember.flatMap((m) => [m.assets, m.liabilities, m.net]),
  ];
  for (const n of numbers) assert.ok(Number.isFinite(n), `expected a finite number, got ${n}`);
});

test("a zero-valued portfolio gives 0% shares rather than dividing by zero", () => {
  const valuation = snapshot([position({ value: 0, investedCost: 0 })]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS });
  assert.equal(result.data.byAssetClass[0].sharePct, 0);
  assert.ok(Number.isFinite(result.data.byAssetClass[0].sharePct));
});

test("a LOW confidence valuation can never yield a HIGH confidence net worth", () => {
  const valuation = snapshot([position({ value: 500_000 })]);
  const lowConfidence = ok(valuation, {
    asOf: AS_OF,
    confidence: "LOW",
    warnings: [{ code: "VALUATION_SUSPENDED_NAV", severity: "BLOCKING", message: "NAV unpublished for INST1" }],
    dataSources: [{ kind: "AMFI_NAV", label: "AMFI NAV file", asOf: AS_OF }],
  });

  const result = computeNetWorth({ valuation: lowConfidence, liabilities: [], accounts: ACCOUNTS });

  assert.equal(result.confidence, "LOW");
  // The valuation's own account of the problem is carried through verbatim.
  assert.ok(result.warnings.some((w) => w.code === "VALUATION_SUSPENDED_NAV" && w.severity === "BLOCKING"));
  // Provenance is inherited too, with our own derivation appended.
  assert.ok(result.dataSources.some((d) => d.kind === "AMFI_NAV"));
  assert.ok(result.dataSources.some((d) => d.kind === "DERIVED"));
});

test("a clean snapshot with same-day liabilities is HIGH confidence", () => {
  const valuation = snapshot([position({ value: 500_000 })]);
  const result = computeNetWorth({
    valuation,
    liabilities: [liability({ liabilityId: "L1", memberId: "m1", outstanding: 100_000 })],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });
  assert.equal(result.confidence, "HIGH");
  assert.deepEqual(result.warnings, []);
});

test("stale prices degrade confidence and say so", () => {
  const valuation = snapshot([position({ value: 500_000, stalePrice: true, priceAsOf: "2024-06-03" })]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS });
  assert.notEqual(result.confidence, "HIGH");
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_STALE_PRICES"));
});

test("an unvalued holding blocks the number rather than shrinking it silently", () => {
  const valuation = snapshot([
    position({ instrumentId: "MF1", value: 500_000 }),
    position({ instrumentId: "SP1", value: 0, investedCost: 40_000, method: "UNVALUED" }),
  ]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS });

  assert.equal(result.confidence, "LOW");
  const w = result.warnings.find((x) => x.code === "NETWORTH_UNVALUED_POSITIONS")!;
  assert.equal(w.severity, "BLOCKING");
});

test("a snapshot total that disagrees with its own positions is reported, not inherited", () => {
  const valuation = snapshot([position({ value: 500_000 })], { totalAssets: 900_000 });
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS });
  assert.equal(result.data.totalAssets, 500_000, "the positions win");
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_TOTAL_MISMATCH"));
  assert.notEqual(result.confidence, "HIGH");
});

test("liquid and illiquid split by what can actually be reached, and add back to total assets", () => {
  const valuation = snapshot([
    position({ instrumentId: "MF1", value: 600_000 }),
    position({ instrumentId: "PPF1", value: 400_000, instrumentType: "PPF", assetClass: "DEBT", taxRegimeKey: "SLAB_ONLY" }),
    position({
      instrumentId: "FLAT", accountId: "acc-ph", value: 5_000_000, instrumentType: "PROPERTY",
      assetClass: "REAL_ASSET", taxRegimeKey: "PROPERTY", method: "USER_DECLARED",
      priceSource: "USER_DECLARED", illiquid: true,
    }),
    position({ instrumentId: "FD1", value: 100_000, instrumentType: "FD", assetClass: "DEBT", taxRegimeKey: "SLAB_ONLY", method: "ACCRUED_INTEREST", priceSource: "COMPUTED_ACCRUAL" }),
  ]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS, members: MEMBERS });

  // PPF is locked by statute and property has no market, so 54L of the 61L is
  // money the household cannot spend this year. An FD can be broken today.
  assert.equal(result.data.liquidVsIlliquid.illiquid, 5_400_000);
  assert.equal(result.data.liquidVsIlliquid.liquid, 700_000);
  assert.equal(
    result.data.liquidVsIlliquid.liquid + result.data.liquidVsIlliquid.illiquid,
    result.data.totalAssets,
  );
  // A declared property value is an estimate, so the total cannot be HIGH confidence.
  assert.notEqual(result.confidence, "HIGH");
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_DECLARED_VALUES"));
});

test("§6.16 a joint holding is attributed whole to the primary holder and flagged", () => {
  const accounts: Record<AccountId, Account> = {
    ...ACCOUNTS,
    "acc-jt": {
      accountId: "acc-jt", householdId: "hh1", memberId: "m1", jointMemberIds: ["m2"],
      kind: "DEMAT", provider: "CDSL", holdingMode: "DEMAT",
    },
  };
  const valuation = snapshot([position({ accountId: "acc-jt", memberId: "m1", instrumentId: "STK1", value: 300_000 })]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts, members: MEMBERS });

  assert.equal(result.data.byMember.find((m) => m.memberId === "m1")!.assets, 300_000);
  assert.equal(result.data.byMember.find((m) => m.memberId === "m2"), undefined);
  const w = result.warnings.find((x) => x.code === "NETWORTH_JOINT_HOLDING")!;
  assert.equal(w.severity, "INFO");
});

test("the account master wins when the valuation row disagrees about who owns a holding", () => {
  const valuation = snapshot([position({ accountId: "acc-dm", memberId: "m1", value: 250_000 })]);
  const result = computeNetWorth({ valuation, liabilities: [], accounts: ACCOUNTS, members: MEMBERS });

  assert.equal(result.data.byMember[0].memberId, "m2", "acc-dm is held by m2");
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_MEMBER_MISMATCH"));
});

test("another household's liability is excluded and named", () => {
  const valuation = snapshot([position({ value: 500_000 })]);
  const result = computeNetWorth({
    valuation,
    liabilities: [
      liability({ liabilityId: "L1", memberId: "m1", outstanding: 100_000 }),
      liability({ liabilityId: "L9", memberId: "x9", outstanding: 9_000_000, householdId: "hh-other" }),
    ],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });

  assert.equal(result.data.totalLiabilities, 100_000);
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_FOREIGN_LIABILITY"));
});

test("a loan balance older than a quarter is flagged as overstating the debt", () => {
  const valuation = snapshot([position({ value: 500_000 })]);
  const result = computeNetWorth({
    valuation,
    liabilities: [liability({ liabilityId: "L1", memberId: "m1", outstanding: 3_000_000, asOf: "2023-12-31" })],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_LIABILITY_STALE"));
  assert.notEqual(result.confidence, "HIGH");
});

test("a liability dated after the valuation, or with no date at all, is flagged and still counted", () => {
  const valuation = snapshot([position({ value: 500_000 })]);
  const result = computeNetWorth({
    valuation,
    liabilities: [
      liability({ liabilityId: "L1", memberId: "m1", outstanding: 100_000, asOf: "2024-07-31" }),
      liability({ liabilityId: "L2", memberId: "m1", outstanding: 50_000, asOf: undefined as unknown as string }),
    ],
    accounts: ACCOUNTS,
    members: MEMBERS,
  });

  assert.equal(result.data.totalLiabilities, 150_000, "a suspect date is not a reason to drop the debt");
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_LIABILITY_AFTER_ASOF"));
  assert.ok(result.warnings.some((w) => w.code === "NETWORTH_LIABILITY_UNDATED"));
});

test("instrument liquidityTier overrides the instrument-type default when supplied", () => {
  const valuation = snapshot([position({ instrumentId: "ELSS1", value: 200_000 })]);
  const result = computeNetWorth({
    valuation,
    liabilities: [],
    accounts: ACCOUNTS,
    instruments: {
      ELSS1: {
        instrumentId: "ELSS1", name: "ELSS", assetClass: "EQUITY", instrumentType: "MF",
        taxRegimeKey: "EQUITY_MF", liquidityTier: "LOCKED", riskBand: 5, currency: "INR",
        listingStatus: "LISTED", plan: "DIRECT", option: "GROWTH", lockInMonths: 36,
      },
    },
  });
  assert.equal(result.data.liquidVsIlliquid.illiquid, 200_000, "an ELSS inside its lock-in is not spendable money");
  assert.equal(result.data.liquidVsIlliquid.liquid, 0);
});

// ---------------------------------------------------------------------------
// Change decomposition (spec §4.1)
// ---------------------------------------------------------------------------

function snapAt(asOf: string, value: number): ValuationSnapshot {
  return snapshot([position({ value, investedCost: value })], { asOf });
}

function tx(over: Partial<Transaction> & Pick<Transaction, "transactionId" | "type" | "tradeDate">): Transaction {
  return { accountId: "acc-mf", instrumentId: "INST1", folioNumber: "F1", ...over } as Transaction;
}

test("a month with a 50k SIP and a 20k market gain splits exactly 50k / 20k", () => {
  const prev = snapAt("2024-05-31", 1_000_000);
  const curr = snapAt("2024-06-30", 1_070_000);
  const result = decomposeChange(prev, curr, [
    tx({ transactionId: "sip1", type: "BUY", tradeDate: "2024-06-05", amount: 50_000, units: 500, pricePerUnit: 100 }),
  ]);

  assert.equal(result.data.openingValue, 1_000_000);
  assert.equal(result.data.closingValue, 1_070_000);
  assert.equal(result.data.netContribution, 50_000);
  assert.equal(result.data.marketMovement, 20_000);
  assert.equal(result.data.totalChange, 70_000);
  assert.equal(result.data.fromAsOf, "2024-05-31");
  assert.equal(result.data.toAsOf, "2024-06-30");
  assert.equal(result.confidence, "HIGH");
});

test("a falling market with a SIP still reports the loss instead of hiding it", () => {
  // The portfolio grew 30k while the market took 20k off it. This is the exact
  // conflation the split exists to break.
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_030_000), [
    tx({ transactionId: "sip1", type: "BUY", tradeDate: "2024-06-05", amount: 50_000 }),
  ]);
  assert.equal(result.data.totalChange, 30_000);
  assert.equal(result.data.netContribution, 50_000);
  assert.equal(result.data.marketMovement, -20_000);
});

test("§6.8 a pure switch is not new money and nets to zero contribution", () => {
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_000_000), [
    tx({ transactionId: "so1", type: "SWITCH_OUT", tradeDate: "2024-06-10", amount: 100_000, instrumentId: "FROM", linkId: "SW1" }),
    tx({ transactionId: "si1", type: "SWITCH_IN", tradeDate: "2024-06-10", amount: 100_000, instrumentId: "TO", linkId: "SW1" }),
  ]);

  assert.equal(result.data.netContribution, 0, "a switch moves money sideways, it does not add any");
  assert.equal(result.data.marketMovement, 0);
  // Gross flows are still reported: netting to zero must not read as "no activity".
  assert.equal(result.data.inflows, 100_000);
  assert.equal(result.data.outflows, 100_000);
  assert.equal(result.data.transactionsCounted, 2);
});

test("the identity openingValue + netContribution + marketMovement === closingValue holds", () => {
  // Exact on whole rupees.
  const clean = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_070_000), [
    tx({ transactionId: "a", type: "BUY", tradeDate: "2024-06-05", amount: 50_000 }),
  ]).data;
  assert.equal(clean.openingValue + clean.netContribution + clean.marketMovement, clean.closingValue);
  assert.equal(clean.netContribution + clean.marketMovement, clean.totalChange);

  // And on paise, where re-adding three float64 rupee figures can land a few
  // ten-billionths off. `marketMovement` is the residual of the ROUNDED opening,
  // closing and contribution, so the identity is exact at the 2dp precision the
  // view publishes (§6.20); the sub-nanopaisa drift is IEEE-754, not a gap in
  // the model, so the assertion is made at paisa precision.
  const messy: Array<[number, number, Transaction[]]> = [
    [0, 250_000, [tx({ transactionId: "b", type: "BUY", tradeDate: "2024-06-05", amount: 300_000 })]],
    [
      812_345.67, 733_221.09,
      [
        tx({ transactionId: "c", type: "BUY", tradeDate: "2024-06-05", amount: 12_345.67 }),
        tx({ transactionId: "d", type: "SELL", tradeDate: "2024-06-20", amount: 99_999.99 }),
        tx({ transactionId: "e", type: "IDCW_PAYOUT", tradeDate: "2024-06-25", amount: 1_234.56 }),
      ],
    ],
    [7_654_321.01, 6_543_210.99, [tx({ transactionId: "f", type: "SELL", tradeDate: "2024-06-11", amount: 1_111_110.02 })]],
  ];
  for (const [opening, closing, txns] of messy) {
    const d = decomposeChange(snapAt("2024-05-31", opening), snapAt("2024-06-30", closing), txns).data;
    assert.equal(
      roundAmount(d.openingValue + d.netContribution + d.marketMovement),
      d.closingValue,
      `identity broke for ${opening} -> ${closing}`,
    );
    assert.ok(Math.abs(d.openingValue + d.netContribution + d.marketMovement - d.closingValue) < 1e-6);
    assert.equal(roundAmount(d.netContribution + d.marketMovement), d.totalChange);
  }
});

test("the window is opening-exclusive and closing-inclusive", () => {
  // A trade ON the opening date is already inside the opening value; one on the
  // closing date is inside the closing value.
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_100_000), [
    tx({ transactionId: "before", type: "BUY", tradeDate: "2024-05-31", amount: 40_000 }),
    tx({ transactionId: "inside", type: "BUY", tradeDate: "2024-06-01", amount: 50_000 }),
    tx({ transactionId: "onClose", type: "BUY", tradeDate: "2024-06-30", amount: 10_000 }),
    tx({ transactionId: "after", type: "BUY", tradeDate: "2024-07-01", amount: 70_000 }),
  ]);
  assert.equal(result.data.netContribution, 60_000);
  assert.equal(result.data.transactionsCounted, 2);
});

test("an IDCW payout is a withdrawal but an IDCW reinvestment is not a contribution", () => {
  // On reinvestment the NAV drops by exactly what the new units add, so calling
  // it new money would invent a contribution the household never made.
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 990_000), [
    tx({ transactionId: "d1", type: "IDCW_PAYOUT", tradeDate: "2024-06-12", amount: 10_000 }),
    tx({ transactionId: "d2", type: "IDCW_REINVEST", tradeDate: "2024-06-12", amount: 5_000, units: 50, pricePerUnit: 100 }),
  ]);
  assert.equal(result.data.netContribution, -10_000);
  assert.equal(result.data.marketMovement, 0);
});

test("bonus, split and merger move units without moving money", () => {
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_000_000), [
    tx({ transactionId: "bo", type: "BONUS", tradeDate: "2024-06-05", units: 100 }),
    tx({ transactionId: "sp", type: "SPLIT", tradeDate: "2024-06-06", ratio: 10 }),
    tx({ transactionId: "mo", type: "MERGER_OUT", tradeDate: "2024-06-07", units: 100, pricePerUnit: 50, relatedInstrumentId: "NEW", linkId: "MG1" }),
    tx({ transactionId: "mi", type: "MERGER_IN", tradeDate: "2024-06-07", units: 50, pricePerUnit: 100, linkId: "MG1" }),
    tx({ transactionId: "ic", type: "INTEREST_CREDIT", tradeDate: "2024-06-30", amount: 7_500 }),
  ]);
  assert.equal(result.data.netContribution, 0);
  assert.equal(result.data.transactionsCounted, 0);
  assert.deepEqual(result.warnings, [], "none of these should raise a warning");
});

test("a money-moving transaction we cannot classify is named, not silently called a market gain", () => {
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_020_000), [
    tx({ transactionId: "r1", type: "RIGHTS", tradeDate: "2024-06-10", amount: 20_000, units: 100, pricePerUnit: 200 }),
  ]);
  assert.equal(result.data.netContribution, 0);
  assert.equal(result.data.marketMovement, 20_000, "the residual absorbs it, which is why it must be disclosed");
  assert.ok(result.warnings.some((w) => w.code === "CHANGE_UNCLASSIFIED_TXN"));
  assert.notEqual(result.confidence, "HIGH");
});

test("a contribution with no amount and no price is blocking, not zero", () => {
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_050_000), [
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2024-06-10", units: 500 }),
  ]);
  assert.equal(result.confidence, "LOW");
  const w = result.warnings.find((x) => x.code === "CHANGE_TXN_AMOUNT_MISSING")!;
  assert.equal(w.severity, "BLOCKING");
});

test("units and price stand in for a missing amount", () => {
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 1_060_000), [
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2024-06-10", units: 500, pricePerUnit: 100 }),
  ]);
  assert.equal(result.data.netContribution, 50_000);
  assert.equal(result.data.marketMovement, 10_000);
});

test("a redemption printed as a negative amount is still an outflow", () => {
  // Statements are inconsistent about sign; direction comes from the type.
  const result = decomposeChange(snapAt("2024-05-31", 1_000_000), snapAt("2024-06-30", 900_000), [
    tx({ transactionId: "s1", type: "SELL", tradeDate: "2024-06-10", amount: -100_000 }),
  ]);
  assert.equal(result.data.netContribution, -100_000);
  assert.equal(result.data.marketMovement, 0);
});

test("no opening snapshot is treated as inception to date and said out loud", () => {
  const result = decomposeChange(undefined, snapAt("2024-06-30", 260_000), [
    tx({ transactionId: "b1", type: "BUY", tradeDate: "2024-01-10", amount: 100_000 }),
    tx({ transactionId: "b2", type: "BUY", tradeDate: "2024-03-10", amount: 150_000 }),
  ]);

  assert.equal(result.data.openingValue, 0);
  assert.equal(result.data.netContribution, 250_000);
  assert.equal(result.data.marketMovement, 10_000);
  assert.equal(result.data.fromAsOf, "2024-01-10");
  assert.ok(result.warnings.some((w) => w.code === "CHANGE_NO_OPENING_SNAPSHOT"));
  assert.notEqual(result.confidence, "HIGH");
});

test("an inverted or empty window is blocking", () => {
  const result = decomposeChange(snapAt("2024-06-30", 1_000_000), snapAt("2024-05-31", 900_000), []);
  assert.equal(result.confidence, "LOW");
  assert.ok(result.warnings.some((w) => w.code === "CHANGE_WINDOW_INVALID" && w.severity === "BLOCKING"));
});

test("comparing two different households is refused loudly", () => {
  const prev = snapshot([position({ value: 1_000_000 })], { asOf: "2024-05-31", householdId: "hh-other" });
  const curr = snapAt("2024-06-30", 1_100_000);
  const result = decomposeChange(prev, curr, []);
  assert.ok(result.warnings.some((w) => w.code === "CHANGE_HOUSEHOLD_MISMATCH" && w.severity === "BLOCKING"));
  assert.equal(result.confidence, "LOW");
});

test("transactions from another household are excluded when accounts are supplied", () => {
  const accounts: Record<AccountId, Account> = {
    ...ACCOUNTS,
    "acc-out": { accountId: "acc-out", householdId: "hh-other", memberId: "z1", kind: "BANK", provider: "ICICI", holdingMode: "SOA" },
  };
  const result = decomposeChange(
    snapAt("2024-05-31", 1_000_000),
    snapAt("2024-06-30", 1_050_000),
    [
      tx({ transactionId: "mine", type: "BUY", tradeDate: "2024-06-05", amount: 50_000 }),
      tx({ transactionId: "theirs", type: "BUY", tradeDate: "2024-06-05", amount: 900_000, accountId: "acc-out" }),
    ],
    { accounts },
  );
  assert.equal(result.data.netContribution, 50_000);
  assert.equal(result.data.marketMovement, 0);
});

test("decomposition inherits the weaker confidence of the two snapshots", () => {
  const prev = snapAt("2024-05-31", 1_000_000);
  const curr = snapshot([position({ value: 1_050_000, method: "UNVALUED" })], { asOf: "2024-06-30" });
  const result = decomposeChange(prev, curr, []);
  assert.equal(result.confidence, "LOW");
  assert.ok(result.warnings.some((w) => w.code === "CHANGE_UNVALUED_POSITIONS"));
});
