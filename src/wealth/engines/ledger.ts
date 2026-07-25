/**
 * Lot ledger — replays normalised transactions into positions and open lots.
 *
 * This is the system of record for "what do I own and what did it cost". It is
 * a pure function of (transactions, instruments, accounts): same input, same
 * output, no hidden state (spec §10).
 *
 * Corporate-action semantics implemented here are the §6 correctness traps:
 *   - BONUS   → new lot, zero cost, FRESH holding period            (§6.6)
 *   - SPLIT   → existing lots mutate in place: units × ratio,
 *               cost/unit ÷ ratio, holding period UNCHANGED         (§6.7)
 *   - MERGER  → lots move to the new instrument; cost basis AND
 *               holding period both carry over                      (§6.4)
 *   - SEGREGATION → side pocket becomes a SEPARATE position with the
 *               original holding period; not a loss until realised  (§6.5)
 *   - SWITCH  → redemption + fresh purchase, both real events       (§6.8)
 *   - ELSS lock-in is stamped per LOT, because it runs per SIP
 *     instalment rather than per folio                              (§6.9)
 *
 * Sells consume lots FIFO by acquisition date. A sell with no matching lot is
 * recorded as an orphan and surfaced — never silently dropped (spec §2.3).
 */

import type {
  Account, AccountId, AcquisitionKind, DateISO, Instrument, InstrumentId, Lot, LotId,
  Position, PositionId, Transaction, TransactionId, TransactionType,
} from "../domain/types.ts";
import { addMonths } from "../domain/dates.ts";
import { UNITS_TOLERANCE } from "../domain/money.ts";
import { blocking, warn, type EngineWarning } from "../domain/result.ts";

/** A realised reduction of a lot. Phase 1 records the linkage and the dates the
 *  Phase 3 tax engine will need; it deliberately computes no tax. */
export interface Disposal {
  disposalId: string;
  transactionId: TransactionId;
  positionId: PositionId;
  instrumentId: InstrumentId;
  lotId: LotId;
  disposedOn: DateISO;
  units: number;
  costPerUnit: number;
  proceedsPerUnit: number;
  /** Preserved from the consumed lot so holding period stays computable. */
  acquiredOn: DateISO;
  acquisitionKind: AcquisitionKind;
  reason: TransactionType;
}

/** A sell we could not match to open units. Flagged, never dropped (spec §2.3). */
export interface OrphanSell {
  transactionId: TransactionId;
  instrumentId: InstrumentId;
  positionId: PositionId;
  tradeDate: DateISO;
  unmatchedUnits: number;
}

export interface LedgerState {
  positions: Position[];
  lots: Lot[];
  disposals: Disposal[];
  orphans: OrphanSell[];
  warnings: EngineWarning[];
}

/** Position identity. Regular vs Direct and Growth vs IDCW are different
 *  instrumentIds, so they can never collapse into one position (§6.1, §6.2). */
export function positionKey(accountId: AccountId, instrumentId: InstrumentId, folioNumber?: string): string {
  return `${accountId}::${instrumentId}::${folioNumber ?? ""}`;
}

export function positionIdFor(accountId: AccountId, instrumentId: InstrumentId, folioNumber?: string): PositionId {
  return `pos:${positionKey(accountId, instrumentId, folioNumber)}`;
}

/**
 * Same-date ordering. Corporate actions must land before trades on the same
 * day, otherwise a sell would consume pre-split units at post-split prices.
 */
const TYPE_PRIORITY: Record<TransactionType, number> = {
  SPLIT: 0, MERGER_OUT: 0,
  BONUS: 1, MERGER_IN: 1, SEGREGATION: 1,
  BUY: 2, SWITCH_IN: 2, TRANSFER_IN: 2, RIGHTS: 2, IDCW_REINVEST: 2, CONTRIBUTION: 2,
  SELL: 3, SWITCH_OUT: 3, TRANSFER_OUT: 3,
  MATURITY: 4,
  IDCW_PAYOUT: 5, INTEREST_CREDIT: 5,
};

const ADDS_UNITS: Partial<Record<TransactionType, AcquisitionKind>> = {
  BUY: "PURCHASE",
  SWITCH_IN: "PURCHASE",
  TRANSFER_IN: "TRANSFER_IN",
  RIGHTS: "RIGHTS",
  IDCW_REINVEST: "REINVEST",
  CONTRIBUTION: "PURCHASE",
};

const REMOVES_UNITS: TransactionType[] = ["SELL", "SWITCH_OUT", "TRANSFER_OUT", "MATURITY"];

function sortTransactions(txns: Transaction[]): Transaction[] {
  return txns
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      if (a.t.tradeDate !== b.t.tradeDate) return a.t.tradeDate < b.t.tradeDate ? -1 : 1;
      const pa = TYPE_PRIORITY[a.t.type] ?? 9;
      const pb = TYPE_PRIORITY[b.t.type] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.i - b.i; // stable
    })
    .map((x) => x.t);
}

/** Units implied by a transaction, tolerating statements that give only amount. */
function unitsOf(t: Transaction): number {
  if (t.units != null) return t.units;
  if (t.amount != null && t.pricePerUnit) return t.amount / t.pricePerUnit;
  if (t.amount != null) return t.amount; // accrual instruments priced at 1.00
  return 0;
}

function priceOf(t: Transaction): number {
  if (t.pricePerUnit != null) return t.pricePerUnit;
  const u = unitsOf(t);
  if (t.amount != null && u) return t.amount / u;
  return 0;
}

export function buildLedger(input: {
  transactions: Transaction[];
  instruments: Record<InstrumentId, Instrument>;
  accounts: Record<AccountId, Account>;
}): LedgerState {
  const { instruments, accounts } = input;
  const positions = new Map<string, Position>();
  const lotsByPosition = new Map<PositionId, Lot[]>();
  const disposals: Disposal[] = [];
  const orphans: OrphanSell[] = [];
  const warnings: EngineWarning[] = [];
  /** linkIds already consumed by a MERGER_OUT, so the paired MERGER_IN is a no-op. */
  const mergersHandled = new Set<string>();
  let lotSeq = 0;
  let disposalSeq = 0;

  function getPosition(t: { accountId: AccountId; instrumentId: InstrumentId; folioNumber?: string }): Position {
    const key = positionKey(t.accountId, t.instrumentId, t.folioNumber);
    let pos = positions.get(key);
    if (!pos) {
      pos = {
        positionId: positionIdFor(t.accountId, t.instrumentId, t.folioNumber),
        accountId: t.accountId,
        instrumentId: t.instrumentId,
        folioNumber: t.folioNumber,
        holdingMode: accounts[t.accountId]?.holdingMode ?? "SOA",
        status: "OPEN",
      };
      positions.set(key, pos);
      lotsByPosition.set(pos.positionId, []);
    }
    return pos;
  }

  function openLots(positionId: PositionId): Lot[] {
    return (lotsByPosition.get(positionId) ?? []).filter((l) => !l.closed && l.units > UNITS_TOLERANCE);
  }

  function createLot(args: {
    position: Position;
    acquiredOn: DateISO;
    units: number;
    costPerUnit: number;
    kind: AcquisitionKind;
    transactionId?: TransactionId;
    instrument?: Instrument;
  }): Lot {
    const inst = args.instrument ?? instruments[args.position.instrumentId];
    const lot: Lot = {
      lotId: `lot:${++lotSeq}`,
      positionId: args.position.positionId,
      instrumentId: args.position.instrumentId,
      acquiredOn: args.acquiredOn,
      units: args.units,
      originalUnits: args.units,
      costPerUnit: args.costPerUnit,
      acquisitionKind: args.kind,
      sourceTransactionId: args.transactionId,
      // Per-instalment lock-in: ELSS runs 36 months from THIS lot's date (§6.9).
      lockInEndDate: inst?.lockInMonths ? addMonths(args.acquiredOn, inst.lockInMonths) : inst?.lockInEndDate,
      closed: false,
    };
    const arr = lotsByPosition.get(args.position.positionId);
    if (arr) arr.push(lot);
    return lot;
  }

  /** FIFO by acquisition date, then by creation order. */
  function consume(position: Position, txn: Transaction, unitsWanted: number, proceedsPerUnit: number): void {
    let remaining = unitsWanted;
    const available = openLots(position.positionId).sort((a, b) =>
      a.acquiredOn === b.acquiredOn ? a.lotId.localeCompare(b.lotId, "en") : a.acquiredOn < b.acquiredOn ? -1 : 1,
    );

    for (const lot of available) {
      if (remaining <= UNITS_TOLERANCE) break;
      const take = Math.min(lot.units, remaining);
      lot.units -= take;
      if (lot.units <= UNITS_TOLERANCE) {
        lot.units = 0;
        lot.closed = true;
      }
      remaining -= take;
      disposals.push({
        disposalId: `disp:${++disposalSeq}`,
        transactionId: txn.transactionId,
        positionId: position.positionId,
        instrumentId: position.instrumentId,
        lotId: lot.lotId,
        disposedOn: txn.tradeDate,
        units: take,
        costPerUnit: lot.costPerUnit,
        proceedsPerUnit,
        acquiredOn: lot.acquiredOn,
        acquisitionKind: lot.acquisitionKind,
        reason: txn.type,
      });
    }

    if (remaining > UNITS_TOLERANCE) {
      orphans.push({
        transactionId: txn.transactionId,
        instrumentId: position.instrumentId,
        positionId: position.positionId,
        tradeDate: txn.tradeDate,
        unmatchedUnits: remaining,
      });
      warnings.push(
        blocking(
          "ORPHAN_SELL",
          `Sale of ${remaining.toFixed(4)} units on ${txn.tradeDate} has no matching purchase lot. ` +
            `Cost basis for this disposal is unknown; earlier history is probably missing.`,
          position.positionId,
        ),
      );
    }

    if (openLots(position.positionId).length === 0) position.status = "CLOSED";
  }

  for (const txn of sortTransactions(input.transactions)) {
    const instrument = instruments[txn.instrumentId];
    if (!instrument) {
      warnings.push(warn("UNKNOWN_INSTRUMENT", `No instrument master row for ${txn.instrumentId}.`, txn.transactionId));
      continue;
    }
    const position = getPosition(txn);
    position.status = "OPEN";

    const addKind = ADDS_UNITS[txn.type];
    if (addKind) {
      const units = unitsOf(txn);
      if (units > 0) createLot({ position, acquiredOn: txn.tradeDate, units, costPerUnit: priceOf(txn), kind: addKind, transactionId: txn.transactionId, instrument });
      continue;
    }

    if (REMOVES_UNITS.includes(txn.type)) {
      const units = txn.type === "MATURITY" && txn.units == null
        ? openLots(position.positionId).reduce((s, l) => s + l.units, 0)
        : unitsOf(txn);
      if (units > 0) consume(position, txn, units, priceOf(txn));
      continue;
    }

    switch (txn.type) {
      case "BONUS": {
        // Zero cost, fresh holding period (§6.6).
        const units = unitsOf(txn);
        if (units > 0) createLot({ position, acquiredOn: txn.tradeDate, units, costPerUnit: 0, kind: "BONUS", transactionId: txn.transactionId, instrument });
        break;
      }

      case "SPLIT": {
        // Units up, cost/unit down, holding period untouched (§6.7).
        const ratio = txn.ratio ?? 0;
        if (ratio <= 0) {
          warnings.push(warn("SPLIT_NO_RATIO", `Split on ${txn.tradeDate} has no usable ratio; ignored.`, txn.transactionId));
          break;
        }
        for (const lot of openLots(position.positionId)) {
          lot.units *= ratio;
          lot.originalUnits *= ratio;
          lot.costPerUnit /= ratio;
        }
        break;
      }

      case "MERGER_OUT": {
        // Cost basis and holding period both carry to the new scheme (§6.4).
        const target = txn.relatedInstrumentId;
        const ratio = txn.ratio ?? 1;
        if (!target) {
          warnings.push(warn("MERGER_NO_TARGET", `Merger on ${txn.tradeDate} has no target instrument; ignored.`, txn.transactionId));
          break;
        }
        const newPosition = getPosition({ accountId: txn.accountId, instrumentId: target, folioNumber: txn.folioNumber });
        for (const lot of openLots(position.positionId)) {
          const carriedUnits = lot.units * ratio;
          const totalCost = lot.units * lot.costPerUnit;
          createLot({
            position: newPosition,
            acquiredOn: lot.acquiredOn, // holding period carries over
            units: carriedUnits,
            costPerUnit: carriedUnits > 0 ? totalCost / carriedUnits : 0, // total cost preserved
            kind: "MERGER_CARRIED",
            transactionId: txn.transactionId,
            instrument: instruments[target],
          });
          lot.units = 0;
          lot.closed = true;
        }
        position.status = "CLOSED";
        if (txn.linkId) mergersHandled.add(txn.linkId);
        break;
      }

      case "MERGER_IN": {
        // Only act if the paired MERGER_OUT was absent from the statement.
        if (txn.linkId && mergersHandled.has(txn.linkId)) break;
        const units = unitsOf(txn);
        if (units > 0) {
          createLot({ position, acquiredOn: txn.tradeDate, units, costPerUnit: priceOf(txn), kind: "MERGER_CARRIED", transactionId: txn.transactionId, instrument });
          warnings.push(
            warn(
              "MERGER_IN_WITHOUT_OUT",
              `Merger into ${instrument.name} recorded without the outgoing leg; original holding period could not be carried over.`,
              position.positionId,
            ),
          );
        }
        break;
      }

      case "SEGREGATION": {
        // Side pocket becomes its own position. Holding period carries over and
        // the carve-out is NOT a realised loss (§6.5).
        const target = txn.relatedInstrumentId;
        if (!target) {
          warnings.push(warn("SEGREGATION_NO_TARGET", `Side pocket on ${txn.tradeDate} has no segregated instrument; ignored.`, txn.transactionId));
          break;
        }
        const costFraction = txn.ratio ?? 0;
        const sidePocket = getPosition({ accountId: txn.accountId, instrumentId: target, folioNumber: txn.folioNumber });
        sidePocket.segregatedFromPositionId = position.positionId;
        for (const lot of openLots(position.positionId)) {
          const movedCost = lot.units * lot.costPerUnit * costFraction;
          createLot({
            position: sidePocket,
            acquiredOn: lot.acquiredOn,
            units: lot.units, // unit-for-unit carve-out
            costPerUnit: lot.units > 0 ? movedCost / lot.units : 0,
            kind: "SEGREGATED",
            transactionId: txn.transactionId,
            instrument: instruments[target],
          });
          lot.costPerUnit *= 1 - costFraction; // remaining basis stays in the main scheme
        }
        break;
      }

      case "IDCW_PAYOUT":
      case "INTEREST_CREDIT":
        // No unit impact. Interest on EPF/PPF/FD is realised through the
        // valuation engine's accrual method, not as a zero-cost lot, so that
        // invested cost stays equal to what the user actually contributed.
        break;

      default:
        warnings.push(warn("UNHANDLED_TXN_TYPE", `Transaction type ${txn.type} is not handled by the ledger.`, txn.transactionId));
    }
  }

  const allLots: Lot[] = [];
  for (const arr of lotsByPosition.values()) allLots.push(...arr);

  return { positions: [...positions.values()], lots: allLots, disposals, orphans, warnings };
}

/** Open units for a position, full precision. */
export function openUnits(lots: Lot[], positionId: PositionId): number {
  let total = 0;
  for (const l of lots) if (l.positionId === positionId && !l.closed) total += l.units;
  return total;
}

/** Remaining invested cost for a position, full precision. */
export function openCost(lots: Lot[], positionId: PositionId): number {
  let total = 0;
  for (const l of lots) if (l.positionId === positionId && !l.closed) total += l.units * l.costPerUnit;
  return total;
}
