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

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers?.authorization as string | undefined) ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const hasDb = !!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING);
  const missing = [
    ...(hasDb ? [] : ["a Postgres URL (DATABASE_URL / POSTGRES_URL)"]),
    ...(process.env.BLOB_READ_WRITE_TOKEN ? [] : ["BLOB_READ_WRITE_TOKEN"]),
  ];
  if (missing.length > 0) {
    res.status(503).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: [`data layer not provisioned: missing ${missing.join(", ")}. No sync attempted.`],
    });
    return;
  }

  const [{ makePool, PgDb }, { BlobStorage }, { amfiAdapter, AMFI_URL }, { runSync }] = await Promise.all([
    import("../../db/pg.ts"),
    import("../../db/blob.ts"),
    import("../../adapters/amfi.ts"),
    import("../../db/runner.ts"),
  ]);

  const pool = makePool();
  const ports = { db: new PgDb(pool), storage: new BlobStorage(), now: () => new Date() };
  try {
    const result = await runSync(amfiAdapter(ports), ports, AMFI_URL);
    res.status(result.status === "success" ? 200 : 502).json({
      ok: result.status === "success",
      data: { runId: result.runId, ingested: result.ingested, skipped: result.skipped },
      as_of: new Date().toISOString(),
      sources: ["amfi"],
      confidence: result.status === "success" ? "high" : "stale",
      warnings: result.error ? [result.error] : [],
    });
  } finally {
    await pool.end();
  }
}
