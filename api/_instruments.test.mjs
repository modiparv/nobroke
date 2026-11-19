import { strict as assert } from "node:assert";
import { test } from "node:test";

/**
 * The fund endpoint is public: anyone can ask it about a named scheme. It
 * may pass on the scheme's own published figures. It must never add a score
 * or a grade of NoBroke's own, which would be a fund rating.
 */
const { default: handler } = await import("./instruments.js");

function history(months) {
  const out = [];
  const end = new Date(Date.UTC(2026, 9, 30));
  for (let i = 0; i < months; i++) {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - i);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    out.push({ date: `${dd}-${mm}-${d.getUTCFullYear()}`, nav: (100 * Math.pow(1.01, months - i)).toFixed(4) });
  }
  return out;
}

test("a scheme's detail carries its own figures and no score or grade from NoBroke", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ meta: { scheme_name: "A Flexi Cap Fund - Direct Plan - Growth", scheme_category: "Equity Scheme - Flexi Cap Fund", fund_house: "A Mutual Fund" }, data: history(72) }),
  });
  try {
    const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method: "GET", query: { code: "122639" }, headers: {} }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.name, "A Flexi Cap Fund - Direct Plan - Growth");
    assert.equal(typeof res.body.cagr5y, "number");
    assert.deepEqual(Object.keys(res.body).sort(), ["cagr1y", "cagr3y", "cagr5y", "category", "code", "fundHouse", "name", "nav", "navDate"]);
    assert.doesNotMatch(JSON.stringify(res.body), /score|grade|strong|solid|weak/i);
  } finally {
    globalThis.fetch = realFetch;
  }
});
