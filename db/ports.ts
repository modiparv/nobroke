/**
 * Ports between the sync machinery and its backing services. The runner and
 * adapters speak only these interfaces; db/memory.ts implements them for
 * tests, and a Postgres + object-storage implementation slots in behind the
 * same contract once the instances exist. Nothing above this line may know
 * which one it is talking to.
 *
 * Money discipline (constraint: numeric, never float): every price crosses
 * these ports as a decimal string exactly as parsed from the source. No port
 * method accepts a floating-point amount.
 */

export type SyncStatus = "running" | "success" | "failed";
export type AssetClass = "equity" | "debt" | "gold" | "silver" | "hybrid" | "cash" | "real_estate" | "other";
export type InstrumentType =
  | "mutual_fund"
  | "etf"
  | "stock"
  | "bond"
  | "sgb"
  | "fd"
  | "epf"
  | "ppf"
  | "nps"
  | "physical"
  | "other";
export type TaxRegimeKey =
  | "EQUITY_MF"
  | "EQUITY_LISTED"
  | "DEBT_MF"
  | "GOLD_ETF"
  | "GOLD_FUND"
  | "PHYSICAL_GOLD"
  | "SGB"
  | "FD_INTEREST"
  | "EPF"
  | "PPF"
  | "NPS"
  | "OTHER";

export interface InstrumentUpsert {
  isin: string;
  amfiCode: string | null;
  name: string;
  assetClass: AssetClass;
  instrumentType: InstrumentType;
  taxRegimeKey: TaxRegimeKey;
}

export interface PriceQuoteUpsert {
  isin: string;
  /** ISO date the price is for. */
  asOf: string;
  /** Decimal string, e.g. "103.9014". Never a float. */
  price: string;
  source: string;
}

export interface SyncRunRow {
  id: string;
  dataSourceCode: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncStatus;
  rowsIngested: number;
  rowsSkipped: number;
  errorText: string | null;
}

export interface DbPort {
  ensureDataSource(code: string, kind: string, baseUrl: string): Promise<void>;
  createSyncRun(dataSourceCode: string, startedAt: string): Promise<string>;
  finishSyncRun(
    id: string,
    patch: { status: SyncStatus; finishedAt: string; rowsIngested: number; rowsSkipped: number; errorText: string | null },
  ): Promise<void>;
  insertRawArtifact(row: {
    syncRunId: string;
    storageKey: string;
    mimeType: string;
    byteSize: number;
    receivedAt: string;
  }): Promise<void>;
  /**
   * Insert or update a batch on the ISIN unique key. Batched because the AMFI
   * file carries tens of thousands of rows and a round trip per row would not
   * fit a serverless window. Returns how many rows were newly created.
   */
  upsertInstruments(rows: InstrumentUpsert[]): Promise<{ created: number }>;
  /**
   * Insert a batch on (instrument_id, as_of, source); identical existing rows
   * are no-ops so re-running a sync changes nothing. Returns how many quotes
   * were newly created.
   */
  upsertPriceQuotes(rows: PriceQuoteUpsert[]): Promise<{ created: number }>;
  /** Flag quotes dated on/before the cutoff (ISO date) as stale. Returns count flipped. */
  markQuotesStaleOnOrBefore(cutoff: string): Promise<number>;
  lastSuccessfulSyncs(): Promise<Array<{ dataSourceCode: string; finishedAt: string }>>;
}

export interface StoragePort {
  /** Write the unmodified upstream payload. Returns the storage key. */
  put(key: string, payload: Buffer, contentType: string): Promise<string>;
}

export interface SyncPorts {
  db: DbPort;
  storage: StoragePort;
  now(): Date;
}
