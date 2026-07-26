import type { SyncPorts } from "../db/ports.ts";
import type { ParsedInstrumentRow, ParsedRow, SourceAdapter } from "./types.ts";

/**
 * AMFI daily NAV file: https://www.amfiindia.com/spages/NAVAll.txt
 *
 * ~10MB of semicolon-delimited text (the spec said pipe; the live file uses
 * semicolons) with three kinds of non-data lines interleaved: a column header,
 * scheme-category section headers like "Open Ended Schemes(Equity Scheme -
 * Flexi Cap Fund)", and bare AMC names. Data rows are:
 *
 *   scheme code;ISIN payout/growth;ISIN reinvestment;scheme name;NAV;date
 *
 * The section header is load-bearing: it carries the SEBI category, which is
 * where asset class comes from. One scheme code can carry two ISINs (payout
 * and reinvestment variants); each ISIN becomes its own instrument, and the
 * AMFI code stays on the primary variant because it is unique in the master.
 */

export const AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toIsoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function cleanIsin(raw: string): string | null {
  const v = raw.trim();
  return /^IN[A-Z0-9]{10}$/.test(v) ? v : null;
}

type Section = Pick<ParsedInstrumentRow, "assetClass" | "instrumentType" | "taxRegimeKey">;

/** Classify a section header. Tax regime is assigned here per category, never
 *  derived from asset class downstream: gold ETFs and gold funds share an
 *  asset class but not a tax treatment. Hybrids tax by their equity share,
 *  which a NAV file cannot reveal, so they carry OTHER until enriched. */
export function classifySection(header: string): Section {
  const h = header.toLowerCase();
  const etf = /\betf\b|exchange traded/.test(h);
  if (/gold/.test(h)) {
    return { assetClass: "gold", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: etf ? "GOLD_ETF" : "GOLD_FUND" };
  }
  if (/silver/.test(h)) return { assetClass: "silver", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: "OTHER" };
  // Hybrid before equity: "Hybrid Scheme - Equity Savings" must land in hybrid.
  if (/hybrid|balanced|arbitrage|equity savings|multi asset/.test(h)) {
    return { assetClass: "hybrid", instrumentType: "mutual_fund", taxRegimeKey: "OTHER" };
  }
  if (/equity|elss|index fund/.test(h)) {
    return { assetClass: "equity", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: "EQUITY_MF" };
  }
  if (/debt|gilt|liquid|overnight|money market|floater|duration|corporate bond|credit risk|banking and psu|income/.test(h)) {
    return { assetClass: "debt", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: "DEBT_MF" };
  }
  return { assetClass: "other", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: "OTHER" };
}

/** Walk the buffer newline by newline without materialising the whole file as
 *  one string or an array of lines. */
function* iterateLines(payload: Buffer): Generator<string> {
  let start = 0;
  while (start < payload.length) {
    let end = payload.indexOf(0x0a, start);
    if (end === -1) end = payload.length;
    let sliceEnd = end;
    if (sliceEnd > start && payload[sliceEnd - 1] === 0x0d) sliceEnd--;
    yield payload.toString("utf8", start, sliceEnd);
    start = end + 1;
  }
}

export async function* parseAmfi(payload: Buffer): AsyncIterable<ParsedRow> {
  let section: Section = { assetClass: "other", instrumentType: "mutual_fund", taxRegimeKey: "OTHER" };

  for (const rawLine of iterateLines(payload)) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (!line.includes(";")) {
      // Structural line: the column header, a section header, or an AMC name.
      if (/schemes?\s*\(/i.test(line)) section = classifySection(line);
      continue;
    }
    if (line.toLowerCase().startsWith("scheme code")) continue;

    const fields = line.split(";");
    if (fields.length < 6) {
      yield { kind: "skip", reason: "malformed", line };
      continue;
    }
    // Defensive against semicolons inside scheme names: fixed columns at both
    // ends, the name is whatever sits between them.
    const amfiCode = fields[0].trim() || null;
    const isinPrimary = cleanIsin(fields[1]);
    const isinReinvest = cleanIsin(fields[2]);
    const name = fields.slice(3, fields.length - 2).join(";").trim();
    const navRaw = fields[fields.length - 2].trim();
    const asOf = toIsoDate(fields[fields.length - 1]);

    if (!isinPrimary && !isinReinvest) {
      yield { kind: "skip", reason: "missing_isin", line };
      continue;
    }
    if (!/^\d+(\.\d+)?$/.test(navRaw) || asOf === null) {
      yield { kind: "skip", reason: "bad_nav", line };
      continue;
    }

    const base = { kind: "row" as const, ...section, nav: navRaw, asOf };
    const first = isinPrimary ?? isinReinvest!;
    yield { ...base, isin: first, amfiCode, name };
    if (isinPrimary && isinReinvest) {
      // The sibling variant is its own instrument; the AMFI code stays on the
      // primary because amfi_code is unique in the master.
      yield { ...base, isin: isinReinvest, amfiCode: null, name: `${name} (Reinvestment)` };
    }
  }
}

export function amfiAdapter(ports: SyncPorts): SourceAdapter {
  return {
    code: "amfi",

    async fetch() {
      const res = await fetch(AMFI_URL, {
        headers: {
          // AMFI serves browsers; a bare runtime UA gets intermittently blocked.
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/plain,*/*",
        },
      });
      if (!res.ok) throw new Error(`AMFI fetch failed: ${res.status}`);
      return { payload: Buffer.from(await res.arrayBuffer()), contentType: "text/plain" };
    },

    parse: parseAmfi,

    async persist(rows) {
      let ingested = 0;
      let skipped = 0;
      for await (const row of rows) {
        if (row.kind === "skip") {
          skipped++;
          continue;
        }
        await ports.db.upsertInstrument({
          isin: row.isin,
          amfiCode: row.amfiCode,
          name: row.name,
          assetClass: row.assetClass,
          instrumentType: row.instrumentType,
          taxRegimeKey: row.taxRegimeKey,
        });
        const quote = await ports.db.upsertPriceQuote({
          isin: row.isin,
          asOf: row.asOf,
          price: row.nav,
          source: "amfi",
        });
        if (quote.created) ingested++;
      }
      return { ingested, skipped };
    },
  };
}
