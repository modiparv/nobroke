import { Pool } from "@neondatabase/serverless";
import type { DbPort, InstrumentUpsert, PriceQuoteUpsert, SyncStatus } from "./ports.ts";

/**
 * Postgres implementation of DbPort over Neon's serverless driver (pg-wire
 * over WebSocket, standard pg API, no native deps). This module is imported
 * only by API handlers running on Vercel where the dependency is installed;
 * local tests use db/memory.ts against the same port contract.
 *
 * All prices travel as decimal strings and land in numeric columns; nothing
 * here ever converts money through a float.
 */

export class PgDb implements DbPort {
  constructor(private pool: Pool) {}

  async ensureDataSource(code: string, kind: string, baseUrl: string): Promise<void> {
    await this.pool.query(
      `insert into data_source (code, kind, base_url, refresh_cadence)
       values ($1, $2::source_kind, $3, 'daily')
       on conflict (code) do nothing`,
      [code, kind, baseUrl],
    );
  }

  async createSyncRun(dataSourceCode: string, startedAt: string): Promise<string> {
    const res = await this.pool.query(
      `insert into sync_run (data_source_id, started_at)
       select id, $2::timestamptz from data_source where code = $1
       returning id`,
      [dataSourceCode, startedAt],
    );
    if (res.rows.length === 0) throw new Error(`unknown data_source ${dataSourceCode}`);
    return res.rows[0].id as string;
  }

  async finishSyncRun(
    id: string,
    patch: { status: SyncStatus; finishedAt: string; rowsIngested: number; rowsSkipped: number; errorText: string | null },
  ): Promise<void> {
    await this.pool.query(
      `update sync_run
       set status = $2::sync_status, finished_at = $3::timestamptz,
           rows_ingested = $4, rows_skipped = $5, error_text = $6
       where id = $1`,
      [id, patch.status, patch.finishedAt, patch.rowsIngested, patch.rowsSkipped, patch.errorText],
    );
  }

  async insertRawArtifact(row: {
    syncRunId: string;
    storageKey: string;
    mimeType: string;
    byteSize: number;
    receivedAt: string;
  }): Promise<void> {
    await this.pool.query(
      `insert into raw_artifact (sync_run_id, storage_key, mime_type, byte_size, received_at)
       values ($1, $2, $3, $4, $5::timestamptz)`,
      [row.syncRunId, row.storageKey, row.mimeType, row.byteSize, row.receivedAt],
    );
  }

  async upsertInstruments(rows: InstrumentUpsert[]): Promise<{ created: number }> {
    if (rows.length === 0) return { created: 0 };
    // A single multi-row statement cannot touch the same ISIN twice
    // ("ON CONFLICT DO UPDATE cannot affect row a second time"), so dedupe
    // within the batch, last row wins, mirroring sequential upserts.
    const byIsin = new Map<string, InstrumentUpsert>();
    for (const r of rows) byIsin.set(r.isin, r);
    const unique = [...byIsin.values()];

    const params: unknown[] = [];
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
    return { created: res.rows.filter((r: { created: boolean }) => r.created).length };
  }

  async upsertPriceQuotes(rows: PriceQuoteUpsert[]): Promise<{ created: number }> {
    if (rows.length === 0) return { created: 0 };
    const seen = new Map<string, PriceQuoteUpsert>();
    for (const r of rows) seen.set(`${r.isin}|${r.asOf}|${r.source}`, r);
    const unique = [...seen.values()];

    const params: unknown[] = [];
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
    return { created: res.rows.filter((r: { created: boolean }) => r.created).length };
  }

  async markQuotesStaleOnOrBefore(cutoff: string): Promise<number> {
    const res = await this.pool.query(
      `with flipped as (
         update price_quote set is_stale = true
         where is_stale = false and as_of <= $1::date
         returning 1
       ) select count(*)::int as n from flipped`,
      [cutoff],
    );
    return res.rows[0].n as number;
  }

  async lastSuccessfulSyncs(): Promise<Array<{ dataSourceCode: string; finishedAt: string }>> {
    const res = await this.pool.query(
      `select ds.code, max(sr.finished_at) as finished_at
       from sync_run sr join data_source ds on ds.id = sr.data_source_id
       where sr.status = 'success'
       group by ds.code`,
    );
    return res.rows.map((r: { code: string; finished_at: Date }) => ({
      dataSourceCode: r.code,
      finishedAt: new Date(r.finished_at).toISOString(),
    }));
  }
}

/** The Neon/Vercel integration names the connection string differently across
 *  versions; accept the common spellings so provisioning "just works". */
export function resolveDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? null;
}

export function makePool(): Pool {
  const url = resolveDatabaseUrl();
  if (!url) throw new Error("no Postgres connection string (DATABASE_URL / POSTGRES_URL)");
  return new Pool({ connectionString: url });
}
