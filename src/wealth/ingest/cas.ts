/**
 * CAS ingestion (spec §2.1, §2.2).
 *
 * The pipeline is explicitly staged and every stage is persisted, because a
 * number we cannot trace back to the line of the statement it came from is a
 * number we cannot defend (spec §0):
 *
 *   RawArtifact -> ParsedRow[] -> Transaction[] + StatementBalance[]
 *                -> (reconciliation, elsewhere) -> Positions/Lots (ledger)
 *
 * Two India-specific traps dominate this file:
 *   §6.3  The SAME mutual fund units appear in BOTH the CAMS/KFintech eCAS and
 *         the NSDL/CDSL CAS, because the depository statement republishes the
 *         RTA's SOA folios alongside true demat holdings. Ingesting both without
 *         dedupe doubles a portfolio.
 *   §6.8  A switch is a redemption AND a purchase. Both legs are real events and
 *         both must survive ingestion, linked, so the ledger can realise the
 *         first and start a fresh holding period for the second.
 *
 * Everything here is a pure function of its arguments. No I/O, no clock inside
 * the logic (the statement period supplies `asOf`), no globals.
 */

import type {
  Account, AccountId, AccountKind, DateISO, HoldingMode, Instrument, InstrumentId,
  HouseholdId, MemberId, OptionKind, PlanKind, StatementBalance, TimestampISO, Transaction, TransactionType,
} from "../domain/types.ts";
import { isValidDate, todayISO } from "../domain/dates.ts";
import { AMOUNT_DP, UNIT_DP, roundAmount, roundUnits, unitsMatch } from "../domain/money.ts";
import {
  blocking, info, ok, warn, weakest,
  type Confidence, type DataSourceKind, type DataSourceRef, type EngineResult, type EngineWarning,
} from "../domain/result.ts";

// ---------------------------------------------------------------------------
// Stage 1: the raw artifact
// ---------------------------------------------------------------------------

/**
 * A CAS as received, AFTER an upstream adapter has decrypted it and extracted
 * rows.
 *
 * PDF decryption and text extraction deliberately live outside this module.
 * The CAS password is a credential: the adapter holds it in memory for the
 * length of one parse and discards it. It is not a field on this type, it is
 * not persisted with the artifact, and it must never be logged (spec §7). The
 * artifact stores masked identifiers only.
 */
export interface RawArtifact {
  artifactId: string;
  sourceKind: DataSourceKind;
  /** Human label for provenance, e.g. "CAMS eCAS Apr-Jun 2024". */
  label?: string;
  receivedAt: TimestampISO;
  /** A CAS always covers a period; closing balances are as of `to`. */
  statementPeriod: { from: DateISO; to: DateISO };
  householdId: HouseholdId;
  /** A CAS is fetched per PAN, so one artifact belongs to exactly one member. */
  memberId: MemberId;
  /** Masked only. The raw PAN never reaches storage (spec §7). */
  panMasked?: string;
  rows: ParsedRow[];
}

/**
 * Stage 2: one line of the statement, still in source shape.
 *
 * Kept flat and untyped-by-domain on purpose. Whatever the parser saw is what
 * gets persisted, so a misclassification later can be re-derived rather than
 * re-fetched.
 */
export interface ParsedRow {
  /** Source line identity; defaults to `${artifactId}#${index}` for provenance. */
  rowId?: string;
  folio: string;
  schemeName: string;
  isin?: string;
  amfiCode?: string;
  date: DateISO;
  description: string;
  amount?: number;
  units?: number;
  nav?: number;
  /** Running balance printed against the row. */
  unitBalance?: number;
  /** Block-level closing balance, printed at the foot of a scheme section. */
  closingBalanceUnits?: number;
  closingValue?: number;
  /** Overrides the statement period end for the closing balance's `asOf`. */
  closingAsOf?: DateISO;
  /** Charges, when the parser found them as columns rather than in the text. */
  stt?: number;
  stampDuty?: number;
  exitLoad?: number;
  tds?: number;
  /**
   * New units per old unit for a split. A statement's "1:10" is directionally
   * ambiguous, so we never infer it (§6.7); the adapter supplies it or the
   * split stays unapplied and flagged.
   */
  ratio?: number;
  /** AMC or RTA name, used as the account provider when present. */
  amc?: string;
  /** Set by the parser when a depository CAS row is really an SOA folio (§6.3). */
  holdingMode?: HoldingMode;
}

// ---------------------------------------------------------------------------
// Stage 3 outputs
// ---------------------------------------------------------------------------

/**
 * The statement's own closing figure, kept verbatim so the reconciliation
 * engine can compare it against the units the ledger derives from transactions
 * (spec §2.3). We never adjust one to match the other here.
 */
/** Re-exported from the shared contract so ingestion and reconciliation cannot drift. */
export type { StatementBalance } from "../domain/types.ts";

export interface NormalisedIngest {
  transactions: Transaction[];
  accounts: Account[];
  statements: StatementBalance[];
  /** Rows we refused to guess at. Persisted, never discarded (spec §2.3). */
  unmapped: ParsedRow[];
}

// ---------------------------------------------------------------------------
// Instrument registry
// ---------------------------------------------------------------------------

export type InstrumentMatchBasis = "ISIN" | "AMFI_CODE" | "NAME" | "NAME_PLAN_OPTION";

export interface InstrumentMatch {
  instrument: Instrument;
  basis: InstrumentMatchBasis;
}

/** Pure lookup from a source row to the instrument master. */
export interface CasRowResolver {
  resolve(row: ParsedRow): InstrumentMatch | undefined;
}

const PLAN_TOKENS = /\b(direct|regular)\b/;
const OPTION_TOKENS = /\b(growth|idcw|dividend|payout|reinvest|reinvestment)\b/;
const QUALIFIER_TOKENS = new Set([
  "direct", "regular", "plan", "option", "growth", "idcw", "dividend", "div",
  "payout", "reinvest", "reinvestment", "gr", "g",
]);

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Scheme name minus the plan/option qualifiers, so the two can be matched separately. */
function baseName(normalised: string): string {
  return normalised.split(" ").filter((t) => !QUALIFIER_TOKENS.has(t)).join(" ");
}

function inferPlan(normalised: string): PlanKind {
  const m = PLAN_TOKENS.exec(normalised);
  if (!m) return "NA";
  return m[1] === "direct" ? "DIRECT" : "REGULAR";
}

function inferOption(normalised: string): OptionKind {
  if (!OPTION_TOKENS.test(normalised)) return "NA";
  if (/\breinvest/.test(normalised)) return "IDCW_REINVEST";
  if (/\b(idcw|dividend|div)\b/.test(normalised)) return "IDCW_PAYOUT";
  if (/\bgrowth\b/.test(normalised)) return "GROWTH";
  return "NA";
}

/**
 * Name-and-code index over the instrument master.
 *
 * Resolution is deliberately strict about plan and option: Regular and Direct
 * are different ISINs (§6.1) and Growth and IDCW are different ISINs (§6.2), so
 * an ambiguous name resolves to NOTHING rather than to a plausible guess. The
 * one convention we do apply is that a scheme name with no plan token means the
 * Regular plan, which is how statements printed for distributor-sold folios
 * read; that match is reported as name-based so callers can degrade confidence.
 */
export function createCasRowResolver(instruments: Instrument[]): CasRowResolver {
  const byIsin = new Map<string, Instrument>();
  const byAmfi = new Map<string, Instrument>();
  const byName = new Map<string, Instrument[]>();
  const byBase = new Map<string, Instrument[]>();

  const push = (map: Map<string, Instrument[]>, key: string, inst: Instrument) => {
    const arr = map.get(key);
    if (arr) arr.push(inst);
    else map.set(key, [inst]);
  };

  for (const inst of instruments) {
    if (inst.isin) byIsin.set(inst.isin.trim().toUpperCase(), inst);
    if (inst.amfiCode) byAmfi.set(inst.amfiCode.trim(), inst);
    const n = normName(inst.name);
    push(byName, n, inst);
    push(byBase, baseName(n), inst);
  }

  return {
    resolve(row: ParsedRow): InstrumentMatch | undefined {
      if (row.isin) {
        const hit = byIsin.get(row.isin.trim().toUpperCase());
        if (hit) return { instrument: hit, basis: "ISIN" };
      }
      if (row.amfiCode) {
        const hit = byAmfi.get(String(row.amfiCode).trim());
        if (hit) return { instrument: hit, basis: "AMFI_CODE" };
      }
      if (!row.schemeName) return undefined;

      const n = normName(row.schemeName);
      const exact = byName.get(n);
      if (exact && exact.length === 1) return { instrument: exact[0], basis: "NAME" };

      let pool = byBase.get(baseName(n)) ?? [];
      if (pool.length === 0) return undefined;

      const plan = inferPlan(n);
      if (plan !== "NA") {
        pool = pool.filter((c) => c.plan === plan);
      } else if (pool.length > 1) {
        const regular = pool.filter((c) => c.plan === "REGULAR");
        if (regular.length > 0) pool = regular;
      }

      const option = inferOption(n);
      if (option !== "NA") pool = pool.filter((c) => c.option === option);

      return pool.length === 1 ? { instrument: pool[0], basis: "NAME_PLAN_OPTION" } : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Description -> TransactionType
// ---------------------------------------------------------------------------

/**
 * Classify a CAS narration.
 *
 * Order matters and is not alphabetical:
 *   - merger before switch, because "Switch Out - Merger" must carry cost basis
 *     and holding period over (§6.4) rather than realise a gain;
 *   - switch before purchase/redemption, because both legs are spelled with
 *     those words on some RTA statements;
 *   - redemption before purchase, because "Repurchase" is a redemption.
 *
 * A narration we cannot place returns undefined. It is never bucketed into the
 * nearest plausible type: a wrong type silently rewrites cost basis.
 */
export function classifyDescription(description: string): TransactionType | undefined {
  const d = normName(description);
  if (!d) return undefined;

  if (/segregat|side pocket/.test(d)) return "SEGREGATION";

  if (/merger|amalgamat/.test(d)) {
    if (/\bout\b|redemption|redeem|extinguish|cancel/.test(d)) return "MERGER_OUT";
    if (/\bin\b|allot|credit|receiv/.test(d)) return "MERGER_IN";
    return undefined; // direction unknown: guessing here destroys the holding period
  }

  if (/switch(\s*over)?\s*out|out\s*switch/.test(d)) return "SWITCH_OUT";
  if (/switch(\s*over)?\s*in\b|in\s*switch/.test(d)) return "SWITCH_IN";

  if (/\bbonus\b/.test(d)) return "BONUS";
  if (/\bsplit\b/.test(d)) return "SPLIT";

  if (/\bidcw\b|\bdividend\b/.test(d)) {
    if (/reinvest/.test(d)) return "IDCW_REINVEST";
    if (/payout|paid|payment/.test(d)) return "IDCW_PAYOUT";
    return undefined; // a bare "Dividend" could be either; reinvestment creates a lot
  }

  if (/redemption|redeem|repurchase|systematic withdrawal|\bswp\b/.test(d)) return "SELL";
  if (/\bpurchase\b|subscription|systematic investment|\bsip\b|\binvestment\b/.test(d)) return "BUY";

  if (/transfer\s*in\b/.test(d)) return "TRANSFER_IN";
  if (/transfer\s*out\b/.test(d)) return "TRANSFER_OUT";

  return undefined;
}

/** The gap is bounded so a label with no figure ("STT paid") cannot reach
 *  forward and capture an unrelated number later in the narration. */
const CHARGE_GAP = "[^0-9]{0,12}";
const CHARGE_AMOUNT = "([0-9,]+(?:\\.[0-9]+)?)";
const CHARGE_PATTERNS = {
  stt: new RegExp(`\\bstt\\b${CHARGE_GAP}${CHARGE_AMOUNT}`),
  stampDuty: new RegExp(`stamp\\s*duty${CHARGE_GAP}${CHARGE_AMOUNT}`),
  exitLoad: new RegExp(`exit\\s*load${CHARGE_GAP}${CHARGE_AMOUNT}`),
  tds: new RegExp(`\\btds\\b${CHARGE_GAP}${CHARGE_AMOUNT}`),
} as const;

/** Charges are printed inside the narration on most eCAS layouts, not as columns. */
function chargeFrom(description: string, pattern: RegExp): number | undefined {
  const m = pattern.exec(description.toLowerCase());
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Dedupe (§6.3)
// ---------------------------------------------------------------------------

/** Folios are printed with inconsistent spacing across RTAs; identity ignores it. */
function normaliseFolio(folio?: string): string {
  return (folio ?? "").toUpperCase().replace(/\s+/g, "");
}

function keyParts(
  t: Pick<Transaction, "instrumentId" | "folioNumber" | "tradeDate" | "type" | "units" | "amount">,
  isin?: string,
) {
  return {
    instrument: (isin ?? t.instrumentId ?? "").toUpperCase(),
    folio: normaliseFolio(t.folioNumber),
    date: t.tradeDate,
    type: t.type,
    units: t.units == null ? "" : roundUnits(Math.abs(t.units)).toFixed(UNIT_DP),
    amount: t.amount == null ? "" : roundAmount(Math.abs(t.amount)).toFixed(AMOUNT_DP),
  };
}

/**
 * Stable natural key for a transaction (§6.3).
 *
 * Deliberately excludes account, member and holding mode. The same folio can be
 * reported by two sources, and a joint folio is reported on BOTH holders' CAS
 * (§6.16); keying on the account would let either case through and double the
 * household's net worth. Units are compared at 4dp and amounts at 2dp, which is
 * the precision the statements themselves print (§6.20).
 */
export function dedupeKeyFor(
  t: Pick<Transaction, "instrumentId" | "folioNumber" | "tradeDate" | "type" | "units" | "amount">,
  isin?: string,
): string {
  const p = keyParts(t, isin);
  return [p.instrument, p.folio, p.date, p.type, p.units, p.amount].join("|");
}

/** Same instrument, date, type and size but a different folio: suspicious, not proven. */
function nearKeyFor(t: Transaction): string {
  const p = keyParts(t);
  return [p.instrument, p.date, p.type, p.units].join("|");
}

export interface DedupeOutcome {
  kept: Transaction[];
  dropped: Array<{ transaction: Transaction; duplicateOf: string }>;
}

/**
 * Drop exact cross-source duplicates, keeping the first occurrence.
 *
 * Only EXACT natural-key matches are dropped. Two rows that agree on instrument,
 * date, size and type but sit in different folios are left alone with a WARN:
 * buying the same amount of one fund in two folios on one day is unusual but
 * legal, and silently deleting one would understate a real holding. Deciding
 * that is a human's job, so we surface it rather than resolve it.
 */
export function dedupeTransactions(
  txns: Transaction[],
  opts: { asOf?: DateISO; computedAt?: TimestampISO; now?: Date } = {},
): EngineResult<DedupeOutcome> {
  const warnings: EngineWarning[] = [];
  const seen = new Map<string, Transaction>();
  const kept: Transaction[] = [];
  const dropped: DedupeOutcome["dropped"] = [];

  for (const t of txns) {
    const key = t.dedupeKey ?? dedupeKeyFor(t);
    const first = seen.get(key);
    if (first) {
      dropped.push({ transaction: t, duplicateOf: first.transactionId });
      const sameAccount = first.accountId === t.accountId;
      warnings.push(
        info(
          "DUPLICATE_DROPPED",
          `Dropped duplicate ${t.type} of ${t.units ?? "?"} units on ${t.tradeDate} in folio ` +
            `${t.folioNumber ?? "-"} from source ${t.sourceId ?? "unknown"}; already ingested as ` +
            `${first.transactionId} from source ${first.sourceId ?? "unknown"}` +
            (sameAccount ? "." : ` (reported under a different account, ${t.accountId}).`),
          t.transactionId,
        ),
      );
      continue;
    }
    seen.set(key, t);
    kept.push(t);
  }

  const byNear = new Map<string, Transaction[]>();
  for (const t of kept) {
    if (!t.units) continue; // a payout carries no units; nothing to compare
    const k = nearKeyFor(t);
    const arr = byNear.get(k);
    if (arr) arr.push(t);
    else byNear.set(k, [t]);
  }
  for (const group of byNear.values()) {
    const folios = [...new Set(group.map((t) => normaliseFolio(t.folioNumber)))];
    if (group.length > 1 && folios.length > 1) {
      warnings.push(
        warn(
          "NEAR_DUPLICATE_FOLIOS",
          `${group.length} ${group[0].type} rows of ${group[0].units} units of ${group[0].instrumentId} on ` +
            `${group[0].tradeDate} appear under different folios (${folios.join(", ")}). These are kept as ` +
            `separate holdings; confirm they are not the same units reported twice.`,
          group[0].transactionId,
        ),
      );
    }
  }

  const latestTrade = kept.reduce<DateISO | undefined>(
    (max, t) => (max == null || t.tradeDate > max ? t.tradeDate : max),
    undefined,
  );

  return ok(
    { kept, dropped },
    {
      asOf: opts.asOf ?? latestTrade ?? todayISO(opts.now),
      computedAt: opts.computedAt,
      confidence: dropped.length > 0 || warnings.length > 0 ? "MEDIUM" : "HIGH",
      assumptions: { dedupeKey: "instrument|folio|date|type|units@4dp|amount@2dp" },
      warnings,
    },
  );
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Partial<Record<DataSourceKind, string>> = {
  CAS_CAMS_KFINTECH: "CAMS/KFintech",
  CAS_NSDL: "NSDL",
  CAS_CDSL: "CDSL",
  MF_CENTRAL: "MF Central",
};

/** A depository CAS defaults to demat custody; an RTA eCAS is always SOA (§6.3). */
function defaultHoldingMode(kind: DataSourceKind): HoldingMode {
  return kind === "CAS_NSDL" || kind === "CAS_CDSL" ? "DEMAT" : "SOA";
}

function accountKindFor(holdingMode: HoldingMode, inst: Instrument): AccountKind {
  if (holdingMode === "DEMAT") return "DEMAT";
  if (holdingMode === "PHYSICAL") return "PHYSICAL";
  return inst.instrumentType === "MF" ? "MF_FOLIO" : "OTHER";
}

/**
 * Account identity is (member, custody mode, folio).
 *
 * Two folios of one scheme under one PAN are two accounts and therefore two
 * positions, never one merged holding: exit load, ELSS lock-in and FIFO all run
 * per folio, so merging them makes every downstream number wrong.
 */
function accountIdFor(memberId: MemberId, holdingMode: HoldingMode, folio: string): AccountId {
  return `acc:${memberId}:${holdingMode}:${normaliseFolio(folio)}`;
}

export interface NormaliseOptions {
  /** Injected so provenance stamps are deterministic; logic never reads a clock. */
  now?: Date;
  computedAt?: TimestampISO;
}

/**
 * Normalise ONE artifact. Rows are deduped within the artifact too, because a
 * CAS repeats a scheme block when it spans a page break.
 */
export function normaliseCas(
  artifact: RawArtifact,
  registry: CasRowResolver,
  opts: NormaliseOptions = {},
): EngineResult<NormalisedIngest> {
  return normaliseCasArtifacts([artifact], registry, opts);
}

/**
 * Normalise several artifacts as one ingestion.
 *
 * This is the entry point that matters for §6.3: the eCAS and the depository
 * CAS only cancel out if they are deduped against each other, which cannot
 * happen while each is normalised in isolation.
 */
export function normaliseCasArtifacts(
  artifacts: RawArtifact[],
  registry: CasRowResolver,
  opts: NormaliseOptions = {},
): EngineResult<NormalisedIngest> {
  const warnings: EngineWarning[] = [];
  const candidates: Transaction[] = [];
  const rawStatements: StatementBalance[] = [];
  const unmapped: ParsedRow[] = [];
  const accountsSeen = new Map<AccountId, Account>();
  const nameMatchedSchemes = new Set<string>();

  for (const artifact of artifacts) {
    artifact.rows.forEach((row, index) => {
      const rowRef = row.rowId ?? `${artifact.artifactId}#${index}`;
      const description = (row.description ?? "").trim();
      const hasTxnValue = Boolean(row.units || row.amount);

      if (!row.date || !isValidDate(row.date)) {
        unmapped.push(row);
        warnings.push(
          blocking(
            "INVALID_ROW_DATE",
            `Row ${rowRef} has no usable date ("${row.date}"), so it cannot be placed on the timeline.`,
            rowRef,
          ),
        );
        return;
      }

      const match = registry.resolve(row);
      if (!match) {
        unmapped.push(row);
        // A balance line we cannot map hides a whole holding, not just one row.
        const hidesUnits = hasTxnValue || Boolean(row.closingBalanceUnits || row.unitBalance);
        warnings.push(
          (hidesUnits ? blocking : warn)(
            "UNRESOLVED_INSTRUMENT",
            `Row ${rowRef} names scheme "${row.schemeName}" (ISIN ${row.isin ?? "none"}), which is not in the ` +
              `instrument master. Its units are excluded from the portfolio until it is mapped.`,
            rowRef,
          ),
        );
        return;
      }

      if (match.basis === "NAME" || match.basis === "NAME_PLAN_OPTION") {
        const schemeKey = `${match.instrument.instrumentId}|${row.schemeName}`;
        if (!nameMatchedSchemes.has(schemeKey)) {
          nameMatchedSchemes.add(schemeKey);
          warnings.push(
            warn(
              "INSTRUMENT_MATCHED_BY_NAME",
              `"${row.schemeName}" was matched to ${match.instrument.instrumentId} by name, not by ISIN. ` +
                `Confirm the plan (Direct vs Regular, §6.1) and option (Growth vs IDCW, §6.2).`,
              rowRef,
            ),
          );
        }
      }

      const holdingMode = row.holdingMode ?? defaultHoldingMode(artifact.sourceKind);
      const accountId = accountIdFor(artifact.memberId, holdingMode, row.folio);
      if (!accountsSeen.has(accountId)) {
        accountsSeen.set(accountId, {
          accountId,
          householdId: artifact.householdId,
          memberId: artifact.memberId,
          kind: accountKindFor(holdingMode, match.instrument),
          provider: row.amc ?? SOURCE_LABELS[artifact.sourceKind] ?? artifact.sourceKind,
          accountRef: row.folio,
          holdingMode,
        });
      }

      // --- statement balances -------------------------------------------------
      const isOpening = /opening\s*(unit\s*)?balance/i.test(description);
      const isClosing = /closing\s*(unit\s*)?balance/i.test(description);

      const closingUnits = row.closingBalanceUnits ?? (isClosing ? row.unitBalance ?? row.units : undefined);
      if (closingUnits != null) {
        rawStatements.push({
          accountId,
          instrumentId: match.instrument.instrumentId,
          folioNumber: row.folio,
          // A CAS prints the closing figure for the whole period, whichever
          // physical line the parser hung it on.
          asOf: row.closingAsOf ?? artifact.statementPeriod.to,
          closingUnits,
          closingValue: row.closingValue,
          sourceId: artifact.artifactId,
        });
      }

      if (isOpening) {
        const openingUnits = row.unitBalance ?? row.units ?? 0;
        rawStatements.push({
          accountId,
          instrumentId: match.instrument.instrumentId,
          folioNumber: row.folio,
          asOf: artifact.statementPeriod.from,
          closingUnits: openingUnits,
          closingValue: row.closingValue,
          sourceId: artifact.artifactId,
        });
        if (openingUnits > 0) {
          warnings.push(
            warn(
              "OPENING_BALANCE_WITHOUT_HISTORY",
              `Folio ${row.folio} opens the statement period with ${openingUnits} units of ` +
                `${match.instrument.instrumentId}. The purchases behind them are before ` +
                `${artifact.statementPeriod.from}, so cost basis and holding period are incomplete ` +
                `until an earlier statement is ingested.`,
              rowRef,
            ),
          );
        }
        return;
      }
      if (isClosing) return;

      // --- transactions -------------------------------------------------------
      const type = description ? classifyDescription(description) : undefined;
      if (!type) {
        // A row with no narration and no units is structure (it may still have
        // contributed the balance above). Anything that moves units is not.
        if (!description && !hasTxnValue) return;
        unmapped.push(row);
        warnings.push(
          (hasTxnValue ? blocking : warn)(
            "UNCLASSIFIED_DESCRIPTION",
            `Row ${rowRef} has narration "${description}", which does not match any known CAS transaction ` +
              `shape. It is kept unmapped rather than guessed at.`,
            rowRef,
          ),
        );
        return;
      }

      let instrumentId = match.instrument.instrumentId;
      let relatedInstrumentId: InstrumentId | undefined;

      if (type === "SEGREGATION") {
        // The CAS reports a side pocket as its own scheme block. The ledger
        // needs the carve-out expressed against the PARENT position (§6.5).
        const parent = match.instrument.parentInstrumentId;
        if (parent) {
          relatedInstrumentId = instrumentId;
          instrumentId = parent;
        } else {
          warnings.push(
            warn(
              "SEGREGATION_TARGET_UNKNOWN",
              `Side pocket row ${rowRef} resolved to ${instrumentId}, which does not declare a parent scheme, ` +
                `so the carve-out cannot be attached to the position it came out of.`,
              rowRef,
            ),
          );
        }
        warnings.push(
          warn(
            "SEGREGATION_COST_SPLIT_UNKNOWN",
            `A CAS does not print how cost basis splits between the main scheme and the side pocket, so no ` +
              `basis is moved for ${instrumentId} on ${row.date}. Supply the AMC's fraction to correct it (§6.5).`,
            rowRef,
          ),
        );
      }

      const units = row.units == null ? undefined : Math.abs(row.units);
      const amount = row.amount == null ? undefined : Math.abs(row.amount);

      if (row.units != null && row.units < 0 && (type === "BUY" || type === "SWITCH_IN" || type === "IDCW_REINVEST" || type === "BONUS" || type === "TRANSFER_IN" || type === "MERGER_IN")) {
        warnings.push(
          warn(
            "NEGATIVE_INFLOW_UNITS",
            `Row ${rowRef} is classified ${type} but carries negative units (${row.units}). It was ingested as ` +
              `${units} units; if this line is a reversal it must be corrected at source.`,
            rowRef,
          ),
        );
      }

      if (type === "SPLIT" && row.ratio == null) {
        warnings.push(
          warn(
            "SPLIT_RATIO_MISSING",
            `Split row ${rowRef} carries no ratio. A statement's "1:10" does not say which side is the new ` +
              `unit count, so it is not inferred (§6.7) and the split stays unapplied.`,
            rowRef,
          ),
        );
      }

      const txn: Transaction = {
        transactionId: `txn:${artifact.artifactId}:${index}`,
        accountId,
        instrumentId,
        folioNumber: row.folio,
        type,
        tradeDate: row.date,
        units: type === "SPLIT" ? undefined : units,
        pricePerUnit: row.nav,
        amount,
        ratio: row.ratio,
        relatedInstrumentId,
        stt: row.stt ?? chargeFrom(description, CHARGE_PATTERNS.stt),
        stampDuty: row.stampDuty ?? chargeFrom(description, CHARGE_PATTERNS.stampDuty),
        exitLoad: row.exitLoad ?? chargeFrom(description, CHARGE_PATTERNS.exitLoad),
        tds: row.tds ?? chargeFrom(description, CHARGE_PATTERNS.tds),
        sourceId: artifact.artifactId,
      };
      txn.dedupeKey = dedupeKeyFor(txn, match.instrument.isin);
      candidates.push(txn);
    });
  }

  const asOf = artifacts.reduce<DateISO>(
    (max, a) => (a.statementPeriod.to > max ? a.statementPeriod.to : max),
    artifacts[0]?.statementPeriod.to ?? todayISO(opts.now),
  );

  const deduped = dedupeTransactions(candidates, { asOf, computedAt: opts.computedAt });
  warnings.push(...deduped.warnings);
  const transactions = deduped.data.kept;

  linkPairedLegs(transactions, warnings);
  const statements = dedupeStatements(rawStatements, warnings);

  // Only emit accounts something actually points at: a duplicate source can
  // introduce an account whose every row was dropped.
  const referenced = new Set<AccountId>();
  for (const t of transactions) referenced.add(t.accountId);
  for (const s of statements) referenced.add(s.accountId);
  const accounts = [...accountsSeen.values()].filter((a) => referenced.has(a.accountId));

  const severities: Confidence[] = ["HIGH"];
  if (warnings.some((w) => w.severity === "WARN")) severities.push("MEDIUM");
  if (warnings.some((w) => w.severity === "BLOCKING")) severities.push("LOW");

  const dataSources: DataSourceRef[] = artifacts.map((a) => ({
    kind: a.sourceKind,
    label: a.label ?? SOURCE_LABELS[a.sourceKind] ?? a.sourceKind,
    asOf: a.statementPeriod.to,
  }));

  return ok(
    { transactions, accounts, statements, unmapped },
    {
      asOf,
      computedAt: opts.computedAt,
      dataSources,
      confidence: weakest(...severities),
      assumptions: {
        closingBalanceAsOf: "statement period end unless the row states otherwise",
        switchPairing: "same folio and same date",
        planWhenUnstated: "REGULAR",
        dedupeScope: "across all artifacts in this ingestion",
      },
      warnings,
    },
  );
}

/**
 * Pair the two legs of a switch and of a merger (§6.8, §6.4).
 *
 * Both legs are real events, so neither is dropped; the linkId is what lets the
 * ledger realise the outgoing leg and start a fresh holding period on the
 * incoming one, and what stops a merger being counted twice. Pairing is by
 * folio and date because an AMC executes both legs in the same folio on the
 * same day.
 */
function linkPairedLegs(txns: Transaction[], warnings: EngineWarning[]): void {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    const k = `${normaliseFolio(t.folioNumber)}|${t.tradeDate}`;
    const arr = groups.get(k);
    if (arr) arr.push(t);
    else groups.set(k, [t]);
  }

  for (const [groupKey, group] of groups) {
    pair(group, "SWITCH_OUT", "SWITCH_IN", `sw:${groupKey}`, false);
    pair(group, "MERGER_OUT", "MERGER_IN", `mg:${groupKey}`, true);
  }

  function pair(
    group: Transaction[],
    outType: TransactionType,
    inType: TransactionType,
    prefix: string,
    deriveRatio: boolean,
  ): void {
    const outs = group.filter((t) => t.type === outType);
    const ins = group.filter((t) => t.type === inType);
    const paired = Math.min(outs.length, ins.length);

    for (let i = 0; i < paired; i++) {
      const linkId = `${prefix}:${i}`;
      outs[i].linkId = linkId;
      ins[i].linkId = linkId;
      outs[i].relatedInstrumentId = ins[i].instrumentId;
      ins[i].relatedInstrumentId = outs[i].instrumentId;
      if (deriveRatio && outs[i].units && ins[i].units) {
        // New units per old unit, which is what the ledger carries cost basis on.
        outs[i].ratio = ins[i].units! / outs[i].units!;
      }
    }

    for (const leg of [...outs.slice(paired), ...ins.slice(paired)]) {
      warnings.push(
        warn(
          "UNPAIRED_LEG",
          `${leg.type} of ${leg.units ?? "?"} units on ${leg.tradeDate} in folio ${leg.folioNumber ?? "-"} has ` +
            `no matching counter-leg in this statement. The other side of the transfer is missing, so its ` +
            `${outType === "MERGER_OUT" ? "cost basis carry-over" : "holding period"} cannot be established.`,
          leg.transactionId,
        ),
      );
    }
  }
}

/**
 * Collapse statement balances that two sources agree on, keep the ones they
 * disagree about. A disagreement is a real reconciliation input, not noise, so
 * it is surfaced and both figures are handed on.
 */
function dedupeStatements(rows: StatementBalance[], warnings: EngineWarning[]): StatementBalance[] {
  const seen = new Map<string, StatementBalance>();
  const kept: StatementBalance[] = [];

  for (const s of rows) {
    const key = `${s.instrumentId}|${normaliseFolio(s.folioNumber)}|${s.asOf}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, s);
      kept.push(s);
      continue;
    }
    if (unitsMatch(first.closingUnits, s.closingUnits)) {
      warnings.push(
        info(
          "DUPLICATE_STATEMENT_BALANCE",
          `Two sources report the same ${s.closingUnits} unit balance for folio ${s.folioNumber} on ${s.asOf}; ` +
            `kept the one from ${first.sourceId ?? "the first source"}.`,
          s.accountId,
        ),
      );
      continue;
    }
    warnings.push(
      warn(
        "STATEMENT_BALANCE_CONFLICT",
        `Sources disagree on folio ${s.folioNumber} at ${s.asOf}: ${first.sourceId ?? "?"} reports ` +
          `${first.closingUnits} units, ${s.sourceId ?? "?"} reports ${s.closingUnits}. Both are kept for ` +
          `reconciliation to resolve.`,
        s.accountId,
      ),
    );
    kept.push(s);
  }

  return kept;
}
