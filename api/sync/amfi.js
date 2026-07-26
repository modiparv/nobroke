import {
  amfiAdapter,
  AMFI_URL,
  BlobStorage,
  blobTokenShape,
  FallbackStorage,
  makePool,
  PgArtifactStorage,
  PgDb,
  resolveBlobToken,
  resolveDatabaseUrl,
  runSync,
} from "../_data.js";

/**
 * Nightly AMFI sync (Vercel cron, see vercel.json), also runnable by hand:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/sync/amfi
 *
 * Ingestion never runs inside a user request; this endpoint exists for the
 * scheduler. The runner archives the raw payload before parsing, and a dead
 * upstream ends as a failed sync_run row, never a hang.
 */
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  if (!resolveDatabaseUrl()) {
    res.status(503).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: ["data layer not provisioned: no Postgres URL (DATABASE_URL / POSTGRES_URL). No sync attempted."],
    });
    return;
  }

  let pool = null;
  try {
    pool = makePool();
    // Raw artifacts prefer object storage; Postgres (gzipped bytea) is the
    // always-available fallback so the archive-before-parse rule never
    // blocks a sync. Falling back is reported, not hidden.
    const blobToken = resolveBlobToken();
    const pgStore = new PgArtifactStorage(pool);
    const storage = blobToken ? new FallbackStorage(new BlobStorage(blobToken), pgStore) : pgStore;
    const ports = { db: new PgDb(pool), storage, now: () => new Date() };
    const result = await runSync(amfiAdapter(ports), ports, AMFI_URL);
    const warnings = result.error ? [result.error] : [];
    if (result.error && /blob/i.test(result.error)) warnings.push(`blob token: ${blobTokenShape()}`);
    if (storage.fellBackWith) warnings.push(`raw artifact stored in Postgres fallback; object storage said: ${storage.fellBackWith}`);
    if (!blobToken) warnings.push("no Blob token configured; raw artifacts go to the Postgres fallback");
    res.status(result.status === "success" ? 200 : 502).json({
      ok: result.status === "success",
      data: { runId: result.runId, ingested: result.ingested, skipped: result.skipped },
      as_of: new Date().toISOString(),
      sources: ["amfi"],
      confidence: result.status === "success" ? "high" : "stale",
      warnings,
    });
  } catch (err) {
    console.error("sync/amfi failed", err);
    res.status(500).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: [err instanceof Error ? err.message : String(err)],
    });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
