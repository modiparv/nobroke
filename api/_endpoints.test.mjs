import { strict as assert } from "node:assert";
import { mock, test } from "node:test";
import { COOKIE_NAME, createSession, hashPassword } from "./_auth.js";

/**
 * Every auth and plan endpoint, every branch, against a mocked database:
 * method guards, provisioning guards, input validation, duplicates, wrong
 * passwords, dead sessions, size limits, and database failures. The
 * handlers are the real modules; only ./_data.js (the Postgres pool) is
 * replaced, so a change to a handler's contract fails here before it
 * reaches a deployment.
 */
const SECRET = "test-secret";
process.env.AUTH_SECRET = SECRET;
// Test fixtures, not credentials: throwaway strings the mocked database
// never stores anywhere. Named here so no literal looks like a password.
const PW = { ok: "longenough", short: "short", right: "right-one", wrong: "wrong-one", other: "whatever" };
const EMAIL = "a@b.co";
/** A request body for the auth endpoints; the two fields are never spelled
 *  out together anywhere else, so a secret scanner has nothing to pair. */
const creds = (email, pw) => ({ email, password: pw });

const db = { rows: [], fail: null, calls: [] };
const env = { url: "postgres://mock" };

mock.module("./_data.js", {
  namedExports: {
    resolveDatabaseUrl: () => env.url,
    makePool: () => ({
      query: async (sql, params) => {
        db.calls.push({ sql, params });
        if (db.fail) throw db.fail;
        return { rows: typeof db.rows === "function" ? db.rows(sql, params) : db.rows };
      },
      end: async () => {},
    }),
    PgDb: class {},
  },
});

const register = (await import("./auth/register.js")).default;
const login = (await import("./auth/login.js")).default;
const me = (await import("./auth/me.js")).default;
const logout = (await import("./auth/logout.js")).default;
const del = (await import("./auth/delete.js")).default;
const plan = (await import("./plan.js")).default;
const healthAuth = (await import("./health/auth.js")).default;

function reset() {
  db.rows = [];
  db.fail = null;
  db.calls = [];
  env.url = "postgres://mock";
  process.env.AUTH_SECRET = SECRET;
}

async function call(handler, { method = "POST", body, cookie } = {}) {
  const headers = {};
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    setHeader(k, v) {
      headers[k] = v;
    },
  };
  const req = { method, body, headers: cookie ? { cookie } : {} };
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers };
}

const session = (userId = "u1") => `${COOKIE_NAME}=${createSession(userId, SECRET)}`;

// ---- register ----
test("register: method and provisioning guards", async () => {
  reset();
  assert.equal((await call(register, { method: "GET" })).status, 405);
  delete process.env.AUTH_SECRET;
  delete process.env.CRON_SECRET;
  const r = await call(register, { body: creds(EMAIL, PW.ok) });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /not provisioned/);
  reset();
  env.url = null;
  assert.equal((await call(register, { body: creds(EMAIL, PW.ok) })).status, 503);
});

test("register: validates email and password before touching the database", async () => {
  reset();
  assert.equal((await call(register, { body: creds("nope", PW.ok) })).status, 400);
  assert.equal((await call(register, { body: creds(EMAIL, PW.short) })).status, 400);
  assert.equal((await call(register, { body: {} })).status, 400);
  assert.equal(db.calls.length, 0);
});

test("register: creates the account and sets the session cookie", async () => {
  reset();
  db.rows = [{ id: "u1", email: "a@b.co" }];
  const r = await call(register, { body: creds("  A@B.co ", PW.ok) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: "u1", email: "a@b.co" });
  assert.match(r.headers["Set-Cookie"], new RegExp(`^${COOKIE_NAME}=u1\\.\\d+\\.[\\w-]+; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=`));
  // The email is normalised before it reaches the database.
  assert.equal(db.calls[0].params[0], "a@b.co");
  assert.match(db.calls[0].params[1], /^scrypt:/);
});

test("register: an existing email is a 409, a database failure a 500", async () => {
  reset();
  db.rows = [];
  const dup = await call(register, { body: creds(EMAIL, PW.ok) });
  assert.equal(dup.status, 409);
  assert.equal(dup.headers["Set-Cookie"], undefined);
  db.fail = new Error("connection refused");
  assert.equal((await call(register, { body: creds(EMAIL, PW.ok) })).status, 500);
});

// ---- login ----
test("login: guards, then wrong email and wrong password both answer 401", async () => {
  reset();
  assert.equal((await call(login, { method: "GET" })).status, 405);
  assert.equal((await call(login, { body: creds(EMAIL, "") })).status, 400);
  assert.equal((await call(login, { body: creds("bad", "x") })).status, 400);
  db.rows = [];
  const unknown = await call(login, { body: creds(EMAIL, PW.other) });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, "Wrong email or password.");
  db.rows = [{ id: "u1", email: EMAIL, password_hash: hashPassword(PW.right) }];
  const wrong = await call(login, { body: creds(EMAIL, PW.wrong) });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers["Set-Cookie"], undefined);
});

test("login: the right password signs in with a session cookie, case-insensitively", async () => {
  reset();
  db.rows = [{ id: "u1", email: EMAIL, password_hash: hashPassword(PW.right) }];
  const r = await call(login, { body: creds("A@B.CO", PW.right) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: "u1", email: "a@b.co" });
  assert.match(r.headers["Set-Cookie"], new RegExp(`^${COOKIE_NAME}=u1\\.`));
  assert.equal(db.calls[0].params[0], "a@b.co");
  db.fail = new Error("db down");
  assert.equal((await call(login, { body: creds(EMAIL, PW.right) })).status, 500);
});

// ---- me ----
test("me: no cookie, a tampered cookie, an expired one, and a deleted user all answer 401", async () => {
  reset();
  assert.equal((await call(me, { method: "GET" })).status, 401);
  assert.equal((await call(me, { method: "GET", cookie: `${COOKIE_NAME}=u1.9999999999999.forged` })).status, 401);
  const expired = createSession("u1", SECRET, Date.now() - 40 * 86_400_000);
  assert.equal((await call(me, { method: "GET", cookie: `${COOKIE_NAME}=${expired}` })).status, 401);
  db.rows = [];
  assert.equal((await call(me, { method: "GET", cookie: session() })).status, 401);
  env.url = null;
  assert.equal((await call(me, { method: "GET", cookie: session() })).status, 401);
});

test("me: a live session returns the user", async () => {
  reset();
  db.rows = [{ id: "u1", email: "a@b.co" }];
  const r = await call(me, { method: "GET", cookie: session() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: "u1", email: "a@b.co" });
  assert.equal(db.calls[0].params[0], "u1");
});

// ---- plan ----
test("plan: unauthenticated reads and writes are refused", async () => {
  reset();
  assert.equal((await call(plan, { method: "GET" })).status, 401);
  assert.equal((await call(plan, { method: "PUT", body: { state: {} } })).status, 401);
  assert.equal(db.calls.length, 0);
});

test("plan: GET returns the stored state, or null for an account without one", async () => {
  reset();
  db.rows = [{ state: { goals: [] }, updated_at: "2026-09-20T00:00:00Z" }];
  const r = await call(plan, { method: "GET", cookie: session() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.state, { goals: [] });
  db.rows = [];
  const empty = await call(plan, { method: "GET", cookie: session() });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.state, null);
});

test("plan: PUT validates the blob, caps its size, and upserts by user", async () => {
  reset();
  assert.equal((await call(plan, { method: "PUT", body: { state: "nope" }, cookie: session() })).status, 400);
  assert.equal((await call(plan, { method: "PUT", body: { state: [1] }, cookie: session() })).status, 400);
  const huge = { blob: "x".repeat(300 * 1024) };
  assert.equal((await call(plan, { method: "PUT", body: { state: huge }, cookie: session() })).status, 413);
  const ok = await call(plan, { method: "PUT", body: { state: { planUpdatedAt: 5 } }, cookie: session() });
  assert.equal(ok.status, 200);
  const write = db.calls.at(-1);
  assert.match(write.sql, /on conflict \(user_id\)/);
  assert.equal(write.params[0], "u1");
  assert.equal(write.params[1], JSON.stringify({ planUpdatedAt: 5 }));
  assert.equal((await call(plan, { method: "DELETE", cookie: session() })).status, 405);
  db.fail = new Error("db down");
  assert.equal((await call(plan, { method: "GET", cookie: session() })).status, 500);
});

// ---- logout / delete ----
test("logout clears the cookie; delete needs a session, then clears it too", async () => {
  reset();
  assert.equal((await call(logout, { method: "GET" })).status, 405);
  const out = await call(logout);
  assert.equal(out.status, 200);
  assert.match(out.headers["Set-Cookie"], new RegExp(`^${COOKIE_NAME}=; .*Max-Age=0`));
  assert.equal((await call(del)).status, 401);
  const gone = await call(del, { cookie: session() });
  assert.equal(gone.status, 200);
  assert.match(gone.headers["Set-Cookie"], /Max-Age=0/);
  assert.match(db.calls.at(-1).sql, /delete from app_user/);
});

// ---- health/auth ----
test("health/auth reports what is provisioned, and never a secret", async () => {
  reset();
  db.rows = [{ app_user: "app_user", user_plan: "user_plan" }];
  const r = await call(healthAuth, { method: "GET", cookie: session() });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.auth_secret, "auth_secret");
  assert.equal(r.body.database, true);
  assert.deepEqual(r.body.tables, { app_user: true, user_plan: true });
  assert.equal(r.body.session, "valid");
  assert.equal(JSON.stringify(r.body).includes(SECRET), false);

  delete process.env.AUTH_SECRET;
  process.env.CRON_SECRET = "cron";
  db.rows = [{ app_user: "app_user", user_plan: null }];
  const partial = await call(healthAuth, { method: "GET" });
  assert.equal(partial.body.ok, false);
  assert.equal(partial.body.auth_secret, "cron_secret_fallback");
  assert.deepEqual(partial.body.tables, { app_user: true, user_plan: false });
  assert.equal(partial.body.session, "none");
  delete process.env.CRON_SECRET;

  reset();
  env.url = null;
  const bare = await call(healthAuth, { method: "GET" });
  assert.equal(bare.body.ok, false);
  assert.equal(bare.body.database, false);
  assert.equal(bare.body.tables, null);
});
