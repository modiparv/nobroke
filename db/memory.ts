import type { DbPort, InstrumentUpsert, PriceQuoteUpsert, StoragePort, SyncRunRow, SyncStatus } from "./ports.ts";

/**
 * In-memory implementation of the ports, used by tests and by nothing else.
 * It enforces exactly the unique keys the Postgres DDL declares, so the tests
 * that pass against it are testing the same idempotency rules the database
 * will enforce. Archive-never-delete holds here too: nothing is ever removed.
 */

interface InstrumentRow extends InstrumentUpsert {
  id: string;
}
interface QuoteRow {
  instrumentId: string;
  asOf: string;
  price: string;
  source: string;
  isStale: boolean;
}

export class MemoryDb implements DbPort {
  dataSources = new Map<string, { code: string; kind: string; baseUrl: string }>();
  syncRuns: SyncRunRow[] = [];
  rawArtifacts: Array<{ syncRunId: string; storageKey: string; mimeType: string; byteSize: number; receivedAt: string }> = [];
  instrumentsByIsin = new Map<string, InstrumentRow>();
  quotes: QuoteRow[] = [];
  private nextId = 1;

  private id(prefix: string): string {
    return `${prefix}_${this.nextId++}`;
  }

  async ensureDataSource(code: string, kind: string, baseUrl: string): Promise<void> {
    if (!this.dataSources.has(code)) this.dataSources.set(code, { code, kind, baseUrl });
  }

  async createSyncRun(dataSourceCode: string, startedAt: string): Promise<string> {
    const row: SyncRunRow = {
      id: this.id("run"),
      dataSourceCode,
      startedAt,
      finishedAt: null,
      status: "running",
      rowsIngested: 0,
      rowsSkipped: 0,
      errorText: null,
    };
    this.syncRuns.push(row);
    return row.id;
  }

  async finishSyncRun(
    id: string,
    patch: { status: SyncStatus; finishedAt: string; rowsIngested: number; rowsSkipped: number; errorText: string | null },
  ): Promise<void> {
    const row = this.syncRuns.find((r) => r.id === id);
    if (!row) throw new Error(`unknown sync_run ${id}`);
    row.status = patch.status;
    row.finishedAt = patch.finishedAt;
    row.rowsIngested = patch.rowsIngested;
    row.rowsSkipped = patch.rowsSkipped;
    row.errorText = patch.errorText;
  }

  async insertRawArtifact(row: {
    syncRunId: string;
    storageKey: string;
    mimeType: string;
    byteSize: number;
    receivedAt: string;
  }): Promise<void> {
    if (this.rawArtifacts.some((a) => a.storageKey === row.storageKey))
      throw new Error(`duplicate raw_artifact storage_key ${row.storageKey}`);
    this.rawArtifacts.push(row);
  }

  async upsertInstruments(rows: InstrumentUpsert[]): Promise<{ created: number }> {
    let created = 0;
    for (const row of rows) {
      const existing = this.instrumentsByIsin.get(row.isin);
      if (existing) {
        // amfi_code is unique where not null: never move it onto a second row.
        const amfiCode = existing.amfiCode ?? row.amfiCode;
        Object.assign(existing, row, { amfiCode });
        continue;
      }
      if (row.amfiCode != null) {
        for (const other of this.instrumentsByIsin.values()) {
          if (other.amfiCode === row.amfiCode) throw new Error(`amfi_code ${row.amfiCode} already on another instrument`);
        }
      }
      this.instrumentsByIsin.set(row.isin, { ...row, id: this.id("ins") });
      created++;
    }
    return { created };
  }

  async upsertPriceQuotes(rows: PriceQuoteUpsert[]): Promise<{ created: number }> {
    let created = 0;
    for (const row of rows) {
      const instrument = this.instrumentsByIsin.get(row.isin);
      if (!instrument) throw new Error(`price for unknown isin ${row.isin}`);
      const existing = this.quotes.find(
        (q) => q.instrumentId === instrument.id && q.asOf === row.asOf && q.source === row.source,
      );
      if (existing) {
        existing.price = row.price;
        continue;
      }
      this.quotes.push({ instrumentId: instrument.id, asOf: row.asOf, price: row.price, source: row.source, isStale: false });
      created++;
    }
    return { created };
  }

  async markQuotesStaleOnOrBefore(cutoff: string): Promise<number> {
    let flipped = 0;
    for (const q of this.quotes) {
      if (!q.isStale && q.asOf <= cutoff) {
        q.isStale = true;
        flipped++;
      }
    }
    return flipped;
  }

  async lastSuccessfulSyncs(): Promise<Array<{ dataSourceCode: string; finishedAt: string }>> {
    const latest = new Map<string, string>();
    for (const r of this.syncRuns) {
      if (r.status !== "success" || !r.finishedAt) continue;
      const prev = latest.get(r.dataSourceCode);
      if (!prev || r.finishedAt > prev) latest.set(r.dataSourceCode, r.finishedAt);
    }
    return [...latest].map(([dataSourceCode, finishedAt]) => ({ dataSourceCode, finishedAt }));
  }
}

export class MemoryStorage implements StoragePort {
  objects = new Map<string, { payload: Buffer; contentType: string }>();

  async put(key: string, payload: Buffer, contentType: string): Promise<string> {
    this.objects.set(key, { payload, contentType });
    return key;
  }
}
