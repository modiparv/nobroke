/**
 * Deployment mirror of the data layer runtime, as plain ESM JavaScript.
 *
 * Why this file exists: this project is ESM ("type": "module") and Vercel's
 * function builder does not bundle relative TypeScript imports here; the
 * runtime was left trying to import literal .ts paths that do not exist in
 * /var/task (ERR_MODULE_NOT_FOUND, seen in production logs twice). Plain JS
 * with explicit .js specifiers is the one shape node executes natively with
 * zero compiler involvement.
 *
 * The CANONICAL, TESTED sources live in db/*.ts and adapters/*.ts (224 tests
 * run against them). This file is those modules with the types stripped and
 * nothing else. If you change behaviour there, mirror it here.
 *
 * Files starting with an underscore are not exposed as endpoints.
 */
import { gzipSync } from "node:zlib";
import { Pool } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

// ---- db/pg.ts ----

export function resolveDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? null;
}

export function makePool() {
  const url = resolveDatabaseUrl();
  if (!url) throw new Error("no Postgres connection string (DATABASE_URL / POSTGRES_URL)");
  return new Pool({ connectionString: url });
}

export class PgDb {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureDataSource(code, kind, baseUrl) {
    await this.pool.query(
      `insert into data_source (code, kind, base_url, refresh_cadence)
       values ($1, $2::source_kind, $3, 'daily')
       on conflict (code) do nothing`,
      [code, kind, baseUrl],
    );
  }

  async createSyncRun(dataSourceCode, startedAt) {
    const res = await this.pool.query(
      `insert into sync_run (data_source_id, started_at)
       select id, $2::timestamptz from data_source where code = $1
       returning id`,
      [dataSourceCode, startedAt],
    );
    if (res.rows.length === 0) throw new Error(`unknown data_source ${dataSourceCode}`);
    return res.rows[0].id;
  }

  async finishSyncRun(id, patch) {
    await this.pool.query(
      `update sync_run
       set status = $2::sync_status, finished_at = $3::timestamptz,
           rows_ingested = $4, rows_skipped = $5, error_text = $6
       where id = $1`,
      [id, patch.status, patch.finishedAt, patch.rowsIngested, patch.rowsSkipped, patch.errorText],
    );
  }

  async insertRawArtifact(row) {
    await this.pool.query(
      `insert into raw_artifact (sync_run_id, storage_key, mime_type, byte_size, received_at)
       values ($1, $2, $3, $4, $5::timestamptz)`,
      [row.syncRunId, row.storageKey, row.mimeType, row.byteSize, row.receivedAt],
    );
  }

  async upsertInstruments(rows) {
    if (rows.length === 0) return { created: 0 };
    // A single multi-row statement cannot touch the same ISIN twice, so
    // dedupe within the batch, last row wins, mirroring sequential upserts.
    const byIsin = new Map();
    for (const r of rows) byIsin.set(r.isin, r);
    const unique = [...byIsin.values()];

    const params = [];
    const values = unique
      .map((r, i) => {
        params.push(r.isin, r.amfiCode, r.name, r.assetClass, r.instrumentType, r.taxRegimeKey);
        const b = i * 6;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::asset_class, $${b + 5}::instrument_type, $${b + 6}::tax_regime_key)`;
      })
      .join(",");

    const res = await this.pool.query(
      `insert into instrument (isin, amfi_code, name, asset_class, instrument_type, tax_regime_key)
       values ${values}
       on conflict (isin) where isin is not null do update set
         name = excluded.name,
         asset_class = excluded.asset_class,
         instrument_type = excluded.instrument_type,
         tax_regime_key = excluded.tax_regime_key,
         amfi_code = coalesce(instrument.amfi_code, excluded.amfi_code),
         updated_at = now()
       returning (xmax = 0) as created`,
      params,
    );
    return { created: res.rows.filter((r) => r.created).length };
  }

  async upsertPriceQuotes(rows) {
    if (rows.length === 0) return { created: 0 };
    const seen = new Map();
    for (const r of rows) seen.set(`${r.isin}|${r.asOf}|${r.source}`, r);
    const unique = [...seen.values()];

    const params = [];
    const values = unique
      .map((r, i) => {
        params.push(r.isin, r.asOf, r.price, r.source);
        const b = i * 4;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
      })
      .join(",");

    const res = await this.pool.query(
      `insert into price_quote (instrument_id, as_of, price, source)
       select i.id, v.as_of::date, v.price::numeric, v.source
       from (values ${values}) as v(isin, as_of, price, source)
       join instrument i on i.isin = v.isin
       on conflict (instrument_id, as_of, source) do update set price = excluded.price
       where price_quote.price is distinct from excluded.price
       returning (xmax = 0) as created`,
      params,
    );
    return { created: res.rows.filter((r) => r.created).length };
  }

  async markQuotesStaleOnOrBefore(cutoff) {
    const res = await this.pool.query(
      `with flipped as (
         update price_quote set is_stale = true
         where is_stale = false and as_of <= $1::date
         returning 1
       ) select count(*)::int as n from flipped`,
      [cutoff],
    );
    return res.rows[0].n;
  }

  async lastSuccessfulSyncs() {
    const res = await this.pool.query(
      `select ds.code, max(sr.finished_at) as finished_at
       from sync_run sr join data_source ds on ds.id = sr.data_source_id
       where sr.status = 'success'
       group by ds.code`,
    );
    return res.rows.map((r) => ({ dataSourceCode: r.code, finishedAt: new Date(r.finished_at).toISOString() }));
  }
}

// ---- db/blob.ts ----

/** The Blob store's read-write token: the classic name, or any custom-prefix
 *  variant the newer store connections create (<PREFIX>_READ_WRITE_TOKEN).
 *  Values pasted from .env snippets arrive wrapped in quotes or as a whole
 *  KEY=value line; both are cleaned up rather than rejected. */
export function resolveBlobToken() {
  const raw = process.env.BLOB_READ_WRITE_TOKEN ?? (() => {
    const key = Object.keys(process.env).find((n) => n.endsWith("_READ_WRITE_TOKEN"));
    return key ? process.env[key] : null;
  })();
  if (!raw) return null;
  let v = raw.trim();
  if (/READ_WRITE_TOKEN\s*=/.test(v)) v = v.slice(v.indexOf("=") + 1).trim();
  v = v.replace(/^["']+|["']+$/g, "").trim();
  return v || null;
}

/** Shape of the token for diagnostics: prefix validity and length, never the
 *  value. The vercel_blob_rw_ prefix is the product's public convention. */
export function blobTokenShape() {
  const v = resolveBlobToken();
  if (!v) return "absent";
  return `${v.startsWith("vercel_blob_rw_") ? "has" : "does NOT have"} the vercel_blob_rw_ prefix, length ${v.length}`;
}

export class BlobStorage {
  constructor(token) {
    this.token = token;
  }

  /** Adapts to the store's access mode. A private store is the better home
   *  for raw artifacts (Phase 2 holds user statements), so private is tried
   *  whenever the store refuses public. */
  async put(key, payload, contentType) {
    const base = { contentType, addRandomSuffix: false, ...(this.token ? { token: this.token } : {}) };
    try {
      const res = await put(key, payload, { access: "public", ...base });
      return res.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/private/i.test(msg)) throw err;
      const res = await put(key, payload, { access: "private", ...base });
      return res.url;
    }
  }
}

// ---- db/artifacts.ts ----

/** Raw payloads in Postgres (gzipped bytea) so archive-before-parse holds
 *  even when no object store is writable. byte_size is the ORIGINAL size. */
export class PgArtifactStorage {
  constructor(pool) {
    this.pool = pool;
  }

  async put(key, payload, contentType) {
    const storageKey = `pg://raw_payload/${key}`;
    await this.pool.query(
      `insert into raw_payload (storage_key, payload, content_type, encoding, byte_size)
       values ($1, $2, $3, 'gzip', $4)
       on conflict (storage_key) do nothing`,
      [storageKey, gzipSync(payload), contentType, payload.length],
    );
    return storageKey;
  }
}

/** Prefers the primary store; falls back and remembers that it did, so the
 *  caller surfaces the degradation as a warning instead of hiding it. */
export class FallbackStorage {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback;
    this.fellBackWith = null;
  }

  async put(key, payload, contentType) {
    try {
      return await this.primary.put(key, payload, contentType);
    } catch (err) {
      this.fellBackWith = err instanceof Error ? err.message : String(err);
      return this.fallback.put(key, payload, contentType);
    }
  }
}

// ---- db/staleness.ts ----

function dayNumber(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function isWeekday(day) {
  const dow = (day + 4) % 7;
  return dow >= 1 && dow <= 5;
}

export function staleCutoff(todayIso, maxTradingDays = 2) {
  let day = dayNumber(todayIso);
  let remaining = maxTradingDays;
  while (remaining > 0) {
    day--;
    if (isWeekday(day)) remaining--;
  }
  day--;
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

// ---- adapters/amfi.ts ----

export const AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toIsoDate(raw) {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function cleanIsin(raw) {
  const v = raw.trim();
  return /^IN[A-Z0-9]{10}$/.test(v) ? v : null;
}

export function classifySection(header) {
  const h = header.toLowerCase();
  const etf = /\betf\b|exchange traded/.test(h);
  if (/gold/.test(h)) {
    return { assetClass: "gold", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: etf ? "GOLD_ETF" : "GOLD_FUND" };
  }
  if (/silver/.test(h)) return { assetClass: "silver", instrumentType: etf ? "etf" : "mutual_fund", taxRegimeKey: "OTHER" };
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

function* iterateLines(payload) {
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

export async function* parseAmfi(payload) {
  let section = { assetClass: "other", instrumentType: "mutual_fund", taxRegimeKey: "OTHER" };

  for (const rawLine of iterateLines(payload)) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (!line.includes(";")) {
      if (/schemes?\s*\(/i.test(line)) section = classifySection(line);
      continue;
    }
    if (line.toLowerCase().startsWith("scheme code")) continue;

    const fields = line.split(";");
    if (fields.length < 6) {
      yield { kind: "skip", reason: "malformed", line };
      continue;
    }
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

    const base = { kind: "row", ...section, nav: navRaw, asOf };
    const first = isinPrimary ?? isinReinvest;
    yield { ...base, isin: first, amfiCode, name };
    if (isinPrimary && isinReinvest) {
      yield { ...base, isin: isinReinvest, amfiCode: null, name: `${name} (Reinvestment)` };
    }
  }
}

export function amfiAdapter(ports) {
  return {
    code: "amfi",

    async fetch() {
      const res = await fetch(AMFI_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/plain,*/*",
        },
      });
      if (!res.ok) throw new Error(`AMFI fetch failed: ${res.status}`);
      return { payload: Buffer.from(await res.arrayBuffer()), contentType: "text/plain" };
    },

    parse: parseAmfi,

    async persist(rows) {
      const CHUNK = 500;
      let ingested = 0;
      let skipped = 0;
      let buffer = [];

      const flush = async () => {
        if (buffer.length === 0) return;
        await ports.db.upsertInstruments(
          buffer.map((r) => ({
            isin: r.isin,
            amfiCode: r.amfiCode,
            name: r.name,
            assetClass: r.assetClass,
            instrumentType: r.instrumentType,
            taxRegimeKey: r.taxRegimeKey,
          })),
        );
        const quotes = await ports.db.upsertPriceQuotes(
          buffer.map((r) => ({ isin: r.isin, asOf: r.asOf, price: r.nav, source: "amfi" })),
        );
        ingested += quotes.created;
        buffer = [];
      };

      for await (const row of rows) {
        if (row.kind === "skip") {
          skipped++;
          continue;
        }
        buffer.push(row);
        if (buffer.length >= CHUNK) await flush();
      }
      await flush();
      return { ingested, skipped };
    },
  };
}

// ---- db/runner.ts ----

const FETCH_RETRIES = 2;

async function fetchWithRetry(adapter) {
  let lastError;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      return await adapter.fetch();
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  throw lastError;
}

export async function runSync(adapter, ports, baseUrl) {
  const startedAt = ports.now().toISOString();
  await ports.db.ensureDataSource(adapter.code, "prices", baseUrl);
  const runId = await ports.db.createSyncRun(adapter.code, startedAt);

  try {
    const { payload, contentType } = await fetchWithRetry(adapter);

    const receivedAt = ports.now().toISOString();
    const storageKey = await ports.storage.put(
      `raw/${adapter.code}/${receivedAt.slice(0, 10)}/${runId}`,
      payload,
      contentType,
    );
    await ports.db.insertRawArtifact({
      syncRunId: runId,
      storageKey,
      mimeType: contentType,
      byteSize: payload.length,
      receivedAt,
    });

    const { ingested, skipped } = await adapter.persist(adapter.parse(payload));

    await ports.db.markQuotesStaleOnOrBefore(staleCutoff(ports.now().toISOString().slice(0, 10)));

    await ports.db.finishSyncRun(runId, {
      status: "success",
      finishedAt: ports.now().toISOString(),
      rowsIngested: ingested,
      rowsSkipped: skipped,
      errorText: null,
    });
    return { runId, status: "success", ingested, skipped, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ports.db.finishSyncRun(runId, {
      status: "failed",
      finishedAt: ports.now().toISOString(),
      rowsIngested: 0,
      rowsSkipped: 0,
      errorText: message,
    });
    return { runId, status: "failed", ingested: 0, skipped: 0, error: message };
  }
}
