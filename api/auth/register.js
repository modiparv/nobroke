import { makePool, resolveDatabaseUrl } from "../_data.js";
import { authSecret, createSession, hashPassword, normalizeEmail, sessionCookie, validPassword } from "../_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  const secret = authSecret();
  if (!secret || !resolveDatabaseUrl()) {
    res.status(503).json({ ok: false, error: "accounts not provisioned (AUTH_SECRET / database missing)" });
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email) {
    res.status(400).json({ ok: false, error: "Enter a valid email address." });
    return;
  }
  if (!validPassword(password)) {
    res.status(400).json({ ok: false, error: "Password needs at least 8 characters." });
    return;
  }

  let pool = null;
  try {
    pool = makePool();
    const inserted = await pool.query(
      `insert into app_user (email, password_hash) values ($1, $2)
       on conflict (lower(email)) do nothing
       returning id, email`,
      [email, hashPassword(password)],
    );
    if (inserted.rows.length === 0) {
      // Known tradeoff: a distinct 409 lets a caller probe whether an email is
      // registered. Without an email-verification pipeline there is no clean
      // way to hide it, and it is acceptable at early-access scale. Closing it
      // properly needs request rate limiting plus verification-based signup,
      // tracked for post-MVP. Do not treat this as fixed.
      res.status(409).json({ ok: false, error: "An account with this email already exists. Sign in instead." });
      return;
    }
    const user = inserted.rows[0];
    res.setHeader("Set-Cookie", sessionCookie(createSession(user.id, secret)));
    res.status(200).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("register failed", err);
    res.status(500).json({ ok: false, error: "Could not create the account. Try again." });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
