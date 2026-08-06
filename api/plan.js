import { makePool, resolveDatabaseUrl } from "./_data.js";
import { sessionUserId } from "./_auth.js";

/** The signed-in user's plan, as one JSON state blob: GET loads it, PUT
 *  saves it. The client keeps localStorage as its offline cache; the server
 *  copy is what survives a new device. */
const MAX_STATE_BYTES = 256 * 1024;

export default async function handler(req, res) {
  const userId = sessionUserId(req);
  if (!userId || !resolveDatabaseUrl()) {
    res.status(401).json({ ok: false, error: "not signed in" });
    return;
  }

  let pool = null;
  try {
    pool = makePool();

    if (req.method === "GET") {
      const found = await pool.query(`select state, updated_at from user_plan where user_id = $1`, [userId]);
      const row = found.rows[0];
      res.status(200).json({ ok: true, state: row?.state ?? null, updated_at: row?.updated_at ?? null });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      const state = req.body?.state;
      if (typeof state !== "object" || state === null || Array.isArray(state)) {
        res.status(400).json({ ok: false, error: "state must be an object" });
        return;
      }
      const serialized = JSON.stringify(state);
      if (serialized.length > MAX_STATE_BYTES) {
        res.status(413).json({ ok: false, error: "state too large" });
        return;
      }
      await pool.query(
        `insert into user_plan (user_id, state, updated_at) values ($1, $2::jsonb, now())
         on conflict (user_id) do update set state = excluded.state, updated_at = now()`,
        [userId, serialized],
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: "GET or PUT" });
  } catch (err) {
    console.error("plan sync failed", err);
    res.status(500).json({ ok: false, error: "Could not sync the plan." });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
