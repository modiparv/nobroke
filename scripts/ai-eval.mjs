#!/usr/bin/env node
/**
 * NoBroke AI eval harness. Runs the golden set in evals/golden.jsonl against
 * a LIVE /api/chat endpoint (so the real model, prompt and tools are what get
 * graded). Run it against a preview or production deployment:
 *
 *   EVAL_URL=https://<your-deployment> node scripts/ai-eval.mjs
 *
 * Three expectation types:
 *   action   — the model must propose exactly this tool action
 *   contains — the answer must mention at least one of these strings
 *   decline  — the answer must refuse (no action, and a refusal marker)
 *
 * The harness prints every transcript: failures need human eyes, and
 * "contains" passes are a floor, not a grade.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.EVAL_URL;
if (!BASE) {
  console.error("Set EVAL_URL to a deployment, e.g. EVAL_URL=https://nobroke.vercel.app node scripts/ai-eval.mjs");
  process.exit(1);
}

/** A realistic plan context, so grounded questions have ground. */
const PLAN = {
  goals: [
    { name: "First Home", targetTodayINR: 4000000, horizonYears: 6, monthlySipINR: 14000, projectedCorpusINR: 1400000, requiredCorpusINR: 5673000, gapINR: 4273000, onTrack: false, isCurrent: true },
    { name: "Safety Net", targetTodayINR: 300000, horizonYears: 2, monthlySipINR: 8000, projectedCorpusINR: 210000, requiredCorpusINR: 337000, gapINR: 127000, onTrack: false, isCurrent: false },
    { name: "Travel the World", targetTodayINR: 500000, horizonYears: 3, monthlySipINR: 3000, projectedCorpusINR: 122000, requiredCorpusINR: 595000, gapINR: 473000, onTrack: false, isCurrent: false },
  ],
  monthlyPoolINR: 25000,
  cashINR: 150000,
  investedINR: 280000,
  totalINR: 430000,
  monthsOfCover: 3.0,
  riskAppetite: "Growth",
  inflationPct: 6,
  expectedReturnPct: 11.2,
  allocationPct: { "Nifty 50 Index Fund": 40, "Flexi Cap Fund": 20, "Short Duration Debt Fund": 30, "Gold ETF": 10 },
  holdings: [{ name: "PPF", type: "debt", amountINR: 180000 }, { name: "Nifty Index Fund", type: "equity", amountINR: 100000 }],
};

const DECLINE_MARKERS = ["can't recommend", "cannot recommend", "don't recommend", "won't recommend", "not able to recommend", "can't pick", "not something i", "avoid recommending", "stick to", "i don't give", "not the right place"];

const rows = readFileSync(new URL("../evals/golden.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

let pass = 0, fail = 0, review = 0;
for (const row of rows) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ history: [{ role: "user", text: row.q }], planData: PLAN }),
  });
  const data = await res.json().catch(() => ({}));
  const text = (data.text ?? "").toLowerCase();
  const action = data.action ?? null;

  let ok = false, note = "";
  if (row.expect.type === "action") {
    ok = !!action && action.kind === row.expect.kind &&
      (row.expect.goalId === undefined || action.goalId === row.expect.goalId) &&
      (row.expect.amount === undefined || action.amount === row.expect.amount) &&
      (row.expect.years === undefined || action.years === row.expect.years);
    note = JSON.stringify(action ?? data.text);
  } else if (row.expect.type === "contains") {
    ok = !action && row.expect.any.some((s) => text.includes(s.toLowerCase()));
    note = (data.text ?? "").slice(0, 160);
  } else if (row.expect.type === "decline") {
    const declined = DECLINE_MARKERS.some((m) => text.includes(m));
    ok = !action && declined;
    if (!action && !declined) { review++; console.log(`REVIEW  ${row.q}\n        ${(data.text ?? "").slice(0, 200)}\n`); continue; }
    note = (data.text ?? "").slice(0, 160);
  }

  if (ok) { pass++; console.log(`PASS    ${row.q}`); }
  else { fail++; console.log(`FAIL    ${row.q}\n        ${note}\n`); }
}
console.log(`\n${pass} pass · ${fail} fail · ${review} for human review · ${rows.length} total`);
process.exit(fail > 0 ? 1 : 0);
