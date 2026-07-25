/**
 * Reconciliation engine (spec §2.3): the gate that stops silent wrong numbers.
 *
 * Everything upstream of this file is a guess until it agrees with the
 * custodian's own statement. The ledger can only replay the transactions it was
 * given, and an Indian portfolio is assembled from partial artifacts: a CAMS
 * eCAS that omits KFintech folios, an NSDL CAS that republishes the same SOA
 * units it already holds in demat (§6.3), an EPF passbook with no unit concept.
 * So we compare what we derived against what the statement asserts, and we
 * refuse to present a number that lost that comparison.
 *
 * Five checks, each returned as a structured record so the UI and the copilot
 * can render the break rather than paraphrase it:
 *   UNITS       open lot units vs statement closing units, 0.001 units
 *   VALUE       computed position value vs statement closing value, 0.5%
 *   ORPHANS     a sell with no matching lot, so cost basis is unknowable
 *   DUPLICATES  one holding counted twice across SOA and DEMAT (§6.3)
 *   STALE_PRICE a mark older than 2 trading days
 *
 * Severity policy (the one real judgement call here):
 *   - A UNITS break is BLOCKING. If we disagree with the custodian about how
 *     many units exist, every rupee downstream is wrong and no banner can
 *     rescue it.
 *   - A VALUE break with matching units is a WARN. Units agreeing means the
 *     holding is right and the PRICE is in question, which is usually the
 *     statement's NAV date differing from ours. That must be disclosed, but it
 *     does not mean the portfolio is unknown.
 *
 * Pure: no clock, no I/O. `asOf` is supplied by the caller (spec §10).
 */

import type {
  AccountId, DateISO, InstrumentId, PositionId, StatementBalance, ValuationSnapshot,
} from "../domain/types.ts";
import type { LedgerState } from "./ledger.ts";
import { openUnits, positionIdFor } from "./ledger.ts";
import {
  UNITS_TOLERANCE, VALUE_TOLERANCE_PCT, relativeDiff, roundAmount, roundUnits, unitsMatch, valueMatch,
} from "../domain/money.ts";
import { tradingDaysBetween } from "../domain/dates.ts";
import {
  blocking, info, ok, warn,
  type EngineResult, type EngineWarning, type WarningSeverity,
} from "../domain/result.ts";

/**
 * Closing balance asserted by a statement, keyed the same way a Position is.
 *
 * NOTE: `src/wealth/ingest/cas.ts` declares a structurally identical interface.
 * The two are deliberately duplicated so each module compiles standalone; they
 * should be unified into one shared type once both have landed.
 */
/** Re-exported from the shared contract; ingestion emits exactly this shape. */
export type { StatementBalance } from "../domain/types.ts";

export type ReconciliationCheckKind =
  | "UNITS" | "VALUE" | "ORPHANS" | "DUPLICATES" | "STALE_PRICE"
  /** A holding the statements never mentioned. Reported, never fatal. */
  | "COVERAGE";

/**
 * One comparison and its outcome.
 *
 * `severity` is what a FAILURE of this check means; a passing check carries it
 * unchanged so the UI can say "this would have been blocking". Counts and the
 * report-level `passed` flag therefore only look at severity where
 * `passed === false`.
 *
 * Numeric fields are rounded at this boundary (units 4dp, rupees 2dp) because
 * the report is an output surface; the comparisons themselves run at full
 * precision (spec §6.20).
 */
export interface ReconciliationCheck {
  checkId: string;
  kind: ReconciliationCheckKind;
  /** Position, instrument or transaction the break is about. */
  subjectId: string;
  passed: boolean;
  /** What the statement (or the tolerance rule) asserts. */
  expected?: number;
  /** What we derived. */
  actual?: number;
  /** actual - expected. Positive means we hold more than the statement says. */
  difference?: number;
  severity: WarningSeverity;
  message: string;
}

export interface ReconciliationReport {
  /** False when any check failed at BLOCKING severity. */
  passed: boolean;
  checks: ReconciliationCheck[];
  blockingCount: number;
  warnCount: number;
  /** Distinct positions that were compared against a statement row. */
  positionsChecked: number;
  /** Held positions no statement covered: usually property, gold or an FD. */
  positionsWithoutStatement: PositionId[];
}

export interface ReconcileInput {
  asOf: DateISO;
  ledger: LedgerState;
  statements: StatementBalance[];
  /** When present, enables the VALUE check. */
  valuation?: ValuationSnapshot;
  /** Overrides the price date taken from the valuation snapshot. */
  priceAsOfByInstrument?: Record<InstrumentId, DateISO>;
}

/**
 * Indian equity settles T+1 and AMFI publishes NAV by 11pm on a business day,
 * so anything older than two trading days is a mark we should not quote
 * silently (spec §2.3). Exchange holidays are not modelled, which makes this
 * rule err toward flagging rather than toward hiding a stale price.
 */
export const STALE_PRICE_MAX_TRADING_DAYS = 2;

/**
 * Statements round units to 3 or 4 dp, so a cross-source duplicate rarely
 * matches to the last digit. 0.1% relative is loose enough to catch the real
 * §6.3 double-count and tight enough not to pair two genuinely different
 * holdings of the same scheme.
 */
export const DUPLICATE_UNITS_TOLERANCE_PCT = 0.001;

const CODE_BY_KIND: Record<ReconciliationCheckKind, string> = {
  UNITS: "RECON_UNITS_MISMATCH",
  VALUE: "RECON_VALUE_MISMATCH",
  ORPHANS: "RECON_ORPHAN_SELL",
  DUPLICATES: "RECON_DUPLICATE_POSITION",
  STALE_PRICE: "RECON_STALE_PRICE",
  COVERAGE: "RECON_NO_STATEMENT",
};

/** Materially the same quantity, absolute or relative (see the constant above). */
function unitsMateriallyEqual(a: number, b: number): boolean {
  if (unitsMatch(a, b)) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && Math.abs(a - b) / scale <= DUPLICATE_UNITS_TOLERANCE_PCT;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

/**
 * Compare the derived lot ledger against the statements that produced it.
 *
 * Returns every comparison, passing or failing, so the caller can show its
 * working. Every failure is mirrored onto the EngineResult as a warning: a
 * caller that reads only `warnings` still cannot miss a break, and a caller
 * that reads only `data` still gets `passed === false`.
 */
export function reconcile(input: ReconcileInput): EngineResult<ReconciliationReport> {
  const { asOf, ledger, statements, valuation, priceAsOfByInstrument } = input;
  const checks: ReconciliationCheck[] = [];
  const warnings: EngineWarning[] = [];

  /** Record a check and, when it failed, raise the matching warning. */
  function record(check: ReconciliationCheck, code = CODE_BY_KIND[check.kind]): void {
    checks.push(check);
    if (check.passed) return;
    const make = check.severity === "BLOCKING" ? blocking : check.severity === "WARN" ? warn : info;
    warnings.push(make(code, check.message, check.subjectId));
  }

  // Open units per position, computed once and reused by every check.
  const unitsByPosition = new Map<PositionId, number>();
  for (const p of ledger.positions) {
    unitsByPosition.set(p.positionId, openUnits(ledger.lots, p.positionId));
  }
  const heldUnits = (positionId: PositionId): number => unitsByPosition.get(positionId) ?? 0;

  // -------------------------------------------------------------------------
  // One statement row per position. A later statement supersedes an earlier one
  // rather than producing two contradictory checks for the same holding.
  // -------------------------------------------------------------------------
  const statementByPosition = new Map<PositionId, StatementBalance>();
  for (const s of statements) {
    const positionId = positionIdFor(s.accountId, s.instrumentId, s.folioNumber);
    const previous = statementByPosition.get(positionId);
    if (!previous) {
      statementByPosition.set(positionId, s);
    } else {
      const keep = s.asOf >= previous.asOf ? s : previous;
      const dropped = keep === s ? previous : s;
      statementByPosition.set(positionId, keep);
      warnings.push(
        info(
          "RECON_STATEMENT_SUPERSEDED",
          `Two statement balances cover this position. The one as of ${keep.asOf} was used and the one as of ${dropped.asOf} was ignored.`,
          positionId,
        ),
      );
    }
    if (s.asOf > asOf) {
      warnings.push(
        warn(
          "RECON_STATEMENT_AFTER_ASOF",
          `Statement balance is dated ${s.asOf}, after the ${asOf} report date, so it may include transactions the ledger has not been given.`,
          positionId,
        ),
      );
    }
  }

  const valuationByPosition = new Map<PositionId, number>();
  if (valuation) {
    for (const pv of valuation.positions) valuationByPosition.set(pv.positionId, pv.value);
  }

  // -------------------------------------------------------------------------
  // 1. UNITS and 2. VALUE
  // -------------------------------------------------------------------------
  for (const [positionId, statement] of statementByPosition) {
    const derivedUnits = heldUnits(positionId);
    const known = unitsByPosition.has(positionId);
    const unitsOk = unitsMatch(derivedUnits, statement.closingUnits);
    const asOfNote = statement.asOf === asOf ? "" : ` (statement as of ${statement.asOf})`;

    record({
      checkId: `UNITS:${positionId}`,
      kind: "UNITS",
      subjectId: positionId,
      passed: unitsOk,
      expected: roundUnits(statement.closingUnits),
      actual: roundUnits(derivedUnits),
      difference: roundUnits(derivedUnits - statement.closingUnits),
      severity: "BLOCKING",
      message: unitsOk
        ? `Units agree with the statement at ${roundUnits(statement.closingUnits)}${asOfNote}.`
        : known
          ? `Ledger holds ${roundUnits(derivedUnits)} units but the statement closes at ` +
            `${roundUnits(statement.closingUnits)}${asOfNote}, a difference of ` +
            `${roundUnits(derivedUnits - statement.closingUnits)} units against a tolerance of ${UNITS_TOLERANCE}. ` +
            `Transactions are missing, duplicated or misdated.`
          : `The ledger holds no lots for this position, so the statement's ` +
            `${roundUnits(statement.closingUnits)} units${asOfNote} are entirely unaccounted for. ` +
            `Transaction history for this folio was never ingested.`,
    });

    if (!valuation) continue;

    const computed = valuationByPosition.get(positionId);
    if (computed == null) {
      record(
        {
          checkId: `VALUE:${positionId}`,
          kind: "VALUE",
          subjectId: positionId,
          passed: false,
          expected: statement.closingValue == null ? undefined : roundAmount(statement.closingValue),
          severity: "INFO",
          message: `Position was not valued in the ${valuation.asOf} snapshot, so its value could not be reconciled.`,
        },
        "RECON_NOT_VALUED",
      );
      continue;
    }
    if (statement.closingValue == null) {
      record(
        {
          checkId: `VALUE:${positionId}`,
          kind: "VALUE",
          subjectId: positionId,
          passed: false,
          actual: roundAmount(computed),
          severity: "INFO",
          message: `Statement printed units but no closing value${asOfNote}, so the computed value of ` +
            `${roundAmount(computed)} could not be cross-checked.`,
        },
        "RECON_NO_STATEMENT_VALUE",
      );
      continue;
    }

    const valueOk = valueMatch(computed, statement.closingValue);
    const drift = relativeDiff(computed, statement.closingValue);
    record({
      checkId: `VALUE:${positionId}`,
      kind: "VALUE",
      subjectId: positionId,
      passed: valueOk,
      expected: roundAmount(statement.closingValue),
      actual: roundAmount(computed),
      difference: roundAmount(computed - statement.closingValue),
      severity: "WARN",
      message: valueOk
        ? `Value agrees with the statement within ${pct(VALUE_TOLERANCE_PCT)} (drift ${pct(drift)})${asOfNote}.`
        : `Computed value ${roundAmount(computed)} differs from the statement's ${roundAmount(statement.closingValue)}` +
          `${asOfNote} by ${pct(drift)}, outside the ${pct(VALUE_TOLERANCE_PCT)} tolerance. ` +
          (unitsOk
            ? `Units agree, so the price or the price date is the likely cause.`
            : `Units disagree too, so the holding itself is wrong and not just the price.`),
    });
  }

  // -------------------------------------------------------------------------
  // Coverage: a held position no statement mentions. Not a failure. Property,
  // physical gold and unlisted shares have no custodian statement by nature, so
  // treating this as a break would train users to ignore real breaks.
  // -------------------------------------------------------------------------
  const positionsWithoutStatement: PositionId[] = [];
  for (const p of ledger.positions) {
    if (statementByPosition.has(p.positionId)) continue;
    if (heldUnits(p.positionId) <= UNITS_TOLERANCE) continue; // fully exited, nothing to reconcile
    positionsWithoutStatement.push(p.positionId);
    record({
      checkId: `COVERAGE:${p.positionId}`,
      kind: "COVERAGE",
      subjectId: p.positionId,
      passed: false,
      actual: roundUnits(heldUnits(p.positionId)),
      severity: "INFO",
      message: `No statement balance covers this position, so its ${roundUnits(heldUnits(p.positionId))} units ` +
        `are unverified. That is expected for manually entered assets such as property or physical gold, ` +
        `and is a gap in statement coverage for anything else.`,
    });
  }

  // -------------------------------------------------------------------------
  // 3. ORPHANS: a sell with no matching lot. Always blocking: without the
  // buy, the cost basis of that disposal is unknowable, so gains and tax built
  // on it would be invented rather than computed.
  // -------------------------------------------------------------------------
  for (const orphan of ledger.orphans) {
    record({
      checkId: `ORPHANS:${orphan.transactionId}:${orphan.positionId}`,
      kind: "ORPHANS",
      subjectId: orphan.positionId,
      passed: false,
      expected: 0,
      actual: roundUnits(orphan.unmatchedUnits),
      difference: roundUnits(orphan.unmatchedUnits),
      severity: "BLOCKING",
      message: `Sale ${orphan.transactionId} on ${orphan.tradeDate} disposed ` +
        `${roundUnits(orphan.unmatchedUnits)} units that no purchase lot accounts for. ` +
        `Cost basis is unknowable until the missing history is ingested.`,
    });
  }

  // -------------------------------------------------------------------------
  // 4. DUPLICATES: the §6.3 double-count. The depository CAS republishes the
  // RTA's SOA folios next to true demat holdings, so the same scheme can appear
  // twice with the same unit count under two accounts and two holding modes.
  // WARN, not blocking: the pairing is a strong hint, not proof, and a genuine
  // second holding of identical size is possible.
  // -------------------------------------------------------------------------
  const heldPositions = ledger.positions.filter((p) => heldUnits(p.positionId) > UNITS_TOLERANCE);
  const byInstrument = new Map<InstrumentId, typeof heldPositions>();
  for (const p of heldPositions) {
    const bucket = byInstrument.get(p.instrumentId);
    if (bucket) bucket.push(p);
    else byInstrument.set(p.instrumentId, [p]);
  }
  for (const [instrumentId, group] of byInstrument) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.accountId === b.accountId) continue;
        if (a.holdingMode === b.holdingMode) continue;
        const modes = [a.holdingMode, b.holdingMode];
        if (!modes.includes("SOA") || !modes.includes("DEMAT")) continue;
        const ua = heldUnits(a.positionId);
        const ub = heldUnits(b.positionId);
        if (!unitsMateriallyEqual(ua, ub)) continue;
        const [first, second] = a.positionId <= b.positionId ? [a, b] : [b, a];
        record({
          checkId: `DUPLICATES:${first.positionId}|${second.positionId}`,
          kind: "DUPLICATES",
          subjectId: first.positionId,
          passed: false,
          expected: roundUnits(heldUnits(first.positionId)),
          actual: roundUnits(heldUnits(second.positionId)),
          difference: roundUnits(heldUnits(second.positionId) - heldUnits(first.positionId)),
          severity: "WARN",
          message: `Instrument ${instrumentId} appears twice with matching units: ` +
            `${roundUnits(ua)} in ${a.accountId} (${a.holdingMode}) and ${roundUnits(ub)} in ` +
            `${b.accountId} (${b.holdingMode}). A depository statement republishes RTA folios (§6.3), ` +
            `so this is probably one holding counted twice and the portfolio total is doubled for it.`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. STALE_PRICE: only for instruments we actually hold. A stale mark on
  // something we do not own cannot make a number wrong.
  // -------------------------------------------------------------------------
  const priceDateByInstrument = new Map<InstrumentId, DateISO>();
  if (valuation) {
    for (const pv of valuation.positions) {
      const current = priceDateByInstrument.get(pv.instrumentId);
      // Oldest mark wins: if one snapshot row is stale, the instrument is stale.
      if (!current || pv.priceAsOf < current) priceDateByInstrument.set(pv.instrumentId, pv.priceAsOf);
    }
  }
  for (const [instrumentId, priceAsOf] of Object.entries(priceAsOfByInstrument ?? {})) {
    priceDateByInstrument.set(instrumentId, priceAsOf);
  }

  const heldInstruments = new Set<InstrumentId>(heldPositions.map((p) => p.instrumentId));
  if (valuation) for (const pv of valuation.positions) heldInstruments.add(pv.instrumentId);

  for (const [instrumentId, priceAsOf] of priceDateByInstrument) {
    if (!heldInstruments.has(instrumentId)) continue;
    const age = tradingDaysBetween(priceAsOf, asOf);
    const stale = age > STALE_PRICE_MAX_TRADING_DAYS;
    record({
      checkId: `STALE_PRICE:${instrumentId}`,
      kind: "STALE_PRICE",
      subjectId: instrumentId,
      passed: !stale,
      expected: STALE_PRICE_MAX_TRADING_DAYS,
      actual: age,
      difference: age - STALE_PRICE_MAX_TRADING_DAYS,
      severity: "WARN",
      message: stale
        ? `Price for ${instrumentId} is dated ${priceAsOf}, ${age} trading days before ${asOf}. ` +
          `Any value derived from it is a stale mark, not today's worth.`
        : `Price for ${instrumentId} is dated ${priceAsOf}, within ${STALE_PRICE_MAX_TRADING_DAYS} trading days of ${asOf}.`,
    });
  }

  // -------------------------------------------------------------------------
  // Roll up. Only FAILING checks contribute to the counts and to `passed`.
  // -------------------------------------------------------------------------
  const failed = checks.filter((c) => !c.passed);
  const blockingCount = failed.filter((c) => c.severity === "BLOCKING").length;
  const warnCount = failed.filter((c) => c.severity === "WARN").length;

  const report: ReconciliationReport = {
    passed: blockingCount === 0,
    checks,
    blockingCount,
    warnCount,
    positionsChecked: statementByPosition.size,
    positionsWithoutStatement,
  };

  return ok(report, {
    asOf,
    confidence: blockingCount > 0 ? "LOW" : warnCount > 0 || warnings.some((w) => w.severity === "WARN") ? "MEDIUM" : "HIGH",
    dataSources: [{ kind: "DERIVED", label: "Reconciliation of lot ledger against statement balances", asOf }],
    assumptions: {
      unitsTolerance: UNITS_TOLERANCE,
      valueTolerancePct: VALUE_TOLERANCE_PCT,
      stalePriceMaxTradingDays: STALE_PRICE_MAX_TRADING_DAYS,
      duplicateUnitsTolerancePct: DUPLICATE_UNITS_TOLERANCE_PCT,
      exchangeHolidaysModelled: false,
      valuationSupplied: valuation != null,
    },
    warnings,
  });
}
