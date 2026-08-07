/**
 * Valuation engine (spec §3.1). "What is it worth today, and how do we know?"
 *
 * An Indian household balance sheet is not one asset class priced one way. A
 * single family holds AMFI-priced mutual funds, exchange-priced stocks, an FD
 * that has no price at all and must be accrued from its contract, a PPF balance
 * that only exists on a passbook, an SGB whose fair value is the HIGHER of its
 * (usually illiquid, discounted) exchange quote and the gold reference price, a
 * flat whose "value" is whatever a broker said two years ago, and ESOPs in a
 * company that has not raised since 2021. Valuing all of that with `units x
 * price` produces a number that is confidently wrong.
 *
 * So every position is valued by a method chosen from its instrument type, and
 * the method travels with the number (PositionValuation.method) together with
 * the date and source of the mark. The copilot may quote this; it may not
 * derive it (spec §0).
 *
 * Non-negotiables enforced here:
 *   - units come from OPEN LOTS ONLY, never from a stored position total, so a
 *     partial redemption cannot leave phantom units on the balance sheet;
 *   - an unpriceable position is UNVALUED and warned about, never valued at
 *     zero and never valued at a guessed price (§6.19);
 *   - confidence degrades to the weakest position in the household.
 *
 * PHASE 1: this file computes VALUE. It computes no return, no tax and no
 * allocation. Lot-dated inputs those engines will need are preserved upstream
 * in the ledger, not consumed here.
 */

import type {
  Account, AccountId, CompoundingFrequency, DateISO, HouseholdId, Instrument, InstrumentId,
  InstrumentType, Lot, Position, PositionId, PositionValuation, PriceSource, ValuationMethod,
  ValuationSnapshot,
} from "../domain/types.ts";
import { daysBetween, yearFractionAct365 } from "../domain/dates.ts";
import { roundAmount, roundTo, roundUnits, UNITS_TOLERANCE, valueMatch } from "../domain/money.ts";
import {
  blocking, ok, warn, weakest,
  type Confidence, type DataSourceKind, type DataSourceRef, type EngineResult, type EngineWarning,
} from "../domain/result.ts";
import { openCost, openUnits } from "./ledger.ts";
import { isStale, STALE_AFTER_TRADING_DAYS, type PriceBook, type ResolvedPrice } from "./prices.ts";

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** A declared property/gold valuation older than a year is a memory, not a mark. */
export const DECLARED_VALUE_STALE_DAYS = 365;
/**
 * Statement-valued holdings (PPF/EPF/ULIP/PMS) are published monthly at best and
 * annually at worst, so the two-trading-day price rule would flag every one of
 * them. A balance more than a quarter old is treated as stale instead.
 */
export const STATEMENT_STALE_DAYS = 90;
/** SGBs pay 2.5% a year on the ISSUE price. It is income, never capital value. */
export const SGB_COUPON_PCT = 2.5;
/** NAVs are published to 4dp; derived per-unit marks are reported the same way. */
const PRICE_DP = 4;

const PERIODS_PER_YEAR: Record<CompoundingFrequency, number> = {
  SIMPLE: 0, ANNUAL: 1, HALF_YEARLY: 2, QUARTERLY: 4, MONTHLY: 12,
};

// ---------------------------------------------------------------------------
// Public input / output
// ---------------------------------------------------------------------------

/** A value the user asserted (property, jewellery, an unlisted round). */
export interface DeclaredValue {
  value: number;
  lastValuedOn: DateISO;
}

/** A balance only the provider knows (PPF passbook, EPF statement, ULIP fund value). */
export interface ProviderBalance {
  value: number;
  asOf: DateISO;
}

export interface ValuationInput {
  householdId: HouseholdId;
  asOf: DateISO;
  currency?: string;
  positions: Position[];
  /** The full lot ledger. Only OPEN lots of each position are valued. */
  lots: Lot[];
  instruments: Record<InstrumentId, Instrument>;
  accounts: Record<AccountId, Account>;
  priceBook: PriceBook;
  declaredValues?: Record<PositionId, DeclaredValue>;
  providerBalances?: Record<PositionId, ProviderBalance>;
  /**
   * Optional instrument carrying the gold reference price (per gram) when the
   * SGB's own feed does not include a GOLD_REFERENCE point.
   */
  goldReferenceInstrumentId?: InstrumentId;
}

/**
 * Value every position in a household as of a date.
 *
 * Pure: the only clock is `asOf`, and every price comes from the supplied book.
 * Call it twice with the same inputs and you get the same balance sheet, which
 * is what makes a snapshot auditable (spec §10).
 */
export function valuePortfolio(input: ValuationInput): EngineResult<ValuationSnapshot> {
  const currency = input.currency ?? "INR";
  const warnings: EngineWarning[] = [];
  const assumptions: Record<string, string | number | boolean> = {
    accrualDayCount: "ACT/365",
    priceCarryForward: "last published price at or before asOf; never interpolated (§6.18)",
    stalePriceThresholdTradingDays: STALE_AFTER_TRADING_DAYS,
    unitsSource: "open lots only",
  };
  const sourcesUsed = new Map<string, DataSourceRef>();
  const valuations: PositionValuation[] = [];

  let anyUnvalued = false;
  let anyStale = false;
  let anySoft = false; // illiquid or user-declared: a mark, not a price

  for (const position of input.positions) {
    const instrument = input.instruments[position.instrumentId];
    if (!instrument) {
      // We cannot classify it, so we cannot honestly put it on the balance
      // sheet. Totals are incomplete until this is fixed: BLOCKING, not a note.
      warnings.push(blocking(
        "MISSING_INSTRUMENT",
        `Position ${position.positionId} references unknown instrument ${position.instrumentId}; it is excluded from totals.`,
        position.positionId,
      ));
      anyUnvalued = true;
      continue;
    }

    const account = input.accounts[position.accountId];
    if (!account) {
      warnings.push(warn(
        "MISSING_ACCOUNT",
        `Position ${position.positionId} references unknown account ${position.accountId}; ownership cannot be attributed to a member.`,
        position.positionId,
      ));
    }

    const units = openUnits(input.lots, position.positionId);
    const cost = openCost(input.lots, position.positionId);
    const mark = markPosition({ input, position, instrument, units, cost, currency });

    for (const w of mark.warnings) warnings.push(w);
    for (const [k, v] of Object.entries(mark.assumptions ?? {})) assumptions[k] = v;

    const value = roundAmount(mark.value);
    const investedCost = roundAmount(cost);
    const stalePrice = mark.stale ?? isStale(mark.priceAsOf, input.asOf);
    const illiquid = mark.illiquid ?? false;

    if (mark.method === "UNVALUED") {
      if (mark.counted !== false) anyUnvalued = true;
    } else {
      if (stalePrice) anyStale = true;
      if (illiquid || mark.priceSource === "USER_DECLARED") anySoft = true;
      recordSource(sourcesUsed, mark.priceSource, mark.priceAsOf);
    }

    valuations.push({
      positionId: position.positionId,
      instrumentId: position.instrumentId,
      accountId: position.accountId,
      memberId: account?.memberId ?? "",
      units: roundUnits(units),
      price: roundTo(mark.price ?? 0, PRICE_DP),
      value,
      investedCost,
      // Computed from the rounded pair so the figures a user sees add up
      // exactly, rather than being off by a paisa against their own arithmetic.
      unrealisedGain: roundAmount(value - investedCost),
      method: mark.method,
      priceAsOf: mark.priceAsOf,
      priceSource: mark.priceSource,
      stalePrice,
      illiquid,
      // Carried onto every line so downstream engines never have to re-join the
      // instrument master, and so the Phase 3 tax engine inherits the key that
      // was in force at valuation time.
      assetClass: instrument.assetClass,
      instrumentType: instrument.instrumentType,
      taxRegimeKey: instrument.taxRegimeKey,
      notes: mark.notes.length > 0 ? mark.notes : undefined,
    });
  }

  // Totals are summed from the rounded position figures so the snapshot ties
  // out line by line (spec §6.20: round at the boundary, and only once).
  let totalAssets = 0;
  let totalInvestedCost = 0;
  for (const v of valuations) {
    totalAssets += v.value;
    totalInvestedCost += v.investedCost;
  }
  totalAssets = roundAmount(totalAssets);
  totalInvestedCost = roundAmount(totalInvestedCost);

  const snapshot: ValuationSnapshot = {
    householdId: input.householdId,
    asOf: input.asOf,
    currency,
    positions: valuations,
    totalAssets,
    totalInvestedCost,
    totalUnrealisedGain: roundAmount(totalAssets - totalInvestedCost),
    hasStalePrices: anyStale,
    hasUnvaluedPositions: anyUnvalued,
  };

  const confidence: Confidence = weakest(
    anyUnvalued ? "LOW" : "HIGH",
    warnings.some((w) => w.severity === "BLOCKING") ? "LOW" : "HIGH",
    anyStale || anySoft ? "MEDIUM" : "HIGH",
  );

  return ok(snapshot, {
    asOf: input.asOf,
    confidence,
    warnings,
    assumptions,
    dataSources: [...sourcesUsed.values()],
  });
}

// ---------------------------------------------------------------------------
// Accrual maths (FD / RD / PPF / EPF / bonds)
// ---------------------------------------------------------------------------

/**
 * Value of `principal` grown at a contracted annual rate over ACT/365 elapsed
 * time. `SIMPLE` is not compounding at all (a payout FD hands the interest over
 * as it is earned), and the compounding frequencies are the ones Indian banks
 * actually quote. Rates are decimals: 0.071 is 7.1%.
 */
export function accruedValue(
  principal: number,
  annualRate: number,
  compounding: CompoundingFrequency,
  from: DateISO,
  to: DateISO,
): number {
  const years = yearFractionAct365(from, to);
  if (years <= 0) return principal; // never accrue backwards
  if (compounding === "SIMPLE") return principal * (1 + annualRate * years);
  const n = PERIODS_PER_YEAR[compounding] || 1;
  return principal * (1 + annualRate / n) ** (n * years);
}

/**
 * Interest stops on the maturity date. A matured FD sitting uncollected earns
 * the bank's savings rate at best, so accruing at the contracted rate past
 * maturity silently overstates the balance sheet forever.
 */
function accrualEnd(maturityDate: DateISO | undefined, asOf: DateISO): DateISO {
  return maturityDate && maturityDate < asOf ? maturityDate : asOf;
}

// ---------------------------------------------------------------------------
// Per-position marking
// ---------------------------------------------------------------------------

interface Mark {
  method: ValuationMethod;
  /** Total rupee value of the position. */
  value: number;
  /** Per-unit mark. Informational for balance-valued methods. */
  price?: number;
  priceAsOf: DateISO;
  priceSource: PriceSource;
  illiquid?: boolean;
  /** Overrides the default trading-day staleness rule where it does not apply. */
  stale?: boolean;
  /** False when UNVALUED is benign (an emptied position), so it is not counted. */
  counted?: boolean;
  notes: string[];
  warnings: EngineWarning[];
  assumptions?: Record<string, string | number | boolean>;
}

interface MarkContext {
  input: ValuationInput;
  position: Position;
  instrument: Instrument;
  units: number;
  cost: number;
  currency: string;
}

/**
 * Which feed is RESPONSIBLE for an instrument's price. Stamped on UNVALUED
 * positions too, so the UI can say where the missing number should have come
 * from. PriceSource has no "none" member, and inventing one would be a lie in
 * the other direction; `method === "UNVALUED"` with `price === 0` is what tells
 * a consumer there is no mark here.
 */
function expectedSource(type: InstrumentType): PriceSource {
  switch (type) {
    case "MF": case "NPS": return "AMFI";
    case "STOCK": case "ETF": case "BOND": case "SGB": case "CRYPTO": return "EXCHANGE";
    case "FD": case "RD": case "PPF": case "EPF": case "P2P": case "LOAN_GIVEN": case "CHIT": return "COMPUTED_ACCRUAL";
    case "ULIP": case "AIF": case "PMS": return "STATEMENT";
    default: return "USER_DECLARED";
  }
}

function unvalued(ctx: MarkContext, code: string, message: string): Mark {
  return {
    method: "UNVALUED",
    value: 0,
    price: 0,
    priceAsOf: ctx.input.asOf,
    priceSource: expectedSource(ctx.instrument.instrumentType),
    notes: [message],
    // Never blocking: one unpriceable position must not suppress the rest of
    // the balance sheet. It is named, counted, and drags confidence to LOW.
    warnings: [warn(code, message, ctx.position.positionId)],
  };
}

function markPosition(ctx: MarkContext): Mark {
  const { instrument, input, position, units, cost } = ctx;
  const type = instrument.instrumentType;
  const declared = input.declaredValues?.[position.positionId];
  const statement = input.providerBalances?.[position.positionId];

  // An emptied position (fully redeemed, matured, merged away) is worth nothing
  // and there is nothing to warn about. Balance-valued holdings are exempt:
  // a flat or a PPF account can be worth crores with no lots behind it.
  if (units <= UNITS_TOLERANCE && cost === 0 && !declared && !statement) {
    return {
      method: "UNVALUED",
      value: 0,
      price: 0,
      priceAsOf: input.asOf,
      priceSource: expectedSource(type),
      counted: false,
      notes: ["Position has no open units."],
      warnings: [],
    };
  }

  const mark = markByType(ctx, declared, statement);

  // Phase 1 is rupee-only. An unconverted foreign holding inside an INR total is
  // a wrong number, not a stale one, so it blocks rather than warns.
  if (instrument.currency && instrument.currency !== ctx.currency && mark.method !== "UNVALUED") {
    mark.warnings.push(blocking(
      "CURRENCY_MISMATCH",
      `${instrument.name} is denominated in ${instrument.currency} but the snapshot is in ${ctx.currency}. No FX conversion is applied in Phase 1.`,
      position.positionId,
    ));
    mark.notes.push(`Value is in ${instrument.currency}, not converted.`);
  }
  return mark;
}

function markByType(ctx: MarkContext, declared?: DeclaredValue, statement?: ProviderBalance): Mark {
  const type = ctx.instrument.instrumentType;
  switch (type) {
    case "MF":
    case "ETF":
    case "NPS":
      // NPS is units x NAV per scheme AND per tier; Tier I and Tier II are
      // separate instruments upstream, so they never share a position here.
      return markPerUnit(ctx, "UNITS_X_NAV");

    case "STOCK":
      return markPerUnit(ctx, "QTY_X_CLOSE");

    case "CRYPTO":
      return markPerUnit(ctx, "QTY_X_CLOSE");

    case "FD":
    case "RD":
      return markAccrual(ctx);

    case "PPF":
    case "EPF":
      return markProvidentFund(ctx, statement);

    case "BOND":
      return markBond(ctx);

    case "SGB":
      return markSgb(ctx);

    case "PROPERTY":
    case "GOLD_PHYSICAL":
      return markDeclared(ctx, declared);

    case "UNLISTED":
    case "ESOP":
    case "RSU":
    case "AIF":
    case "PMS":
      return markLastRound(ctx, declared, statement);

    case "ULIP":
      return markUlip(ctx, statement);

    default:
      // CHIT, P2P, LOAN_GIVEN: not first-class in Phase 1. Take whatever
      // defensible mark exists rather than inventing one.
      return markFallback(ctx, declared, statement);
  }
}

/** Shared units x price path. Refuses a suspended or missing price (§6.19). */
function markPerUnit(ctx: MarkContext, method: ValuationMethod): Mark {
  const { instrument, input, units } = ctx;
  const resolved = input.priceBook.resolve(instrument.instrumentId, input.asOf);
  if (!resolved) {
    return unvalued(
      ctx,
      "NO_PRICE",
      `No price published on or before ${input.asOf} for ${instrument.name}; the position cannot be valued.`,
    );
  }
  if (resolved.suspended) {
    return unvalued(
      ctx,
      "PRICE_SUSPENDED",
      `${instrument.name} is suspended or has no usable price as of ${resolved.priceAsOf}; ` +
        `the holding is NOT worth zero, its value is unknown.`,
    );
  }
  return {
    method,
    value: units * resolved.price,
    price: resolved.price,
    priceAsOf: resolved.priceAsOf,
    priceSource: resolved.source,
    notes: carryForwardNote(resolved),
    warnings: [],
  };
}

function carryForwardNote(r: ResolvedPrice): string[] {
  return r.carriedForward ? [`Price carried forward from ${r.priceAsOf}; markets were shut on the valuation date.`] : [];
}

/**
 * FD and RD. There is no market price for a deposit: the value IS the contract,
 * so we accrue the principal at the contracted rate.
 *
 * An FD is one deposit with one start date, so the whole open principal accrues
 * from `startDate`. An RD is a series of monthly instalments, and each one earns
 * from ITS OWN credit date, so RD lots are accrued individually. Aggregating RD
 * instalments and accruing them all from the account opening date overstates the
 * balance by roughly half a year of interest.
 */
function markAccrual(ctx: MarkContext): Mark {
  const { instrument, input, position, cost, units } = ctx;
  const terms = instrument.accrual;
  if (!terms) {
    return unvalued(
      ctx,
      "NO_ACCRUAL_TERMS",
      `${instrument.name} has no rate or start date on the instrument master, so its accrued value cannot be computed.`,
    );
  }
  const to = accrualEnd(terms.maturityDate, input.asOf);
  const notes: string[] = [];
  const warnings: EngineWarning[] = [];

  const principal = cost > 0 ? cost : terms.principal ?? 0;
  if (cost > 0 && terms.principal != null && !valueMatch(cost, terms.principal)) {
    warnings.push(warn(
      "PRINCIPAL_MISMATCH",
      `Open lot cost ${cost.toFixed(2)} disagrees with the contracted principal ${terms.principal.toFixed(2)} for ${instrument.name}.`,
      position.positionId,
    ));
  }
  if (principal <= 0) {
    return unvalued(ctx, "NO_PRINCIPAL", `${instrument.name} has neither open lots nor a contracted principal to accrue.`);
  }

  let value: number;
  if (instrument.instrumentType === "RD") {
    const lots = input.lots.filter((l) => l.positionId === position.positionId && !l.closed);
    value = 0;
    for (const lot of lots) {
      const from = lot.acquiredOn > terms.startDate ? lot.acquiredOn : terms.startDate;
      value += accruedValue(lot.units * lot.costPerUnit, terms.annualRate, terms.compounding, from, to);
    }
    notes.push("Each instalment accrues from its own credit date.");
  } else {
    value = accruedValue(principal, terms.annualRate, terms.compounding, terms.startDate, to);
  }

  if (to !== input.asOf) {
    notes.push(`Matured on ${to}; interest stops there and is not accrued to ${input.asOf}.`);
  }
  notes.push(`Accrued at ${(terms.annualRate * 100).toFixed(2)}% ${terms.compounding.toLowerCase()} on ACT/365.`);

  return {
    method: "ACCRUED_INTEREST",
    value,
    price: units > UNITS_TOLERANCE ? value / units : 0,
    priceAsOf: to,
    priceSource: "COMPUTED_ACCRUAL",
    // A contractual accrual is exact by construction; it cannot go stale.
    stale: false,
    notes,
    warnings,
  };
}

/**
 * PPF and EPF. The passbook is the truth: EPF interest is credited annually and
 * only EPFO knows the split across employee/employer/pension, so a supplied
 * statement balance always wins. Without one we accrue contributions at the
 * notified rate, which is an ESTIMATE and is declared as such.
 */
function markProvidentFund(ctx: MarkContext, statement?: ProviderBalance): Mark {
  const { input, units } = ctx;
  if (statement) {
    return {
      method: "STATEMENT_BALANCE",
      value: statement.value,
      price: units > UNITS_TOLERANCE ? statement.value / units : 0,
      priceAsOf: statement.asOf,
      priceSource: "STATEMENT",
      stale: daysBetween(statement.asOf, input.asOf) > STATEMENT_STALE_DAYS,
      notes: [`Balance as reported by the provider on ${statement.asOf}.`],
      warnings: [],
    };
  }
  const fallback = markAccrual(ctx);
  if (fallback.method === "UNVALUED") return fallback;
  fallback.notes.push(
    "No statement balance supplied: this is an ESTIMATE that accrues contributions at the notified rate " +
      "and ignores mid-year credit timing rules.",
  );
  fallback.stale = true; // an estimate is never a fresh mark
  return {
    ...fallback,
    assumptions: {
      providentFundFallback: "accrued at the notified rate from AccrualTerms because no statement balance was supplied",
    },
  };
}

/**
 * Bonds trade clean: the quoted price excludes interest earned since the last
 * coupon, and the buyer pays that accrued interest on top. Reporting only the
 * clean price understates the holding by up to a full coupon.
 */
function markBond(ctx: MarkContext): Mark {
  const { instrument, input, units, cost } = ctx;
  const terms = instrument.accrual;
  const resolved = input.priceBook.resolve(instrument.instrumentId, input.asOf);

  if (resolved && !resolved.suspended) {
    const clean = units * resolved.price;
    const notes = carryForwardNote(resolved);
    let accrued = 0;
    if (terms && terms.principal != null) {
      const from = lastCouponDate(terms, resolved.priceAsOf);
      accrued = units * terms.principal * terms.annualRate * Math.max(0, yearFractionAct365(from, resolved.priceAsOf));
      notes.push(`Includes ${accrued.toFixed(2)} of interest accrued since the last coupon on ${from}.`);
    } else {
      notes.push("No coupon terms on the instrument master, so accrued interest is not included.");
    }
    return {
      method: "CLEAN_PRICE_PLUS_ACCRUED",
      value: clean + accrued,
      price: resolved.price,
      priceAsOf: resolved.priceAsOf,
      priceSource: resolved.source,
      notes,
      warnings: [],
    };
  }

  // Most Indian corporate bonds barely trade. Amortised cost is the honest
  // fallback, and it is flagged so nobody mistakes it for a market mark.
  if (terms) {
    const to = accrualEnd(terms.maturityDate, input.asOf);
    const principal = cost > 0 ? cost : (terms.principal ?? 0) * units;
    if (principal > 0) {
      const value = accruedValue(principal, terms.annualRate, terms.compounding, terms.startDate, to);
      return {
        method: "AMORTISED_COST",
        value,
        price: units > UNITS_TOLERANCE ? value / units : 0,
        priceAsOf: to,
        priceSource: "COMPUTED_ACCRUAL",
        stale: true,
        notes: [
          resolved?.suspended
            ? `Quote suspended as of ${resolved.priceAsOf}; held at amortised cost instead.`
            : "No exchange quote available; held at amortised cost, which is not a market price.",
        ],
        warnings: [],
      };
    }
  }
  return unvalued(
    ctx,
    "NO_PRICE",
    `${instrument.name} has no usable quote and no coupon terms to amortise; the position cannot be valued.`,
  );
}

/** Step forward from the issue date in coupon periods to the last one due. */
function lastCouponDate(terms: NonNullable<Instrument["accrual"]>, asOf: DateISO): DateISO {
  const perYear = terms.compounding === "SIMPLE" ? 1 : PERIODS_PER_YEAR[terms.compounding] || 1;
  const monthsPerCoupon = 12 / perYear;
  let last = terms.startDate;
  // Bond tenors are short enough that stepping is clearer than closed form.
  for (let i = 1; i <= perYear * 60; i++) {
    const next = addCouponMonths(terms.startDate, monthsPerCoupon * i);
    if (next > asOf) break;
    last = next;
  }
  return last;
}

function addCouponMonths(from: DateISO, months: number): DateISO {
  const whole = Math.round(months);
  const [y, m, d] = from.split("-").map(Number);
  const total = y * 12 + (m - 1) + whole;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * Sovereign Gold Bonds. The secondary market is thin and SGBs routinely quote at
 * a discount to the gold they represent, while the RBI redeems them at the gold
 * reference price. Valuing at the screen price alone understates the holding, so
 * we take the HIGHER of the quote and the gold reference (both per gram, and one
 * SGB unit is one gram).
 *
 * The 2.5% annual coupon is deliberately NOT added: it is interest income paid
 * out half-yearly, not capital value, and adding it here would double-count it
 * against the income side of the household.
 */
function markSgb(ctx: MarkContext): Mark {
  const { instrument, input, units } = ctx;
  const quoted = usable(input.priceBook.resolve(instrument.instrumentId, input.asOf, "EXCHANGE"));
  const goldDirect = usable(input.priceBook.resolve(instrument.instrumentId, input.asOf, "GOLD_REFERENCE"));
  const goldRef = goldDirect ?? (input.goldReferenceInstrumentId
    ? usable(input.priceBook.resolve(input.goldReferenceInstrumentId, input.asOf))
    : undefined);

  const notes = [`SGB also pays a ${SGB_COUPON_PCT}% annual coupon on the issue price. That is income, NOT capital value, and is excluded here.`];

  if (!quoted && !goldRef) {
    const mark = unvalued(ctx, "NO_PRICE", `No exchange quote and no gold reference price on or before ${input.asOf} for ${instrument.name}.`);
    mark.notes.push(...notes);
    return mark;
  }
  if (!quoted) notes.push("No exchange quote available; valued at the gold reference price alone.");
  if (!goldRef) notes.push("No gold reference price available; valued at the exchange quote alone, which may sit at a discount to gold.");

  const best = !quoted ? goldRef! : !goldRef ? quoted : quoted.price >= goldRef.price ? quoted : goldRef;
  if (quoted && goldRef) {
    notes.push(
      `Higher of exchange quote ${quoted.price.toFixed(2)} (${quoted.priceAsOf}) and gold reference ` +
        `${goldRef.price.toFixed(2)} (${goldRef.priceAsOf}) per gram.`,
    );
  }
  notes.push(...carryForwardNote(best));

  return {
    method: "SGB_HIGHER_OF",
    value: units * best.price,
    price: best.price,
    priceAsOf: best.priceAsOf,
    priceSource: best.source,
    notes,
    warnings: [],
  };
}

function usable(r: ResolvedPrice | undefined): ResolvedPrice | undefined {
  return r && !r.suspended ? r : undefined;
}

/**
 * Property and physical gold. There is no feed; the only input is what the user
 * (or their broker, or a jeweller) said. That is a mark, not a price: illiquid,
 * unverifiable, and it decays. A two-year-old flat valuation is still shown,
 * because hiding the largest asset on most Indian balance sheets is worse, but
 * it is flagged stale so nothing downstream treats it as fact.
 */
function markDeclared(ctx: MarkContext, declared?: DeclaredValue): Mark {
  const { instrument, input, units } = ctx;
  if (!declared) {
    return unvalued(
      ctx,
      "NO_DECLARED_VALUE",
      `${instrument.name} has no user-declared value, so it cannot be valued. Physical assets have no price feed.`,
    );
  }
  const age = daysBetween(declared.lastValuedOn, input.asOf);
  const stale = age > DECLARED_VALUE_STALE_DAYS;
  const notes = [`User-declared value as of ${declared.lastValuedOn}.`];
  if (stale) notes.push(`Valuation is ${age} days old (over ${DECLARED_VALUE_STALE_DAYS}); it may bear no relation to today's market.`);

  return {
    method: "USER_DECLARED",
    value: declared.value,
    price: units > UNITS_TOLERANCE ? declared.value / units : 0,
    priceAsOf: declared.lastValuedOn,
    priceSource: "USER_DECLARED",
    illiquid: true,
    stale,
    notes,
    warnings: [],
    assumptions: { declaredValueStaleAfterDays: DECLARED_VALUE_STALE_DAYS },
  };
}

/**
 * Unlisted equity, ESOPs, RSUs, AIF and PMS units. The mark is the last
 * priced event (funding round, 409A/valuation report, statement NAV), which may
 * be years old and is not a price anyone will pay today. Always illiquid.
 */
function markLastRound(ctx: MarkContext, declared?: DeclaredValue, statement?: ProviderBalance): Mark {
  const { instrument, input, units } = ctx;
  const resolved = usable(input.priceBook.resolve(instrument.instrumentId, input.asOf));
  if (resolved) {
    return {
      method: "LAST_ROUND_PRICE",
      value: units * resolved.price,
      price: resolved.price,
      priceAsOf: resolved.priceAsOf,
      priceSource: resolved.source,
      illiquid: true,
      notes: [`Marked at the last recorded price of ${resolved.priceAsOf}; there is no liquid market at this level.`],
      warnings: [],
    };
  }
  const balance = statement ?? (declared ? { value: declared.value, asOf: declared.lastValuedOn } : undefined);
  if (balance) {
    return {
      method: "LAST_ROUND_PRICE",
      value: balance.value,
      price: units > UNITS_TOLERANCE ? balance.value / units : 0,
      priceAsOf: balance.asOf,
      priceSource: statement ? "STATEMENT" : "USER_DECLARED",
      illiquid: true,
      stale: daysBetween(balance.asOf, input.asOf) > STATEMENT_STALE_DAYS,
      notes: [`Valued from the reported balance of ${balance.asOf}, not from a market price.`],
      warnings: [],
    };
  }
  return unvalued(
    ctx,
    "NO_ROUND_PRICE",
    `${instrument.name} has no last-round price or reported balance, so it cannot be valued.`,
  );
}

/**
 * ULIP. The value is the INSURER'S FUND VALUE, which is what the policyholder
 * would receive. It is emphatically NOT premiums paid: mortality charges, policy
 * admin charges, fund management charges and (in the early years) allocation
 * charges are deducted before anything is invested, so premiums paid overstates
 * the asset, often by 30% or more in year one.
 */
function markUlip(ctx: MarkContext, statement?: ProviderBalance): Mark {
  const { instrument, input, units } = ctx;
  if (!statement) {
    return unvalued(
      ctx,
      "NO_FUND_VALUE",
      `${instrument.name} has no insurer fund value. Premiums paid are NOT the value of a ULIP and must not be substituted.`,
    );
  }
  return {
    method: "FUND_VALUE",
    value: statement.value,
    price: units > UNITS_TOLERANCE ? statement.value / units : 0,
    priceAsOf: statement.asOf,
    priceSource: "STATEMENT",
    stale: daysBetween(statement.asOf, input.asOf) > STATEMENT_STALE_DAYS,
    notes: [`Insurer fund value as of ${statement.asOf}, net of charges.`],
    warnings: [],
  };
}

/** Instrument types Phase 1 does not model explicitly: take the best evidence. */
function markFallback(ctx: MarkContext, declared?: DeclaredValue, statement?: ProviderBalance): Mark {
  const { instrument, input, units } = ctx;
  const resolved = usable(input.priceBook.resolve(instrument.instrumentId, input.asOf));
  if (resolved) {
    return {
      method: "QTY_X_CLOSE",
      value: units * resolved.price,
      price: resolved.price,
      priceAsOf: resolved.priceAsOf,
      priceSource: resolved.source,
      notes: carryForwardNote(resolved),
      warnings: [],
    };
  }
  if (statement) {
    return {
      method: "STATEMENT_BALANCE",
      value: statement.value,
      price: units > UNITS_TOLERANCE ? statement.value / units : 0,
      priceAsOf: statement.asOf,
      priceSource: "STATEMENT",
      stale: daysBetween(statement.asOf, input.asOf) > STATEMENT_STALE_DAYS,
      notes: [`Reported balance as of ${statement.asOf}.`],
      warnings: [],
    };
  }
  if (declared) return markDeclared(ctx, declared);
  if (instrument.accrual) return markAccrual(ctx);
  return unvalued(
    ctx,
    "NO_PRICE",
    `${instrument.name} (${instrument.instrumentType}) has no price, balance, declared value or accrual terms.`,
  );
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

function dataSourceFor(source: PriceSource): { kind: DataSourceKind; label: string } {
  switch (source) {
    case "AMFI": return { kind: "AMFI_NAV", label: "AMFI published NAV" };
    case "EXCHANGE": return { kind: "EXCHANGE", label: "Exchange close" };
    case "GOLD_REFERENCE": return { kind: "EXCHANGE", label: "Gold reference price" };
    case "STATEMENT": return { kind: "MANUAL_ENTRY", label: "Provider statement balance" };
    case "USER_DECLARED": return { kind: "MANUAL_ENTRY", label: "User-declared valuation" };
    case "COMPUTED_ACCRUAL": return { kind: "DERIVED", label: "Contractual accrual" };
  }
}

/** One entry per distinct source, stamped with the freshest date we used. */
function recordSource(into: Map<string, DataSourceRef>, source: PriceSource, asOf: DateISO): void {
  const { kind, label } = dataSourceFor(source);
  const key = `${kind}::${label}`;
  const existing = into.get(key);
  if (!existing) into.set(key, { kind, label, asOf });
  else if (asOf > existing.asOf) existing.asOf = asOf;
}
