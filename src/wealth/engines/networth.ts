/**
 * Net worth (spec §4.1) and the change decomposition that sits under it.
 *
 * Net worth is the one number a household actually recognises, which is exactly
 * why it is dangerous. Two failure modes are designed against here:
 *
 *  1. A CONFIDENT WRONG TOTAL. Assets minus liabilities is arithmetic; the risk
 *     is the arithmetic being run over marks nobody should trust. A snapshot
 *     holding a stale NAV, an unpriced side pocket or a user-declared flat
 *     valuation cannot produce a HIGH confidence net worth, so the valuation's
 *     confidence and warnings are inherited and then degraded with `weakest`,
 *     never reset (spec §5).
 *
 *  2. "MY PORTFOLIO WENT UP." It usually did not; the user paid in. Indian
 *     households run SIPs, so month on month a portfolio grows even in a
 *     falling market, and conflating the two is how people conclude they are
 *     good at investing during a bull run. `decomposeChange` splits the two
 *     apart and holds the identity opening + contribution + movement = closing.
 *
 * Both entry points are pure: every input is passed in, nothing is read from a
 * clock or a global (spec §10). Rupee outputs are rounded at this boundary only
 * (§6.20); all internal arithmetic runs at full precision.
 */

import type {
  Account, AccountId, AssetClass, DateISO, Instrument, InstrumentId, InstrumentType,
  Liability, Member, MemberId, PositionValuation, Transaction, TransactionType, ValuationSnapshot,
} from "../domain/types.ts";
import { daysBetween, isValidDate } from "../domain/dates.ts";
import { roundAmount, roundTo, valueMatch } from "../domain/money.ts";
import {
  blocking, info, ok, warn, weakest,
  type Confidence, type DataSourceRef, type EngineResult, type EngineWarning,
} from "../domain/result.ts";

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

export interface AssetClassSlice {
  assetClass: AssetClass;
  value: number;
  /** Share of TOTAL ASSETS, not of net worth. Percent, 0..100. */
  sharePct: number;
}

export interface InstrumentTypeSlice {
  instrumentType: InstrumentType;
  value: number;
  sharePct: number;
}

export interface MemberSlice {
  memberId: MemberId;
  memberName?: string;
  assets: number;
  liabilities: number;
  net: number;
}

export interface NetWorthView {
  asOf: DateISO;
  currency: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  byAssetClass: AssetClassSlice[];
  byMember: MemberSlice[];
  byInstrumentType: InstrumentTypeSlice[];
  /** Split of TOTAL ASSETS by whether the money can actually be reached. */
  liquidVsIlliquid: { liquid: number; illiquid: number };
}

export interface NetWorthInput {
  /**
   * Pass the valuation engine's EngineResult when you have it: its warnings,
   * confidence and data sources are inherited. A bare `ValuationSnapshot` is
   * accepted too, and is then treated as HIGH confidence with no warnings,
   * which is only honest if the caller has already checked it.
   */
  valuation: ValuationSnapshot | EngineResult<ValuationSnapshot>;
  liabilities: Liability[];
  accounts: Record<AccountId, Account>;
  members?: Record<MemberId, Member>;
  /** Optional. When supplied, `liquidityTier` beats the instrument-type default. */
  instruments?: Record<InstrumentId, Instrument>;
}

/**
 * Illiquid by nature when no better information is available.
 *
 * PPF, EPF and NPS are locked by statute rather than by market depth: the money
 * is real and it is not spendable this year. Property, unlisted shares, ESOPs
 * and RSUs have no continuous market, so their "value" is an estimate that a
 * sale would have to discover. AIF, PMS, chit funds, P2P and loans given out
 * cannot be exited at will. Physical gold is sellable the same day but only
 * through a dealer spread and making-charge haircut, so it is not cash.
 *
 * FDs and RDs are deliberately NOT here: an Indian bank FD can be broken online
 * the same day for a penalty of about 1%, which makes it liquid money that
 * costs a little to reach.
 */
export const ILLIQUID_INSTRUMENT_TYPES: readonly InstrumentType[] = [
  "PROPERTY", "UNLISTED", "ESOP", "RSU", "AIF", "PMS",
  "PPF", "EPF", "NPS", "ULIP", "CHIT", "P2P", "LOAN_GIVEN", "GOLD_PHYSICAL",
];

/**
 * An outstanding balance older than a quarter is a number the lender has moved
 * on from. Home loan EMIs amortise every month, so a stale figure overstates
 * the debt and understates net worth; a credit card balance moves faster still.
 */
export const LIABILITY_STALE_AFTER_DAYS = 92;

const ILLIQUID_SET = new Set<InstrumentType>(ILLIQUID_INSTRUMENT_TYPES);

/** Percent share of a total, 4dp. Zero (never NaN) when there is nothing to divide. */
function sharePct(value: number, total: number): number {
  if (!(total > 0)) return 0;
  return roundTo((value / total) * 100, 4);
}

/** Unwrap an EngineResult if that is what we were handed, else assume the best. */
function unwrapValuation(v: ValuationSnapshot | EngineResult<ValuationSnapshot>): {
  snapshot: ValuationSnapshot;
  warnings: EngineWarning[];
  confidence: Confidence;
  dataSources: DataSourceRef[];
} {
  if (v && typeof v === "object" && "data" in v && "confidence" in v) {
    const r = v as EngineResult<ValuationSnapshot>;
    return {
      snapshot: r.data,
      warnings: r.warnings ?? [],
      confidence: r.confidence ?? "HIGH",
      dataSources: r.dataSources ?? [],
    };
  }
  return { snapshot: v as ValuationSnapshot, warnings: [], confidence: "HIGH", dataSources: [] };
}

/** Sum of position values at full precision. The snapshot's own total is checked
 *  against this rather than trusted, because a total that disagrees with its own
 *  parts is a bug we must show rather than inherit. */
function sumPositions(positions: PositionValuation[]): number {
  let total = 0;
  for (const p of positions) total += Number.isFinite(p.value) ? p.value : 0;
  return total;
}

function isIlliquid(pv: PositionValuation, instrument?: Instrument): boolean {
  if (pv.illiquid) return true;
  if (instrument) {
    if (instrument.liquidityTier === "LOCKED" || instrument.liquidityTier === "ILLIQUID") return true;
    return ILLIQUID_SET.has(instrument.instrumentType);
  }
  return ILLIQUID_SET.has(pv.instrumentType);
}

/** Descending by value, ties broken by key so output order is deterministic. */
function byValueDesc<T extends { value: number }>(key: (t: T) => string) {
  return (a: T, b: T): number => (a.value === b.value ? key(a).localeCompare(key(b), "en") : b.value - a.value);
}

/**
 * Assets minus liabilities, sliced by asset class, member, instrument type and
 * liquidity.
 *
 * Every slice is a share of TOTAL ASSETS, never of net worth: a household with
 * 1cr of assets and a 90L home loan has a net worth of 10L, and expressing a
 * 50L equity holding as "500% of your net worth" is arithmetically true and
 * completely useless.
 */
export function computeNetWorth(input: NetWorthInput): EngineResult<NetWorthView> {
  const { snapshot, warnings: inherited, confidence: valuationConfidence, dataSources: valuationSources } =
    unwrapValuation(input.valuation);
  const accounts = input.accounts ?? {};
  const members = input.members;
  const instruments = input.instruments;

  // Inherited warnings are carried, never re-authored: the valuation engine's
  // account of what went wrong is the one the copilot has to be able to quote.
  const warnings: EngineWarning[] = [...inherited];
  const floors: Confidence[] = [valuationConfidence];

  const asOf = snapshot.asOf;
  const positions = snapshot.positions ?? [];

  // -------------------------------------------------------------------------
  // Assets
  // -------------------------------------------------------------------------
  const totalAssetsRaw = sumPositions(positions);
  if (Number.isFinite(snapshot.totalAssets) && !valueMatch(totalAssetsRaw, snapshot.totalAssets)) {
    warnings.push(
      warn(
        "NETWORTH_TOTAL_MISMATCH",
        `The snapshot reports total assets of ${roundAmount(snapshot.totalAssets)} but its own positions add up to ` +
          `${roundAmount(totalAssetsRaw)}. The positions were used, because they are the rows every slice below is ` +
          `built from and a total that disagrees with its parts cannot be reconciled.`,
        snapshot.householdId,
      ),
    );
    floors.push("MEDIUM");
  }

  if (snapshot.hasStalePrices) {
    warnings.push(
      warn(
        "NETWORTH_STALE_PRICES",
        `At least one holding is valued at a price older than the staleness threshold, so this net worth is a mark ` +
          `from an earlier date rather than today's worth.`,
        snapshot.householdId,
      ),
    );
    floors.push("MEDIUM");
  }

  if (snapshot.hasUnvaluedPositions) {
    warnings.push(
      blocking(
        "NETWORTH_UNVALUED_POSITIONS",
        `At least one holding could not be valued, so it contributes nothing to total assets and this net worth is ` +
          `understated by an unknown amount. Show it with the gap named, never as a plain number.`,
        snapshot.householdId,
      ),
    );
    floors.push("LOW");
  }

  const seenPositionIds = new Set<string>();
  const assetsByClass = new Map<AssetClass, number>();
  const assetsByType = new Map<InstrumentType, number>();
  const assetsByMember = new Map<MemberId, number>();
  const jointAccountsFlagged = new Set<AccountId>();
  const unknownAccountsFlagged = new Set<AccountId>();
  let liquid = 0;
  let illiquid = 0;
  let declaredValueSeen = false;

  for (const pv of positions) {
    if (seenPositionIds.has(pv.positionId)) {
      warnings.push(
        warn(
          "NETWORTH_DUPLICATE_POSITION",
          `Position ${pv.positionId} appears twice in the snapshot and both rows were counted, so this total is ` +
            `probably double counting it. Reconciliation owns the cross-source duplicate rule (§6.3).`,
          pv.positionId,
        ),
      );
      floors.push("MEDIUM");
    }
    seenPositionIds.add(pv.positionId);

    const value = Number.isFinite(pv.value) ? pv.value : 0;
    if (!Number.isFinite(pv.value)) {
      warnings.push(
        blocking(
          "NETWORTH_NON_NUMERIC_VALUE",
          `Position ${pv.positionId} has a value of ${String(pv.value)} and was counted as zero. The total is wrong ` +
            `by whatever that holding is really worth.`,
          pv.positionId,
        ),
      );
      floors.push("LOW");
    }

    assetsByClass.set(pv.assetClass, (assetsByClass.get(pv.assetClass) ?? 0) + value);
    assetsByType.set(pv.instrumentType, (assetsByType.get(pv.instrumentType) ?? 0) + value);

    const instrument = instruments?.[pv.instrumentId];
    if (isIlliquid(pv, instrument)) illiquid += value;
    else liquid += value;

    if (pv.method === "USER_DECLARED" || pv.method === "LAST_ROUND_PRICE") declaredValueSeen = true;

    // Ownership: the account master is the record of who owns the holding, and
    // the valuation row is derived from it, so the account wins a disagreement.
    const account = accounts[pv.accountId];
    if (!account && !unknownAccountsFlagged.has(pv.accountId)) {
      unknownAccountsFlagged.add(pv.accountId);
      warnings.push(
        warn(
          "NETWORTH_UNKNOWN_ACCOUNT",
          `No account master row for ${pv.accountId}, so its holdings are attributed using the member id carried on ` +
            `the valuation row and joint ownership could not be checked.`,
          pv.accountId,
        ),
      );
      floors.push("MEDIUM");
    }
    if (account && pv.memberId && account.memberId !== pv.memberId) {
      warnings.push(
        warn(
          "NETWORTH_MEMBER_MISMATCH",
          `Position ${pv.positionId} is attributed to ${pv.memberId} by the valuation but account ${pv.accountId} is ` +
            `held by ${account.memberId}. The account master was used.`,
          pv.positionId,
        ),
      );
      floors.push("MEDIUM");
    }
    const memberId = account?.memberId ?? pv.memberId ?? "UNATTRIBUTED";
    assetsByMember.set(memberId, (assetsByMember.get(memberId) ?? 0) + value);

    // §6.16: a joint holding is shown whole against the primary holder. Beneficial
    // splits are not modelled in Phase 1, and quietly halving the value would be a
    // worse answer than saying so.
    if (account?.jointMemberIds?.length && value !== 0 && !jointAccountsFlagged.has(account.accountId)) {
      jointAccountsFlagged.add(account.accountId);
      warnings.push(
        info(
          "NETWORTH_JOINT_HOLDING",
          `Account ${account.accountId} is jointly held with ${account.jointMemberIds.join(", ")}. Its full value is ` +
            `attributed to the primary holder ${account.memberId}; Phase 1 does not split beneficial ownership (§6.16).`,
          account.accountId,
        ),
      );
    }
  }

  if (declaredValueSeen) {
    warnings.push(
      info(
        "NETWORTH_DECLARED_VALUES",
        `Some holdings are carried at a value the user declared or at a last funding round rather than at a traded ` +
          `price. Those are estimates and move only when someone re-declares them.`,
        snapshot.householdId,
      ),
    );
    floors.push("MEDIUM");
  }

  // -------------------------------------------------------------------------
  // Liabilities. They reduce net worth and belong to the member who owes them.
  // -------------------------------------------------------------------------
  const liabilitiesByMember = new Map<MemberId, number>();
  const seenLiabilityIds = new Set<string>();
  let totalLiabilitiesRaw = 0;

  for (const l of input.liabilities ?? []) {
    if (l.householdId && snapshot.householdId && l.householdId !== snapshot.householdId) {
      warnings.push(
        warn(
          "NETWORTH_FOREIGN_LIABILITY",
          `Liability ${l.liabilityId} belongs to household ${l.householdId}, not ${snapshot.householdId}, and was ` +
            `excluded. It is not this household's debt to carry.`,
          l.liabilityId,
        ),
      );
      continue;
    }
    if (seenLiabilityIds.has(l.liabilityId)) {
      warnings.push(
        warn(
          "NETWORTH_DUPLICATE_LIABILITY",
          `Liability ${l.liabilityId} was supplied twice and counted once.`,
          l.liabilityId,
        ),
      );
      floors.push("MEDIUM");
      continue;
    }
    seenLiabilityIds.add(l.liabilityId);

    const outstanding = Number.isFinite(l.outstanding) ? l.outstanding : 0;
    if (!Number.isFinite(l.outstanding)) {
      warnings.push(
        blocking(
          "NETWORTH_NON_NUMERIC_LIABILITY",
          `Liability ${l.liabilityId} has an outstanding balance of ${String(l.outstanding)} and was counted as zero, ` +
            `so net worth is overstated by whatever is really owed.`,
          l.liabilityId,
        ),
      );
      floors.push("LOW");
    }

    totalLiabilitiesRaw += outstanding;
    liabilitiesByMember.set(l.memberId, (liabilitiesByMember.get(l.memberId) ?? 0) + outstanding);

    if (!l.asOf || !isValidDate(l.asOf)) {
      warnings.push(
        warn(
          "NETWORTH_LIABILITY_UNDATED",
          `Liability ${l.liabilityId} carries no usable date (${JSON.stringify(l.asOf)}), so there is no way to tell ` +
            `how far the balance has amortised since it was last read. It was counted at face value.`,
          l.liabilityId,
        ),
      );
      floors.push("MEDIUM");
    } else if (l.asOf > asOf) {
      warnings.push(
        warn(
          "NETWORTH_LIABILITY_AFTER_ASOF",
          `Liability ${l.liabilityId} is dated ${l.asOf}, after the ${asOf} valuation date, so this balance sheet ` +
            `nets a future loan balance against today's assets.`,
          l.liabilityId,
        ),
      );
      floors.push("MEDIUM");
    } else if (isValidDate(asOf)) {
      const age = daysBetween(l.asOf, asOf);
      if (age > LIABILITY_STALE_AFTER_DAYS) {
        warnings.push(
          warn(
            "NETWORTH_LIABILITY_STALE",
            `Liability ${l.liabilityId} was last updated ${l.asOf}, ${age} days before ${asOf}. EMIs paid since then ` +
              `have reduced the principal, so net worth is understated.`,
            l.liabilityId,
          ),
        );
        floors.push("MEDIUM");
      }
    }

    if (members && !members[l.memberId]) {
      warnings.push(
        info(
          "NETWORTH_UNKNOWN_MEMBER",
          `Liability ${l.liabilityId} is owed by ${l.memberId}, who has no member master row.`,
          l.liabilityId,
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Assemble. Rounding happens here and only here (§6.20).
  // -------------------------------------------------------------------------
  const totalAssets = roundAmount(totalAssetsRaw);
  const totalLiabilities = roundAmount(totalLiabilitiesRaw);

  const byAssetClass: AssetClassSlice[] = [...assetsByClass.entries()]
    .map(([assetClass, value]) => ({ assetClass, value: roundAmount(value), sharePct: sharePct(value, totalAssetsRaw) }))
    .sort(byValueDesc((s) => s.assetClass));

  const byInstrumentType: InstrumentTypeSlice[] = [...assetsByType.entries()]
    .map(([instrumentType, value]) => ({
      instrumentType,
      value: roundAmount(value),
      sharePct: sharePct(value, totalAssetsRaw),
    }))
    .sort(byValueDesc((s) => s.instrumentType));

  const memberIds = new Set<MemberId>([...assetsByMember.keys(), ...liabilitiesByMember.keys()]);
  const byMember: MemberSlice[] = [...memberIds]
    .map((memberId) => {
      const assets = assetsByMember.get(memberId) ?? 0;
      const liabilities = liabilitiesByMember.get(memberId) ?? 0;
      return {
        memberId,
        memberName: members?.[memberId]?.name,
        assets: roundAmount(assets),
        liabilities: roundAmount(liabilities),
        net: roundAmount(assets - liabilities),
      };
    })
    .sort((a, b) => (a.net === b.net ? a.memberId.localeCompare(b.memberId, "en") : b.net - a.net));

  const view: NetWorthView = {
    asOf,
    currency: snapshot.currency,
    totalAssets,
    totalLiabilities,
    netWorth: roundAmount(totalAssetsRaw - totalLiabilitiesRaw),
    byAssetClass,
    byMember,
    byInstrumentType,
    liquidVsIlliquid: { liquid: roundAmount(liquid), illiquid: roundAmount(illiquid) },
  };

  const dataSources: DataSourceRef[] = [
    ...valuationSources,
    { kind: "DERIVED", label: "Net worth from valuation snapshot and liabilities", asOf },
  ];
  if (seenLiabilityIds.size > 0) {
    let oldest = asOf;
    for (const l of input.liabilities ?? []) if (l.asOf && l.asOf < oldest) oldest = l.asOf;
    dataSources.push({ kind: "MANUAL_ENTRY", label: `${seenLiabilityIds.size} liability balance(s)`, asOf: oldest });
  }

  return ok(view, {
    asOf,
    confidence: weakest(...floors),
    dataSources,
    assumptions: {
      sharesComputedOn: "totalAssets",
      liabilitiesAtOutstandingFaceValue: true,
      jointHoldingsAttributedToPrimaryHolder: true,
      liquidityFrom: instruments ? "instrument.liquidityTier" : "instrumentType",
      liabilityStaleAfterDays: LIABILITY_STALE_AFTER_DAYS,
      positionsCounted: positions.length,
      liabilitiesCounted: seenLiabilityIds.size,
    },
    warnings,
  });
}

// ---------------------------------------------------------------------------
// Change decomposition (spec §4.1)
// ---------------------------------------------------------------------------

export interface ChangeDecomposition {
  fromAsOf: DateISO;
  toAsOf: DateISO;
  openingValue: number;
  closingValue: number;
  netContribution: number;
  marketMovement: number;
  totalChange: number;
  /** Gross money in, before netting. A 5L SIP against a 5L redemption is not "no activity". */
  inflows: number;
  /** Gross money out, as a positive number. */
  outflows: number;
  transactionsCounted: number;
}

/**
 * Money the household put IN. A switch-in is here because it is a real
 * purchase, and it is cancelled out by its switch-out on the other side, which
 * is exactly what makes a pure switch net to zero new money (§6.8).
 */
export const CONTRIBUTION_IN_TYPES: readonly TransactionType[] = [
  "BUY", "SWITCH_IN", "CONTRIBUTION", "TRANSFER_IN",
];

/** Money the household took OUT. An IDCW payout is cash leaving the portfolio
 *  into a bank account, so it is a withdrawal and not a loss. */
export const CONTRIBUTION_OUT_TYPES: readonly TransactionType[] = [
  "SELL", "SWITCH_OUT", "IDCW_PAYOUT", "TRANSFER_OUT", "MATURITY",
];

/**
 * Events that move units or accrue value but move no household money, so they
 * belong in market movement rather than in contribution:
 *   BONUS / SPLIT        unit count changes, value does not
 *   MERGER_IN / _OUT     the same money under a new ISIN (§6.4)
 *   SEGREGATION          a side pocket carved out of value already counted (§6.5)
 *   IDCW_REINVEST        the NAV falls by exactly what the new units add, so
 *                        treating it as a contribution would invent new money
 *   INTEREST_CREDIT      EPF, PPF and FD interest is return earned, not money
 *                        the household paid in
 */
const NEUTRAL_TYPES: readonly TransactionType[] = [
  "BONUS", "SPLIT", "MERGER_IN", "MERGER_OUT", "SEGREGATION", "IDCW_REINVEST", "INTEREST_CREDIT",
];

const IN_SET = new Set<TransactionType>(CONTRIBUTION_IN_TYPES);
const OUT_SET = new Set<TransactionType>(CONTRIBUTION_OUT_TYPES);
const NEUTRAL_SET = new Set<TransactionType>(NEUTRAL_TYPES);

/**
 * Rupees moved by a transaction, sign-free: direction comes from the type, not
 * from the sign, because statements print redemptions negative about half the
 * time. Gross, not net of STT, stamp duty or exit load, so that those costs
 * show up as a drag inside market movement instead of being hidden.
 */
function moneyMoved(t: Transaction): number | undefined {
  if (t.amount != null && Number.isFinite(t.amount)) return Math.abs(t.amount);
  if (t.units != null && t.pricePerUnit != null && Number.isFinite(t.units * t.pricePerUnit)) {
    return Math.abs(t.units * t.pricePerUnit);
  }
  return undefined;
}

export interface DecomposeOptions {
  /** When given, transactions on accounts outside the household are excluded. */
  accounts?: Record<AccountId, Account>;
}

/**
 * Split a change in portfolio value into what the household paid in and what
 * the market did (spec §4.1).
 *
 * `marketMovement` is deliberately the RESIDUAL, not an independently computed
 * figure. Anything we failed to classify therefore lands in it and shows up as
 * an implausible market number, which is a visible failure. Deriving the two
 * independently would let them disagree and quietly hide the gap.
 *
 * The window is (fromAsOf, toAsOf]: a transaction ON the opening date is
 * already inside the opening value, and one on the closing date is inside the
 * closing value. Values are ASSETS, not net worth; a loan repayment is not a
 * portfolio contribution and does not belong in this split.
 */
export function decomposeChange(
  prev: ValuationSnapshot | undefined,
  curr: ValuationSnapshot,
  transactions: Transaction[],
  options: DecomposeOptions = {},
): EngineResult<ChangeDecomposition> {
  const warnings: EngineWarning[] = [];
  const floors: Confidence[] = ["HIGH"];

  const toAsOf = curr.asOf;
  const closingRaw = sumPositions(curr.positions ?? []);
  const openingRaw = prev ? sumPositions(prev.positions ?? []) : 0;

  if (!prev) {
    // No earlier snapshot at all: the only defensible reading is inception to
    // date, opening zero. Said out loud, because if the household did hold
    // something before this date the whole split is wrong.
    warnings.push(
      warn(
        "CHANGE_NO_OPENING_SNAPSHOT",
        `No snapshot exists on or before the start of this window, so the opening value was taken as zero and every ` +
          `transaction up to ${toAsOf} was treated as a contribution. If the household held anything earlier, the ` +
          `split between contribution and market movement is wrong.`,
        curr.householdId,
      ),
    );
    floors.push("MEDIUM");
  } else {
    if (prev.householdId !== curr.householdId) {
      warnings.push(
        blocking(
          "CHANGE_HOUSEHOLD_MISMATCH",
          `The opening snapshot belongs to household ${prev.householdId} and the closing one to ${curr.householdId}. ` +
            `This compares two different balance sheets and the result is meaningless.`,
          curr.householdId,
        ),
      );
      floors.push("LOW");
    }
    if (prev.currency !== curr.currency) {
      warnings.push(
        blocking(
          "CHANGE_CURRENCY_MISMATCH",
          `Opening snapshot is in ${prev.currency} and closing in ${curr.currency}; the difference between them is not ` +
            `a change in wealth.`,
          curr.householdId,
        ),
      );
      floors.push("LOW");
    }
    if (prev.asOf >= curr.asOf) {
      warnings.push(
        blocking(
          "CHANGE_WINDOW_INVALID",
          `The opening snapshot is dated ${prev.asOf} and the closing one ${curr.asOf}, so the window is empty or ` +
            `runs backwards. No transaction can fall inside it and the whole change lands in market movement.`,
          curr.householdId,
        ),
      );
      floors.push("LOW");
    }
  }

  if (prev?.hasStalePrices || curr.hasStalePrices) floors.push("MEDIUM");
  if (prev?.hasUnvaluedPositions || curr.hasUnvaluedPositions) {
    warnings.push(
      warn(
        "CHANGE_UNVALUED_POSITIONS",
        `A holding is unvalued in at least one of the two snapshots, so part of the movement below is a valuation gap ` +
          `appearing or disappearing rather than a real gain or loss.`,
        curr.householdId,
      ),
    );
    floors.push("LOW");
  }

  const accounts = options.accounts;
  let inflowRaw = 0;
  let outflowRaw = 0;
  let counted = 0;
  let earliestCounted: DateISO | undefined;

  for (const t of transactions ?? []) {
    if (!t?.tradeDate) continue;
    // (fromAsOf, toAsOf]. With no opening snapshot the lower bound is open.
    if (prev && t.tradeDate <= prev.asOf) continue;
    if (t.tradeDate > toAsOf) continue;

    if (accounts) {
      const account = accounts[t.accountId];
      if (!account) {
        warnings.push(
          warn(
            "CHANGE_UNKNOWN_ACCOUNT",
            `Transaction ${t.transactionId} is on account ${t.accountId}, which has no master row, so it was excluded ` +
              `from the contribution total and its money is sitting in market movement instead.`,
            t.transactionId,
          ),
        );
        floors.push("MEDIUM");
        continue;
      }
      if (curr.householdId && account.householdId !== curr.householdId) continue; // another household's money
    }

    if (NEUTRAL_SET.has(t.type)) continue;

    const isIn = IN_SET.has(t.type);
    const isOut = OUT_SET.has(t.type);
    if (!isIn && !isOut) {
      const moved = moneyMoved(t);
      if (moved) {
        // RIGHTS is the live example: it is a cash purchase that spec §4.1's
        // contribution list does not name, so we refuse to guess and say where
        // the money went instead of silently calling it a market gain.
        warnings.push(
          warn(
            "CHANGE_UNCLASSIFIED_TXN",
            `Transaction ${t.transactionId} of type ${t.type} on ${t.tradeDate} moved ${roundAmount(moved)} but is not ` +
              `classified as a contribution or a withdrawal, so that amount is counted as market movement.`,
            t.transactionId,
          ),
        );
        floors.push("MEDIUM");
      }
      continue;
    }

    const moved = moneyMoved(t);
    if (moved == null) {
      warnings.push(
        blocking(
          "CHANGE_TXN_AMOUNT_MISSING",
          `Transaction ${t.transactionId} (${t.type} on ${t.tradeDate}) carries neither an amount nor units and a ` +
            `price, so the money it moved is unknown. It was counted as zero and market movement has absorbed it.`,
          t.transactionId,
        ),
      );
      floors.push("LOW");
      continue;
    }

    if (isIn) inflowRaw += moved;
    else outflowRaw += moved;
    counted++;
    if (!earliestCounted || t.tradeDate < earliestCounted) earliestCounted = t.tradeDate;
  }

  // Round FIRST, then take the residual, so that
  // openingValue + netContribution + marketMovement === closingValue holds on
  // the numbers we publish rather than only on the ones we computed with. The
  // identity is exact at the 2dp the view carries (§6.20); re-adding the three
  // float64 fields can still land a few ten-billionths out, which is IEEE-754
  // and not a modelling gap.
  const openingValue = roundAmount(openingRaw);
  const closingValue = roundAmount(closingRaw);
  const netContribution = roundAmount(inflowRaw - outflowRaw);
  const marketMovement = roundAmount(closingValue - openingValue - netContribution);
  const totalChange = roundAmount(closingValue - openingValue);

  const fromAsOf = prev ? prev.asOf : (earliestCounted ?? toAsOf);

  const data: ChangeDecomposition = {
    fromAsOf,
    toAsOf,
    openingValue,
    closingValue,
    netContribution,
    marketMovement,
    totalChange,
    inflows: roundAmount(inflowRaw),
    outflows: roundAmount(outflowRaw),
    transactionsCounted: counted,
  };

  return ok(data, {
    asOf: toAsOf,
    confidence: weakest(...floors),
    dataSources: [
      { kind: "DERIVED", label: `Change decomposition ${fromAsOf} to ${toAsOf}`, asOf: toAsOf },
    ],
    assumptions: {
      windowIsOpeningExclusive: true,
      marketMovementIsResidual: true,
      contributionsGrossOfCharges: true,
      openingSnapshotSupplied: prev != null,
      valuesAre: "totalAssets",
    },
    warnings,
  });
}
