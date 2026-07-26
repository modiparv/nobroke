import {
  amfiAdapter,
  AMFI_URL,
  BlobStorage,
  blobTokenShape,
  makePool,
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

  const blobToken = resolveBlobToken();
  const missing = [
    ...(resolveDatabaseUrl() ? [] : ["a Postgres URL (DATABASE_URL / POSTGRES_URL)"]),
    ...(blobToken ? [] : ["a Blob read-write token (BLOB_READ_WRITE_TOKEN or *_READ_WRITE_TOKEN)"]),
  ];
  if (missing.length > 0) {
    // Env NAMES only, never values: shows what the store connection actually
    // created so a rename never needs another guessing round.
    const blobEnvSeen = Object.keys(process.env).filter((n) => n.includes("BLOB")).sort();
    res.status(503).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: [
        `data layer not provisioned: missing ${missing.join(", ")}. No sync attempted.`,
        `blob-related env names present: ${blobEnvSeen.join(", ") || "(none)"}`,
      ],
    });
    return;
  }

  let pool = null;
  try {
    pool = makePool();
    const ports = { db: new PgDb(pool), storage: new BlobStorage(blobToken), now: () => new Date() };
    const result = await runSync(amfiAdapter(ports), ports, AMFI_URL);
    const warnings = result.error ? [result.error] : [];
    // A Blob failure with a token present is nearly always a polluted paste;
    // describe the token's shape (never its value) so the fix is obvious.
    if (result.error && /blob/i.test(result.error)) warnings.push(`blob token: ${blobTokenShape()}`);
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
