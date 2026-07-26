/**
 * Nightly AMFI sync trigger (Vercel cron, see vercel.json). Ingestion never
 * runs inside a user request; this endpoint exists for the scheduler and for
 * manual kicks with the same secret.
 *
 * Until the backing services exist (Postgres via DATABASE_URL, object storage
 * via BLOB_READ_WRITE_TOKEN) this reports not-provisioned honestly instead of
 * pretending: no external call is made and nothing claims success.
 */
export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers?.authorization as string | undefined) ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const missing = ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"].filter((k) => !process.env[k]);
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

  // Postgres and blob-storage port implementations land once their client
  // dependencies are approved; the runner and adapter behind this endpoint
  // are already built and tested against the same ports.
  res.status(503).json({
    ok: false,
    data: null,
    as_of: null,
    sources: [],
    confidence: "stale",
    warnings: ["sync runner wiring pending: Postgres/storage clients not yet installed."],
  });
}
