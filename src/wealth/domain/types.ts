/**
 * Wealth Management — core domain types (Phase 1).
 *
 * Scope boundary (spec §0): this module is the TRUTH layer. It owns what the
 * user owns, what it is worth, and how it was acquired. It does NOT own goals,
 * budgets or advice, and it never renders copy.
 *
 * The atomic unit is the Lot (spec §1.1). Positions are derived views over
 * lots; they are never the system of record. Indian capital gains are FIFO by
 * lot, exit loads are lot-aged, grandfathering is lot-dated and holding period
 * is lot-specific, so aggregating lots away makes tax uncomputable.
 */

/** Calendar date, `YYYY-MM-DD`. Lexicographically sortable, timezone-free. */
export type DateISO = string;
/** Instant, ISO-8601 with offset. Used for `as_of` provenance stamps. */
export type TimestampISO = string;

export type HouseholdId = string;
export type MemberId = string;
export type AccountId = string;
export type PositionId = string;
export type LotId = string;
export type TransactionId = string;
export type InstrumentId = string;

// ---------------------------------------------------------------------------
// Instrument master (spec §1.2)
// ---------------------------------------------------------------------------

export type AssetClass = "EQUITY" | "DEBT" | "HYBRID" | "COMMODITY" | "REAL_ASSET" | "CASH" | "ALTERNATIVE";

export type InstrumentType =
  | "MF" | "STOCK" | "ETF" | "BOND" | "FD" | "RD" | "PPF" | "EPF" | "NPS" | "SGB"
  | "ULIP" | "AIF" | "PMS" | "UNLISTED" | "ESOP" | "RSU" | "PROPERTY" | "GOLD_PHYSICAL"
  | "CRYPTO" | "CHIT" | "P2P" | "LOAN_GIVEN";

/**
 * Deliberately separate from assetClass (spec §1.2). A gold ETF, a gold fund,
 * physical gold and an SGB are one asset class and four tax treatments; keying
 * tax off assetClass is the most common bug in Indian portfolio apps.
 *
 * Phase 1 only STORES this key and the lot dates it needs. The tax engine that
 * consumes them is Phase 3 and is deliberately not built here.
 */
export type TaxRegimeKey =
  | "EQUITY_MF" | "DEBT_MF_POST_APR2023" | "DEBT_MF_PRE_APR2023" | "LISTED_EQUITY"
  | "UNLISTED_EQUITY" | "GOLD" | "PROPERTY" | "VDA" | "SLAB_ONLY";

export type LiquidityTier = "T0" | "T1" | "T3" | "T7" | "LOCKED" | "ILLIQUID";
/** 1..6, mapped to the SEBI riskometer for mutual funds. */
export type RiskBand = 1 | 2 | 3 | 4 | 5 | 6;
export type ListingStatus = "LISTED" | "UNLISTED" | "DELISTED" | "SUSPENDED";
/** Regular and Direct are different ISINs and must never merge (trap §6.1). */
export type PlanKind = "DIRECT" | "REGULAR" | "NA";
/** Growth and IDCW are different ISINs and must never merge (trap §6.2). */
export type OptionKind = "GROWTH" | "IDCW_PAYOUT" | "IDCW_REINVEST" | "NA";

export interface Instrument {
  instrumentId: InstrumentId;
  isin?: string;
  amfiCode?: string;
  symbol?: string;
  exchange?: string;
  name: string;
  assetClass: AssetClass;
  instrumentType: InstrumentType;
  taxRegimeKey: TaxRegimeKey;
  liquidityTier: LiquidityTier;
  riskBand: RiskBand;
  currency: string;
  listingStatus: ListingStatus;
  plan: PlanKind;
  option: OptionKind;
  /** Instrument-level lock-in RULE in months (ELSS 36, ULIP 60, tax-saver FD 60). */
  lockInMonths?: number;
  /** Absolute lock-in end where the instrument itself is dated (e.g. an FD). */
  lockInEndDate?: DateISO;
  /** Exit-load schedule; consumed by the rebalancer in Phase 3, stored now. */
  exitLoad?: ExitLoadRule[];
  /** Contractual terms for accrual-valued instruments (FD/RD/PPF/EPF/bond). */
  accrual?: AccrualTerms;
  /** True once a segregated portfolio (side pocket) is carved out (trap §6.5). */
  isSegregatedPortfolio?: boolean;
  parentInstrumentId?: InstrumentId;
}

export interface ExitLoadRule {
  /** Load applies when units are held for fewer than this many days. */
  withinDays: number;
  /** Percent of redemption value, e.g. 1 for 1%. */
  percent: number;
}

export type CompoundingFrequency = "SIMPLE" | "ANNUAL" | "HALF_YEARLY" | "QUARTERLY" | "MONTHLY";

export interface AccrualTerms {
  /** Annual contracted rate as a decimal, e.g. 0.071 for 7.1%. */
  annualRate: number;
  compounding: CompoundingFrequency;
  startDate: DateISO;
  maturityDate?: DateISO;
  /** Face/principal for FD, bonds. */
  principal?: number;
}

// ---------------------------------------------------------------------------
// Look-through (spec §1.3). Types only in Phase 1; the allocation engine that
// consumes them is Phase 2 and is intentionally not built.
// ---------------------------------------------------------------------------

export type Sleeve =
  | "EQUITY_LARGE" | "EQUITY_MID" | "EQUITY_SMALL" | "EQUITY_INTL"
  | "DEBT_SOV" | "DEBT_AAA" | "DEBT_BELOW_AAA" | "GOLD" | "CASH" | "REIT";

export interface Composition {
  instrumentId: InstrumentId;
  asOf: DateISO;
  breakdown: Array<{ sleeve: Sleeve; weightPct: number }>;
}

export interface Constituent {
  instrumentId: InstrumentId;
  asOf: DateISO;
  holdings: Array<{ name: string; isin?: string; weightPct: number }>;
}

// ---------------------------------------------------------------------------
// Household → Member → Account → Position → Lot → Transaction (spec §1.1)
// ---------------------------------------------------------------------------

export type Relation = "SELF" | "SPOUSE" | "CHILD" | "PARENT" | "HUF";
/** Residential status drives NRO/NRE tagging and TDS (trap §6.13). */
export type ResidencyStatus = "RESIDENT" | "NRI" | "OCI";

export interface Household {
  householdId: HouseholdId;
  name: string;
  baseCurrency: string;
}

export interface Member {
  memberId: MemberId;
  householdId: HouseholdId;
  name: string;
  relation: Relation;
  /** Masked in logs; never log the raw value (spec §7). */
  panMasked?: string;
  dateOfBirth?: DateISO;
  residency: ResidencyStatus;
  /** A minor's income is clubbed with the guardian until majority (trap §6.14). */
  isMinor?: boolean;
  guardianMemberId?: MemberId;
}

export type AccountKind =
  | "BANK" | "DEMAT" | "MF_FOLIO" | "EPF" | "NPS" | "PPF" | "INSURANCE" | "PHYSICAL" | "OTHER";

/** How units are custodied. The same scheme can appear in both (trap §6.3). */
export type HoldingMode = "SOA" | "DEMAT" | "PHYSICAL";

export interface Account {
  accountId: AccountId;
  householdId: HouseholdId;
  /** Primary holder. Joint holdings also carry `jointMemberIds` (trap §6.16). */
  memberId: MemberId;
  jointMemberIds?: MemberId[];
  kind: AccountKind;
  provider: string;
  /** Folio number for MF_FOLIO, masked DP/client id for DEMAT. */
  accountRef?: string;
  holdingMode: HoldingMode;
  /** NRO vs NRE matters for repatriation and TDS (trap §6.13). */
  nriSubType?: "NRO" | "NRE";
  nomineeRegistered?: boolean;
  openedOn?: DateISO;
  closedOn?: DateISO;
}

/** Why a lot exists. Drives cost basis and holding-period rules. */
export type AcquisitionKind =
  | "PURCHASE"        // cash purchase / SIP instalment
  | "REINVEST"        // IDCW reinvestment: fresh cost, fresh holding period
  | "BONUS"           // zero cost, fresh holding period (trap §6.6)
  | "MERGER_CARRIED"  // cost basis AND holding period carry over (trap §6.4)
  | "SEGREGATED"      // side-pocket carve-out (trap §6.5)
  | "RIGHTS"
  | "TRANSFER_IN"
  | "OPENING_BALANCE"; // reconstructed from a statement without full history

/**
 * A single purchase tranche. This is the system of record.
 *
 * `units` is the OPEN quantity (reduced FIFO by sells). `originalUnits` is what
 * the lot was created with. A split rewrites `units`/`costPerUnit` in place and
 * leaves `acquiredOn` untouched (trap §6.7).
 */
export interface Lot {
  lotId: LotId;
  positionId: PositionId;
  instrumentId: InstrumentId;
  /** Holding-period start. Fresh for BONUS, carried for MERGER_CARRIED. */
  acquiredOn: DateISO;
  units: number;
  originalUnits: number;
  costPerUnit: number;
  acquisitionKind: AcquisitionKind;
  sourceTransactionId?: TransactionId;
  /**
   * Lot-level lock-in. ELSS lock-in is per SIP instalment, not per folio
   * (trap §6.9), so it can only live here.
   */
  lockInEndDate?: DateISO;
  /**
   * FMV on 31-Jan-2018, stored for grandfathering. Phase 1 persists it; the
   * Phase 3 tax engine applies the higher-of-cost-or-FMV rule.
   */
  fmv31Jan2018?: number;
  closed: boolean;
}

export interface Position {
  positionId: PositionId;
  accountId: AccountId;
  instrumentId: InstrumentId;
  /** Folio for SOA units; distinguishes multiple folios of one scheme. */
  folioNumber?: string;
  holdingMode: HoldingMode;
  status: "OPEN" | "CLOSED";
  /** Set when this position is a side pocket carved out of another. */
  segregatedFromPositionId?: PositionId;
}

export type TransactionType =
  | "BUY" | "SELL"
  | "SWITCH_IN" | "SWITCH_OUT"      // a switch is a redemption + a purchase (trap §6.8)
  | "IDCW_PAYOUT" | "IDCW_REINVEST"
  | "BONUS" | "SPLIT"
  | "MERGER_IN" | "MERGER_OUT"
  | "SEGREGATION"
  | "RIGHTS"
  | "INTEREST_CREDIT" | "CONTRIBUTION" | "MATURITY"
  | "TRANSFER_IN" | "TRANSFER_OUT";

export interface Transaction {
  transactionId: TransactionId;
  accountId: AccountId;
  instrumentId: InstrumentId;
  folioNumber?: string;
  type: TransactionType;
  tradeDate: DateISO;
  /** Units transacted. For SPLIT this is unused; use `ratio`. */
  units?: number;
  /** NAV or price per unit. */
  pricePerUnit?: number;
  /** Gross rupee amount before charges. */
  amount?: number;
  /** Conversion / split ratio: new units per old unit. */
  ratio?: number;
  /** Counterparty instrument for switches and mergers. */
  relatedInstrumentId?: InstrumentId;
  /** Ties SWITCH_OUT to its SWITCH_IN, MERGER_OUT to MERGER_IN. */
  linkId?: string;
  stt?: number;
  stampDuty?: number;
  exitLoad?: number;
  tds?: number;
  /** Provenance: which ingested artifact produced this row. */
  sourceId?: string;
  /** Stable hash of the natural key, used for cross-source dedupe (trap §6.3). */
  dedupeKey?: string;
}

// ---------------------------------------------------------------------------
// Liabilities — required by net worth (spec §4.1)
// ---------------------------------------------------------------------------

export type LiabilityKind = "HOME_LOAN" | "PERSONAL_LOAN" | "AUTO_LOAN" | "EDUCATION_LOAN" | "CREDIT_CARD" | "LOAN_AGAINST_SECURITIES" | "OTHER";

export interface Liability {
  liabilityId: string;
  householdId: HouseholdId;
  memberId: MemberId;
  kind: LiabilityKind;
  lender: string;
  outstanding: number;
  annualRate?: number;
  emi?: number;
  asOf: DateISO;
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export type PriceSource = "AMFI" | "EXCHANGE" | "STATEMENT" | "USER_DECLARED" | "COMPUTED_ACCRUAL" | "GOLD_REFERENCE";

export interface PricePoint {
  instrumentId: InstrumentId;
  asOf: DateISO;
  price: number;
  source: PriceSource;
  /** Set when the scheme is suspended or the NAV is unpublished (trap §6.19). */
  suspended?: boolean;
}

// ---------------------------------------------------------------------------
// Statement balances — the reconciliation counterparty
// ---------------------------------------------------------------------------

/**
 * A closing balance as PRINTED on a statement, before we believe it.
 *
 * This is the independent figure the ledger is checked against (spec §2.3):
 * ingestion emits it, reconciliation compares our replayed lots to it. It
 * deliberately lives in the shared contract so the producer and the consumer
 * can never drift apart.
 *
 * Not to be confused with valuation's `ProviderBalance`, which is a balance
 * only the provider can know (a PPF passbook, an EPF statement, a ULIP fund
 * value) and is therefore an input to pricing rather than a thing to verify.
 */
export interface StatementBalance {
  accountId: AccountId;
  instrumentId: InstrumentId;
  folioNumber: string;
  asOf: DateISO;
  closingUnits: number;
  /** Absent when the statement prints units but no value (e.g. suspended NAV). */
  closingValue?: number;
  /** Artifact this balance was read from. */
  sourceId?: string;
}

// ---------------------------------------------------------------------------
// Valuation output (spec §3.1)
// ---------------------------------------------------------------------------

/** How a value was arrived at, so the copilot can explain it (spec §0). */
export type ValuationMethod =
  | "UNITS_X_NAV" | "QTY_X_CLOSE" | "ACCRUED_INTEREST" | "CLEAN_PRICE_PLUS_ACCRUED"
  | "AMORTISED_COST" | "STATEMENT_BALANCE" | "SGB_HIGHER_OF" | "USER_DECLARED"
  | "LAST_ROUND_PRICE" | "FUND_VALUE" | "UNVALUED";

export interface PositionValuation {
  positionId: PositionId;
  instrumentId: InstrumentId;
  accountId: AccountId;
  memberId: MemberId;
  units: number;
  price: number;
  value: number;
  investedCost: number;
  unrealisedGain: number;
  method: ValuationMethod;
  priceAsOf: DateISO;
  priceSource: PriceSource;
  /** True when the price is older than the staleness threshold (spec §2.3). */
  stalePrice: boolean;
  /** True for unlisted/ESOP/property — value is an estimate, not a mark. */
  illiquid: boolean;
  assetClass: AssetClass;
  instrumentType: InstrumentType;
  taxRegimeKey: TaxRegimeKey;
  notes?: string[];
}

export interface ValuationSnapshot {
  householdId: HouseholdId;
  asOf: DateISO;
  currency: string;
  positions: PositionValuation[];
  totalAssets: number;
  totalInvestedCost: number;
  totalUnrealisedGain: number;
  /** Set when any position could not be priced or is stale. */
  hasStalePrices: boolean;
  hasUnvaluedPositions: boolean;
}
