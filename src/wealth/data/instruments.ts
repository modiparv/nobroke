/**
 * Instrument master and tax-regime resolution (spec §1.2).
 *
 * Two jobs, both pure:
 *
 *  1. IDENTITY. A CAS row, a demat holding statement and a broker contract note
 *     name the same product three different ways. The registry maps whatever
 *     identifiers a source gives us onto one instrumentId, and REFUSES to guess
 *     when the identifiers are ambiguous. Guessing here silently merges the
 *     Direct and Regular plans of one scheme (§6.1) or its Growth and IDCW
 *     options (§6.2), which corrupts cost basis for every downstream engine.
 *
 *  2. TAX REGIME. `tax_regime_key` is a function of the instrument AND the lot's
 *     acquisition date, never of assetClass alone. One debt folio can hold lots
 *     on both sides of 1-Apr-2023 (§6.10), and gold is one asset class with four
 *     different treatments (physical, ETF, fund, SGB).
 *
 * Phase 1 CLASSIFIES and stores dates. It computes no tax; the engine that
 * consumes these keys is Phase 3 and is deliberately not built here.
 */

import type {
  Composition, DateISO, Instrument, InstrumentId, TaxRegimeKey, TimestampISO,
} from "../domain/types.ts";
import { addMonths, isOnOrAfter } from "../domain/dates.ts";
import { blocking, info, ok, warn, type DataSourceRef, type EngineResult, type EngineWarning } from "../domain/result.ts";

// ---------------------------------------------------------------------------
// Rule constants
// ---------------------------------------------------------------------------

/**
 * Finance Act 2023 cutover. Debt mutual fund units ACQUIRED on or after this
 * date lose indexation and long-term treatment entirely (§6.10). It is the
 * acquisition date that matters, not the sale date, so the same folio holds
 * lots under both regimes forever.
 */
export const DEBT_MF_REGIME_CUTOVER: DateISO = "2023-04-01";

/** A fund is equity-oriented at 65%+ DOMESTIC equity. */
export const EQUITY_ORIENTED_MIN_PCT = 65;
/** A "specified mutual fund" (slab-taxed post cutover) sits at 35% equity or below. */
export const SPECIFIED_MF_MAX_EQUITY_PCT = 35;

export const ELSS_LOCK_IN_MONTHS = 36;
export const ULIP_LOCK_IN_MONTHS = 60;
export const TAX_SAVER_FD_LOCK_IN_MONTHS = 60;
/** Sovereign Gold Bonds run 8 years, with an RBI exit window from year 5. */
export const SGB_TENOR_MONTHS = 96;
export const SGB_EARLY_REDEMPTION_FROM_MONTHS = 60;

// ---------------------------------------------------------------------------
// Tax regime resolution
// ---------------------------------------------------------------------------

export interface TaxRegimeResolution {
  key: TaxRegimeKey;
  /** One line of provenance. The copilot may quote this; it may not derive it. */
  rationale: string;
  /** True when the same instrument yields a different key at a different acquisition date. */
  dateSensitive: boolean;
  /** True when TaxRegimeKey alone cannot express the real treatment (see notes). */
  coarse: boolean;
}

function debtMfKey(acquiredOn: DateISO): TaxRegimeKey {
  return isOnOrAfter(acquiredOn, DEBT_MF_REGIME_CUTOVER) ? "DEBT_MF_POST_APR2023" : "DEBT_MF_PRE_APR2023";
}

/**
 * Equity content that counts for the 65% test is DOMESTIC listed equity only.
 * An international fund of funds is 100% equity by sleeve and still a non-equity
 * fund for Indian tax, so EQUITY_INTL is deliberately excluded here.
 */
export function equityContentFromComposition(composition: Composition): number {
  let pct = 0;
  for (const row of composition.breakdown) {
    if (row.sleeve === "EQUITY_LARGE" || row.sleeve === "EQUITY_MID" || row.sleeve === "EQUITY_SMALL") {
      pct += row.weightPct;
    }
  }
  return pct;
}

/** Fund-shaped classification by equity content, used for hybrids and FoFs. */
function fundKeyByEquityContent(equityPct: number, acquiredOn: DateISO): TaxRegimeResolution {
  if (equityPct >= EQUITY_ORIENTED_MIN_PCT) {
    return {
      key: "EQUITY_MF",
      rationale: `${equityPct}% domestic equity is at or above the ${EQUITY_ORIENTED_MIN_PCT}% equity-oriented threshold.`,
      dateSensitive: false,
      coarse: false,
    };
  }
  if (equityPct <= SPECIFIED_MF_MAX_EQUITY_PCT) {
    return {
      key: debtMfKey(acquiredOn),
      rationale: `${equityPct}% domestic equity is at or below ${SPECIFIED_MF_MAX_EQUITY_PCT}%, so the fund follows the debt-MF regime for a lot acquired on ${acquiredOn}.`,
      dateSensitive: true,
      coarse: false,
    };
  }
  // 35-65%: not equity-oriented, but also not a "specified mutual fund", so it
  // keeps capital-gains treatment rather than dropping to slab. TaxRegimeKey has
  // no NON_EQUITY_MF row, and DEBT_MF_PRE_APR2023 is the closest surviving
  // capital-gains bucket. Flagged coarse so nothing presents it unqualified.
  return {
    key: "DEBT_MF_PRE_APR2023",
    rationale: `${equityPct}% domestic equity sits between ${SPECIFIED_MF_MAX_EQUITY_PCT}% and ${EQUITY_ORIENTED_MIN_PCT}%: not equity-oriented, not a specified mutual fund. Mapped to the nearest capital-gains key.`,
    dateSensitive: false,
    coarse: true,
  };
}

/**
 * Full classification with its reasoning. `resolveTaxRegime` is the thin wrapper
 * most callers want; this exists so the explanation is computed here rather than
 * assembled in a UI or copilot layer (spec §0).
 */
export function resolveTaxRegimeDetailed(
  instrument: Instrument,
  acquiredOn: DateISO,
  equityContentPct?: number,
): TaxRegimeResolution {
  const { instrumentType, assetClass, listingStatus } = instrument;
  const pctKnown = typeof equityContentPct === "number" && Number.isFinite(equityContentPct);

  switch (instrumentType) {
    case "MF":
    case "ETF": {
      // Gold and real-asset funds are never classified by equity content.
      if (assetClass === "COMMODITY") {
        return {
          key: "GOLD",
          rationale: "Gold fund/ETF units. The disposal route does not change the key, but see resolveGoldTreatment: gold is one asset class with four treatments.",
          dateSensitive: false,
          coarse: true,
        };
      }
      if (pctKnown) return fundKeyByEquityContent(equityContentPct as number, acquiredOn);
      if (assetClass === "DEBT" || assetClass === "CASH") {
        return {
          key: debtMfKey(acquiredOn),
          rationale: `Debt-oriented fund; the lot acquired on ${acquiredOn} falls ${isOnOrAfter(acquiredOn, DEBT_MF_REGIME_CUTOVER) ? "on or after" : "before"} the ${DEBT_MF_REGIME_CUTOVER} cutover (§6.10).`,
          dateSensitive: true,
          coarse: false,
        };
      }
      if (assetClass === "HYBRID") {
        // Documented assumption: without a Composition we cannot see the equity
        // sleeve, and the large majority of retail hybrid AUM (aggressive hybrid,
        // BAF, equity savings) is run above 65% for exactly this reason.
        return {
          key: "EQUITY_MF",
          rationale: "Hybrid fund with no composition supplied; assumed equity-oriented (65%+ equity). Supply equityContentPct to classify it properly.",
          dateSensitive: false,
          coarse: true,
        };
      }
      if (instrumentType === "ETF") {
        return { key: "LISTED_EQUITY", rationale: "Exchange-traded equity fund unit.", dateSensitive: false, coarse: false };
      }
      return { key: "EQUITY_MF", rationale: "Equity-oriented mutual fund unit.", dateSensitive: false, coarse: false };
    }

    case "STOCK": {
      // Delisted shares are taxed as unlisted, and so are foreign-listed shares:
      // "listed" means listed on a recognised Indian stock exchange.
      const unlisted = listingStatus === "UNLISTED" || listingStatus === "DELISTED";
      return {
        key: unlisted ? "UNLISTED_EQUITY" : "LISTED_EQUITY",
        rationale: unlisted
          ? `Shares with listing status ${listingStatus} are treated as unlisted.`
          : "Shares listed on a recognised Indian exchange.",
        dateSensitive: false,
        coarse: false,
      };
    }

    case "UNLISTED":
    case "ESOP":
    case "RSU":
      // RSUs of a foreign-listed employer are still unlisted for Indian capital
      // gains. Once Indian listed stock lands in a demat it arrives as STOCK.
      return {
        key: "UNLISTED_EQUITY",
        rationale: "Unlisted or employer-granted equity; perquisite tax at vest is a separate event the Phase 3 engine owns.",
        dateSensitive: false,
        coarse: false,
      };

    case "SGB":
      // No SGB row exists in TaxRegimeKey. GOLD is the nearest key, but it does
      // NOT capture the thing that matters: redemption at maturity is exempt,
      // sale on the exchange is not. Callers must consult isSgbHeldToMaturity.
      return {
        key: "GOLD",
        rationale: "Sovereign Gold Bond. Redemption at maturity is exempt; an exchange sale is not. The key cannot express that, so isSgbHeldToMaturity decides.",
        dateSensitive: false,
        coarse: true,
      };

    case "GOLD_PHYSICAL":
      return { key: "GOLD", rationale: "Physical gold. No STT, no exchange route, valued off a reference rate.", dateSensitive: false, coarse: false };

    case "PROPERTY":
      return { key: "PROPERTY", rationale: "Immovable property.", dateSensitive: false, coarse: false };

    case "CRYPTO":
      return { key: "VDA", rationale: "Virtual digital asset: flat rate, no loss set-off, no holding-period benefit.", dateSensitive: false, coarse: false };

    case "ULIP":
      return assetClass === "DEBT"
        ? { key: "SLAB_ONLY", rationale: "Debt-oriented ULIP.", dateSensitive: false, coarse: true }
        : {
            key: "EQUITY_MF",
            rationale: "Equity-oriented ULIP issued above the 2.5L annual premium threshold is taxed as an equity-oriented fund. Policies inside the threshold stay exempt under 10(10D); the key cannot express that.",
            dateSensitive: false,
            coarse: true,
          };

    case "PMS":
      // A PMS holds listed shares in the client's own demat, so the gains ARE
      // listed-equity gains at the underlying level.
      return { key: "LISTED_EQUITY", rationale: "PMS holdings sit in the client's own demat as listed shares.", dateSensitive: false, coarse: true };

    case "AIF":
      return assetClass === "DEBT"
        ? { key: "SLAB_ONLY", rationale: "Debt AIF income is taxed at slab in the investor's hands.", dateSensitive: false, coarse: true }
        : { key: "UNLISTED_EQUITY", rationale: "Equity AIF; pass-through of unlisted holdings.", dateSensitive: false, coarse: true };

    case "BOND":
    case "FD":
    case "RD":
    case "PPF":
    case "EPF":
    case "NPS":
    case "CHIT":
    case "P2P":
    case "LOAN_GIVEN":
      // Interest-bearing. PPF/EPF interest is actually exempt and NPS maturity is
      // partly exempt; there is no EXEMPT key, so they carry SLAB_ONLY and are
      // marked coarse rather than quietly overstating the tax.
      return {
        key: "SLAB_ONLY",
        rationale: "Interest-bearing instrument: income is taxed at slab as it accrues, not as capital gains.",
        dateSensitive: false,
        coarse: instrumentType === "PPF" || instrumentType === "EPF" || instrumentType === "NPS" || instrumentType === "BOND",
      };

    default:
      // Unknown type: slab is the most conservative assumption, and the coarse
      // flag stops it being presented as settled.
      return { key: "SLAB_ONLY", rationale: `Unrecognised instrument type ${String(instrumentType)}; defaulted to slab.`, dateSensitive: false, coarse: true };
  }
}

/**
 * THE key function. tax_regime_key is a function of the instrument AND the lot's
 * acquisition date (§6.10): a debt fund lot bought 15-Mar-2023 and one bought
 * 15-May-2023 in the SAME folio resolve to different regimes forever.
 *
 * Never read `instrument.taxRegimeKey` for a lot. That field is only the
 * date-independent default carried in the master.
 *
 * `equityContentPct` is DOMESTIC equity percentage, used to classify hybrids and
 * international fund-of-funds; derive it with `equityContentFromComposition`.
 */
export function resolveTaxRegime(
  instrument: Instrument,
  acquiredOn: DateISO,
  equityContentPct?: number,
): TaxRegimeKey {
  return resolveTaxRegimeDetailed(instrument, acquiredOn, equityContentPct).key;
}

// ---------------------------------------------------------------------------
// Gold: one asset class, four treatments (spec §1.2)
// ---------------------------------------------------------------------------

export type GoldTreatment =
  | "GOLD_PHYSICAL"          // dealer/jeweller sale, making charges are not cost
  | "GOLD_ETF"               // exchange route, demat units
  | "GOLD_FUND"              // fund-of-fund units, SOA route, exit load
  | "SGB_MATURITY_EXEMPT"    // redeemed with RBI at maturity
  | "SGB_SECONDARY_SALE"     // sold on the exchange before maturity
  | "NOT_GOLD";

/**
 * Keeps the four gold treatments apart, which TaxRegimeKey ("GOLD") cannot do on
 * its own. This is the documented trap: an app that keys gold tax off asset
 * class gives the same answer for a bangle, a Gold BeES unit and an SGB.
 *
 * `disposedOn` is optional because the treatment of an SGB is only decided at
 * disposal; without it the SGB answer stays as the exchange-sale case, which is
 * the taxable one and therefore the safe default.
 */
export function resolveGoldTreatment(instrument: Instrument, disposedOn?: DateISO): GoldTreatment {
  switch (instrument.instrumentType) {
    case "GOLD_PHYSICAL":
      return "GOLD_PHYSICAL";
    case "SGB":
      return disposedOn && isSgbHeldToMaturity(instrument, disposedOn) ? "SGB_MATURITY_EXEMPT" : "SGB_SECONDARY_SALE";
    case "ETF":
      return instrument.assetClass === "COMMODITY" ? "GOLD_ETF" : "NOT_GOLD";
    case "MF":
      return instrument.assetClass === "COMMODITY" ? "GOLD_FUND" : "NOT_GOLD";
    default:
      return "NOT_GOLD";
  }
}

export interface SgbWindow {
  issuedOn: DateISO;
  /** RBI premature redemption opens on coupon dates from year 5. */
  earlyRedemptionFrom: DateISO;
  maturesOn: DateISO;
}

/**
 * The dates the Phase 3 tax engine needs for an SGB. Derived from the accrual
 * terms carried on the instrument; if the issue date is missing we return
 * undefined rather than invent a maturity.
 */
export function sgbRedemptionWindow(instrument: Instrument): SgbWindow | undefined {
  if (instrument.instrumentType !== "SGB") return undefined;
  const issuedOn = instrument.accrual?.startDate;
  if (!issuedOn) return undefined;
  return {
    issuedOn,
    earlyRedemptionFrom: addMonths(issuedOn, SGB_EARLY_REDEMPTION_FROM_MONTHS),
    maturesOn: instrument.accrual?.maturityDate ?? addMonths(issuedOn, SGB_TENOR_MONTHS),
  };
}

/**
 * PREDICATE ONLY. An SGB redeemed with RBI at maturity is exempt; the same bond
 * sold on the exchange a day earlier is not. Phase 1 answers the question and
 * stores the dates; it computes no tax.
 *
 * Returns false for any disposal before maturity, including a premature RBI
 * redemption from year 5, because the transaction does not record the disposal
 * ROUTE and an exchange sale on the same date is taxable. Being conservative
 * here means we never quietly claim an exemption the user cannot support.
 */
export function isSgbHeldToMaturity(instrument: Instrument, disposedOn: DateISO): boolean {
  const window = sgbRedemptionWindow(instrument);
  if (!window) return false;
  return isOnOrAfter(disposedOn, window.maturesOn);
}

// ---------------------------------------------------------------------------
// Lock-in
// ---------------------------------------------------------------------------

/**
 * Lock-in end for a lot acquired on `acquiredOn`. ELSS runs 36 months from each
 * SIP instalment rather than from the folio (§6.9), which is why this takes a
 * lot date at all; the ledger stamps the result onto every lot it creates.
 *
 * An absolute `lockInEndDate` on the instrument (a dated FD, a PPF account) wins
 * only when there is no rolling rule, because the account itself is the thing
 * that matures.
 */
export function lockInEndFor(instrument: Instrument, acquiredOn: DateISO): DateISO | undefined {
  if (instrument.lockInMonths) return addMonths(acquiredOn, instrument.lockInMonths);
  if (instrument.instrumentType === "ULIP") return addMonths(acquiredOn, ULIP_LOCK_IN_MONTHS);
  return instrument.lockInEndDate;
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

export interface IdentityKey {
  isin?: string;
  amfiCode?: string;
  symbol?: string;
  name?: string;
}

export type IdentityMatchKind = "ISIN" | "AMFI_CODE" | "SYMBOL" | "NAME" | "NONE";

export interface IdentityMatch {
  instrument?: Instrument;
  matchedBy: IdentityMatchKind;
  /** True when the weakest identifier supplied matched more than one instrument. */
  ambiguous: boolean;
  /** Populated when ambiguous, so the caller can report what it could not choose between. */
  candidates: Instrument[];
  /** Set when two supplied identifiers point at different instruments. */
  conflict?: string;
}

const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function isIsinShaped(isin: string): boolean {
  return ISIN_SHAPE.test(isin.trim().toUpperCase());
}

function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase();
}

/** Statements pad AMFI scheme codes with leading zeros; "0119551" is "119551". */
function normalizeAmfiCode(code: string): string {
  return code.trim().replace(/^0+(?=\d)/, "");
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Tokens a statement adds without changing which product is meant. */
const NAME_NOISE = new Set(["PLAN", "OPTION", "SCHEME"]);

/** CAS abbreviations, plus the 2021 DIVIDEND to IDCW rename. */
const NAME_SYNONYMS: Record<string, string> = {
  DIR: "DIRECT",
  REG: "REGULAR",
  GR: "GROWTH",
  DIV: "IDCW",
  DIVIDEND: "IDCW",
  REINVESTMENT: "REINVEST",
  REINVESTED: "REINVEST",
  LTD: "LIMITED",
};

/**
 * Punctuation-insensitive name key. Plan and option tokens are deliberately
 * PRESERVED: "Direct" and "Regular" are what keep §6.1 from collapsing, and
 * "Growth" and "IDCW" are what keep §6.2 from collapsing.
 */
export function normalizeInstrumentName(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0 && !NAME_NOISE.has(t))
    .map((t) => NAME_SYNONYMS[t] ?? t)
    .join(" ");
}

export interface InstrumentRegistry {
  byId(instrumentId: InstrumentId): Instrument | undefined;
  byIsin(isin: string): Instrument | undefined;
  byAmfiCode(code: string): Instrument | undefined;
  all(): Instrument[];
  /** Returns a NEW registry; the receiver is never mutated. */
  upsert(instrument: Instrument): InstrumentRegistry;
  /** Batch form, so ingesting a whole CAS does not rebuild the index per row. */
  upsertAll(instruments: Instrument[]): InstrumentRegistry;
  /** Best single match, or undefined when the identifiers cannot decide (§6.1). */
  resolveIdentity(key: IdentityKey): Instrument | undefined;
  /** Same resolution with the reason, for callers that must warn rather than drop a row. */
  resolveIdentityDetailed(key: IdentityKey): IdentityMatch;
}

/**
 * A small immutable registry over the instrument master.
 *
 * Purity choice: `upsert` returns a NEW registry rather than mutating in place.
 * The master is a few thousand rows, one CAS parse upserts a handful of them,
 * and immutability means two households being ingested concurrently can never
 * see each other's half-written rows. `upsertAll` exists for the batch case.
 *
 * Later entries win on duplicate instrumentId, so a caller can layer a
 * user-corrected row over the seed.
 */
export function createInstrumentRegistry(seed: Instrument[] = []): InstrumentRegistry {
  const byIdMap = new Map<InstrumentId, Instrument>();
  for (const inst of seed) byIdMap.set(inst.instrumentId, inst);

  const rows = [...byIdMap.values()];
  const byIsinMap = new Map<string, Instrument>();
  const byAmfiMap = new Map<string, Instrument>();
  const bySymbolMap = new Map<string, Instrument[]>();
  const byNameMap = new Map<string, Instrument[]>();

  for (const inst of rows) {
    if (inst.isin) byIsinMap.set(normalizeIsin(inst.isin), inst);
    if (inst.amfiCode) byAmfiMap.set(normalizeAmfiCode(inst.amfiCode), inst);
    if (inst.symbol) {
      const k = normalizeSymbol(inst.symbol);
      bySymbolMap.set(k, [...(bySymbolMap.get(k) ?? []), inst]);
    }
    const nameKey = normalizeInstrumentName(inst.name);
    byNameMap.set(nameKey, [...(byNameMap.get(nameKey) ?? []), inst]);
  }

  function resolveIdentityDetailed(key: IdentityKey): IdentityMatch {
    const hits: Array<{ kind: IdentityMatchKind; matches: Instrument[] }> = [];

    if (key.isin) {
      const hit = byIsinMap.get(normalizeIsin(key.isin));
      if (hit) hits.push({ kind: "ISIN", matches: [hit] });
    }
    if (key.amfiCode) {
      const hit = byAmfiMap.get(normalizeAmfiCode(key.amfiCode));
      if (hit) hits.push({ kind: "AMFI_CODE", matches: [hit] });
    }
    if (key.symbol) {
      const hit = bySymbolMap.get(normalizeSymbol(key.symbol));
      if (hit?.length) hits.push({ kind: "SYMBOL", matches: hit });
    }
    if (key.name) {
      const hit = byNameMap.get(normalizeInstrumentName(key.name));
      if (hit?.length) hits.push({ kind: "NAME", matches: hit });
    }

    if (hits.length === 0) return { matchedBy: "NONE", ambiguous: false, candidates: [] };

    // Identifier strength order: ISIN is the only globally unique one, an AMFI
    // code is unique per scheme option, a symbol repeats across exchanges and a
    // name is a human string. `hits` is built in that order already.
    const best = hits[0];
    const winner = best.matches.length === 1 ? best.matches[0] : undefined;

    // Disagreement between two supplied identifiers is a data-quality problem in
    // the source, not something to resolve silently.
    let conflict: string | undefined;
    for (const other of hits.slice(1)) {
      if (other.matches.length === 1 && winner && other.matches[0].instrumentId !== winner.instrumentId) {
        conflict = `${best.kind} resolves to ${winner.instrumentId} but ${other.kind} resolves to ${other.matches[0].instrumentId}; ${best.kind} was used.`;
        break;
      }
    }

    if (!winner) {
      return { matchedBy: best.kind, ambiguous: true, candidates: [...best.matches], conflict };
    }
    return { instrument: winner, matchedBy: best.kind, ambiguous: false, candidates: [], conflict };
  }

  const registry: InstrumentRegistry = {
    byId: (instrumentId) => byIdMap.get(instrumentId),
    byIsin: (isin) => byIsinMap.get(normalizeIsin(isin)),
    byAmfiCode: (code) => byAmfiMap.get(normalizeAmfiCode(code)),
    all: () => [...rows],
    upsert: (instrument) => createInstrumentRegistry([...rows, instrument]),
    upsertAll: (instruments) => createInstrumentRegistry([...rows, ...instruments]),
    resolveIdentity: (key) => resolveIdentityDetailed(key).instrument,
    resolveIdentityDetailed,
  };
  return registry;
}

// ---------------------------------------------------------------------------
// Master build: the public engine entry point
// ---------------------------------------------------------------------------

/**
 * Builds the registry AND audits the rows that go into it (spec §5, §2.3).
 *
 * The audit exists because an instrument master defect is invisible downstream:
 * two rows sharing an ISIN silently merge a Direct and a Regular plan, and a
 * stored tax key that disagrees with the derived one will be quietly wrong for
 * every lot. Both surface here as warnings rather than being repaired in place.
 */
export function buildInstrumentMaster(input: {
  instruments?: Instrument[];
  asOf: DateISO;
  dataSources?: DataSourceRef[];
  /** Injectable so the whole result is deterministic; defaults to the wall clock. */
  computedAt?: TimestampISO;
}): EngineResult<InstrumentRegistry> {
  const instruments = input.instruments ?? SEED_INSTRUMENTS;
  const warnings: EngineWarning[] = [];

  const seenIds = new Set<InstrumentId>();
  const isinOwner = new Map<string, InstrumentId>();
  const amfiOwner = new Map<string, InstrumentId>();

  for (const inst of instruments) {
    if (seenIds.has(inst.instrumentId)) {
      warnings.push(blocking("DUPLICATE_INSTRUMENT_ID", `Instrument id ${inst.instrumentId} appears more than once; only the last row survives.`, inst.instrumentId));
    }
    seenIds.add(inst.instrumentId);

    if (inst.isin) {
      const isin = normalizeIsin(inst.isin);
      if (!isIsinShaped(isin)) {
        warnings.push(warn("MALFORMED_ISIN", `ISIN ${inst.isin} is not ISIN-shaped; statement matching by ISIN will fail.`, inst.instrumentId));
      }
      const owner = isinOwner.get(isin);
      if (owner && owner !== inst.instrumentId) {
        warnings.push(blocking("DUPLICATE_ISIN", `ISIN ${isin} is claimed by both ${owner} and ${inst.instrumentId}. Direct and Regular plans, and Growth and IDCW options, must each carry their own ISIN (§6.1, §6.2).`, inst.instrumentId));
      }
      isinOwner.set(isin, inst.instrumentId);
    } else if (inst.instrumentType === "MF" || inst.instrumentType === "ETF") {
      warnings.push(warn("MISSING_ISIN", `${inst.name} has no ISIN; CAS rows will have to be matched on name, which cannot separate lookalike schemes.`, inst.instrumentId));
    }

    if (inst.amfiCode) {
      const code = normalizeAmfiCode(inst.amfiCode);
      const owner = amfiOwner.get(code);
      if (owner && owner !== inst.instrumentId) {
        warnings.push(warn("DUPLICATE_AMFI_CODE", `AMFI code ${code} is claimed by both ${owner} and ${inst.instrumentId}.`, inst.instrumentId));
      }
      amfiOwner.set(code, inst.instrumentId);
    }

    const derived = resolveTaxRegimeDetailed(inst, input.asOf);
    if (derived.dateSensitive) {
      warnings.push(info("TAX_REGIME_IS_LOT_DATED", `${inst.name} carries a lot-dated tax regime; the stored key ${inst.taxRegimeKey} is only a default and resolveTaxRegime must be called with each lot's acquisition date (§6.10).`, inst.instrumentId));
    } else if (derived.key !== inst.taxRegimeKey) {
      warnings.push(warn("TAX_REGIME_MISMATCH", `${inst.name} stores tax regime ${inst.taxRegimeKey} but its type and listing status derive ${derived.key}.`, inst.instrumentId));
    }

    if (inst.instrumentType === "SGB" && !inst.accrual?.maturityDate && !inst.accrual?.startDate) {
      warnings.push(warn("SGB_WITHOUT_DATES", `${inst.name} has no issue or maturity date, so the maturity-exemption predicate cannot be evaluated.`, inst.instrumentId));
    }

    if (inst.lockInMonths && inst.lockInEndDate) {
      warnings.push(warn("AMBIGUOUS_LOCK_IN", `${inst.name} carries both a rolling ${inst.lockInMonths}-month lock-in and an absolute end date; the rolling rule wins.`, inst.instrumentId));
    }
  }

  const hasBlockingRow = warnings.some((w) => w.severity === "BLOCKING");
  const hasWarnRow = warnings.some((w) => w.severity === "WARN");

  return ok(createInstrumentRegistry(instruments), {
    asOf: input.asOf,
    computedAt: input.computedAt,
    dataSources: input.dataSources ?? [{ kind: "DERIVED", label: "Bundled instrument master", asOf: input.asOf }],
    confidence: hasBlockingRow ? "LOW" : hasWarnRow ? "MEDIUM" : "HIGH",
    assumptions: {
      debtMfRegimeCutover: DEBT_MF_REGIME_CUTOVER,
      equityOrientedMinPct: EQUITY_ORIENTED_MIN_PCT,
      specifiedMfMaxEquityPct: SPECIFIED_MF_MAX_EQUITY_PCT,
      hybridWithoutComposition: "Assumed equity-oriented (EQUITY_MF) until a Composition is supplied.",
      sgbPrematureRedemption: "Treated as a taxable exchange sale, because the disposal route is not recorded.",
      exemptIncomes: "PPF, EPF and the tax-free share of NPS carry SLAB_ONLY; TaxRegimeKey has no exempt row.",
    },
    warnings,
  });
}

// ---------------------------------------------------------------------------
// Seed master (spec §1.2)
// ---------------------------------------------------------------------------

/**
 * A small realistic Indian master. ISINs and AMFI codes are plausible rather
 * than authoritative; the point of the seed is to exercise the shapes that break
 * portfolio apps: the same scheme in Direct and Regular (§6.1), the same plan in
 * Growth and IDCW (§6.2), a debt fund that straddles the 2023 cutover (§6.10),
 * and gold arriving four different ways.
 *
 * `taxRegimeKey` here is the date-independent DEFAULT only. For anything with a
 * lot, call `resolveTaxRegime(instrument, lot.acquiredOn)`.
 */
export const SEED_INSTRUMENTS: Instrument[] = [
  // --- Same scheme, three ISINs: Direct/Regular (§6.1) and Growth/IDCW (§6.2).
  {
    instrumentId: "MF_PPFC_DIR_G",
    isin: "INF879O01019",
    amfiCode: "122639",
    name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    liquidityTier: "T3",
    riskBand: 5,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "DIRECT",
    option: "GROWTH",
    exitLoad: [{ withinDays: 365, percent: 1 }],
  },
  {
    instrumentId: "MF_PPFC_REG_G",
    isin: "INF879O01027",
    amfiCode: "122640",
    name: "Parag Parikh Flexi Cap Fund - Regular Plan - Growth",
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    liquidityTier: "T3",
    riskBand: 5,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "REGULAR",
    option: "GROWTH",
    exitLoad: [{ withinDays: 365, percent: 1 }],
  },
  {
    instrumentId: "MF_PPFC_DIR_IDCW",
    isin: "INF879O01035",
    amfiCode: "122641",
    name: "Parag Parikh Flexi Cap Fund - Direct Plan - IDCW Payout",
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    liquidityTier: "T3",
    riskBand: 5,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "DIRECT",
    option: "IDCW_PAYOUT",
    exitLoad: [{ withinDays: 365, percent: 1 }],
  },

  // --- ELSS: 36-month lock-in, applied per SIP instalment (§6.9).
  {
    instrumentId: "MF_MIRAE_ELSS_DIR_G",
    isin: "INF769K01DS4",
    amfiCode: "135781",
    name: "Mirae Asset ELSS Tax Saver Fund - Direct Plan - Growth",
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    liquidityTier: "LOCKED",
    riskBand: 5,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "DIRECT",
    option: "GROWTH",
    lockInMonths: ELSS_LOCK_IN_MONTHS,
  },

  // --- Debt: the instrument that straddles the 1-Apr-2023 cutover (§6.10).
  {
    instrumentId: "MF_ICICI_CORPBOND_DIR_G",
    isin: "INF109K01VQ1",
    amfiCode: "120694",
    name: "ICICI Prudential Corporate Bond Fund - Direct Plan - Growth",
    assetClass: "DEBT",
    instrumentType: "MF",
    taxRegimeKey: "DEBT_MF_POST_APR2023",
    liquidityTier: "T3",
    riskBand: 3,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "DIRECT",
    option: "GROWTH",
  },
  {
    instrumentId: "MF_SBI_LIQUID_DIR_G",
    isin: "INF200K01LQ5",
    amfiCode: "119807",
    name: "SBI Liquid Fund - Direct Plan - Growth",
    assetClass: "CASH",
    instrumentType: "MF",
    taxRegimeKey: "DEBT_MF_POST_APR2023",
    liquidityTier: "T1",
    riskBand: 1,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "DIRECT",
    option: "GROWTH",
    // Graded 7-day exit load introduced for liquid funds in 2019.
    exitLoad: [{ withinDays: 7, percent: 0.0045 }],
  },

  // --- Exchange traded.
  {
    instrumentId: "ETF_NIFTYBEES",
    isin: "INF204KB14I2",
    symbol: "NIFTYBEES",
    exchange: "NSE",
    name: "Nippon India ETF Nifty 50 BeES",
    assetClass: "EQUITY",
    instrumentType: "ETF",
    taxRegimeKey: "LISTED_EQUITY",
    liquidityTier: "T1",
    riskBand: 5,
    currency: "INR",
    listingStatus: "LISTED",
    plan: "NA",
    option: "NA",
  },
  {
    instrumentId: "STK_HDFCBANK",
    isin: "INE040A01034",
    symbol: "HDFCBANK",
    exchange: "NSE",
    name: "HDFC Bank Limited",
    assetClass: "EQUITY",
    instrumentType: "STOCK",
    taxRegimeKey: "LISTED_EQUITY",
    liquidityTier: "T1",
    riskBand: 6,
    currency: "INR",
    listingStatus: "LISTED",
    plan: "NA",
    option: "NA",
  },

  // --- Gold arriving four ways: bond, ETF, fund, metal.
  {
    instrumentId: "SGB_2016_17_SERIES_IV",
    isin: "IN0020160126",
    symbol: "SGBMAR25",
    exchange: "NSE",
    name: "Sovereign Gold Bond 2016-17 Series IV",
    assetClass: "COMMODITY",
    instrumentType: "SGB",
    taxRegimeKey: "GOLD",
    liquidityTier: "T3",
    riskBand: 4,
    currency: "INR",
    listingStatus: "LISTED",
    plan: "NA",
    option: "NA",
    // 2.5% p.a. on nominal, paid half-yearly and never compounded.
    accrual: { annualRate: 0.025, compounding: "SIMPLE", startDate: "2017-03-17", maturityDate: "2025-03-17" },
  },
  {
    instrumentId: "ETF_GOLDBEES",
    isin: "INF204KB17I5",
    symbol: "GOLDBEES",
    exchange: "NSE",
    name: "Nippon India ETF Gold BeES",
    assetClass: "COMMODITY",
    instrumentType: "ETF",
    taxRegimeKey: "GOLD",
    liquidityTier: "T1",
    riskBand: 4,
    currency: "INR",
    listingStatus: "LISTED",
    plan: "NA",
    option: "NA",
  },
  {
    instrumentId: "MF_SBI_GOLD_DIR_G",
    isin: "INF200K01RG3",
    amfiCode: "119762",
    name: "SBI Gold Fund - Direct Plan - Growth",
    assetClass: "COMMODITY",
    instrumentType: "MF",
    taxRegimeKey: "GOLD",
    liquidityTier: "T3",
    riskBand: 4,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "DIRECT",
    option: "GROWTH",
    exitLoad: [{ withinDays: 15, percent: 1 }],
  },
  {
    instrumentId: "GOLD_PHYSICAL_24K",
    name: "Physical gold 24K",
    assetClass: "COMMODITY",
    instrumentType: "GOLD_PHYSICAL",
    taxRegimeKey: "GOLD",
    liquidityTier: "T3",
    riskBand: 4,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "NA",
    option: "NA",
  },

  // --- Accrual and retirement instruments.
  {
    instrumentId: "FD_HDFC_TAXSAVER_5Y",
    name: "HDFC Bank 5 Year Tax Saving Fixed Deposit",
    assetClass: "DEBT",
    instrumentType: "FD",
    taxRegimeKey: "SLAB_ONLY",
    liquidityTier: "LOCKED",
    riskBand: 1,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "NA",
    option: "NA",
    lockInMonths: TAX_SAVER_FD_LOCK_IN_MONTHS,
    accrual: { annualRate: 0.071, compounding: "QUARTERLY", startDate: "2023-06-15", maturityDate: "2028-06-15", principal: 150_000 },
  },
  {
    instrumentId: "PPF_SBI",
    name: "Public Provident Fund account",
    assetClass: "DEBT",
    instrumentType: "PPF",
    taxRegimeKey: "SLAB_ONLY",
    liquidityTier: "LOCKED",
    riskBand: 1,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "NA",
    option: "NA",
    // PPF runs 15 years from the END of the financial year of opening, so an
    // account opened in April 2016 matures on 31-Mar-2032, not in 2031.
    lockInEndDate: "2032-03-31",
    accrual: { annualRate: 0.071, compounding: "ANNUAL", startDate: "2016-04-05", maturityDate: "2032-03-31" },
  },
  {
    instrumentId: "EPF_UAN",
    name: "Employees Provident Fund",
    assetClass: "DEBT",
    instrumentType: "EPF",
    taxRegimeKey: "SLAB_ONLY",
    liquidityTier: "LOCKED",
    riskBand: 1,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "NA",
    option: "NA",
    accrual: { annualRate: 0.0825, compounding: "ANNUAL", startDate: "2015-07-01" },
  },
  {
    instrumentId: "NPS_TIER1_SCHEME_E",
    name: "NPS Tier I Scheme E",
    assetClass: "EQUITY",
    instrumentType: "NPS",
    taxRegimeKey: "SLAB_ONLY",
    liquidityTier: "LOCKED",
    riskBand: 5,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "NA",
    option: "NA",
    // No lockInEndDate: NPS unlocks at the subscriber's age 60, which is a
    // property of the member rather than of the instrument.
  },
  {
    instrumentId: "ULIP_BAJAJ_GOAL_ASSURE",
    name: "Bajaj Allianz Goal Assure ULIP",
    assetClass: "HYBRID",
    instrumentType: "ULIP",
    taxRegimeKey: "EQUITY_MF",
    liquidityTier: "LOCKED",
    riskBand: 4,
    currency: "INR",
    listingStatus: "UNLISTED",
    plan: "NA",
    option: "NA",
    lockInMonths: ULIP_LOCK_IN_MONTHS,
  },
];
