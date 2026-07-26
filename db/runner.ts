import type { SyncPorts } from "./ports.ts";
import type { SourceAdapter } from "../adapters/types.ts";
import { staleCutoff } from "./staleness.ts";

/**
 * The runner owns everything an adapter must not: the sync_run lifecycle, raw
 * artifact storage, error capture and retry. An adapter only fetches, parses
 * and persists.
 *
 * Order inside a run is a hard rule: the unmodified upstream payload is in
 * object storage with a raw_artifact row BEFORE the first byte is parsed, so
 * a parser bug never costs the evidence.
 */

export interface SyncResult {
  runId: string;
  status: "success" | "failed";
  ingested: number;
  skipped: number;
  error: string | null;
}

const FETCH_RETRIES = 2;

async function fetchWithRetry(adapter: SourceAdapter): Promise<{ payload: Buffer; contentType: string }> {
  let lastError: unknown;
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

export async function runSync(adapter: SourceAdapter, ports: SyncPorts, baseUrl: string): Promise<SyncResult> {
  const startedAt = ports.now().toISOString();
  await ports.db.ensureDataSource(adapter.code, "prices", baseUrl);
  const runId = await ports.db.createSyncRun(adapter.code, startedAt);

  try {
    const { payload, contentType } = await fetchWithRetry(adapter);

    const receivedAt = ports.now().toISOString();
    const storageKey = `raw/${adapter.code}/${receivedAt.slice(0, 10)}/${runId}`;
    await ports.storage.put(storageKey, payload, contentType);
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
