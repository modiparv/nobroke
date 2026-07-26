/**
 * GET /api/health/sources: last successful sync per data source, in the
 * standard read envelope. Reports not-provisioned honestly until the backing
 * services exist.
 */
export default async function handler(_req: any, res: any) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: ["data layer not provisioned: DATABASE_URL missing."],
    });
    return;
  }

  res.status(503).json({
    ok: false,
    data: null,
    as_of: null,
    sources: [],
    confidence: "stale",
    warnings: ["health query wiring pending: Postgres client not yet installed."],
  });
}
