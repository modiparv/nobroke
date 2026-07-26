/**
 * External sources are reached only through adapters in this directory: an
 * adapter fetches one source, parses its payload, and writes into our own
 * tables through the ports. No file outside /adapters calls an external URL.
 *
 * The runner (db/runner.ts) owns the sync_run lifecycle, raw artifact
 * storage, error capture and retry; adapters contain no scheduling or storage
 * logic.
 */

export interface ParsedInstrumentRow {
  kind: "row";
  isin: string;
  amfiCode: string | null;
  name: string;
  /** Asset class inferred from the source's own section structure. */
  assetClass: "equity" | "debt" | "gold" | "silver" | "hybrid" | "other";
  instrumentType: "mutual_fund" | "etf";
  taxRegimeKey: "EQUITY_MF" | "DEBT_MF" | "GOLD_ETF" | "GOLD_FUND" | "OTHER";
  /** Decimal string exactly as published. Never a float. */
  nav: string;
  /** ISO date. */
  asOf: string;
}

/** A data-shaped line that could not be used: counted, never silently dropped. */
export interface SkippedRow {
  kind: "skip";
  reason: "missing_isin" | "bad_nav" | "malformed";
  line: string;
}

export type ParsedRow = ParsedInstrumentRow | SkippedRow;

export interface SourceAdapter {
  code: string;
  fetch(): Promise<{ payload: Buffer; contentType: string }>;
  parse(payload: Buffer): AsyncIterable<ParsedRow>;
  persist(rows: AsyncIterable<ParsedRow>): Promise<{ ingested: number; skipped: number }>;
}
