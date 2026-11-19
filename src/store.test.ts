import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allocationTotal } from "./lib/finance.ts";
import { FUND_MAP } from "./lib/funds.ts";
import type { Profile } from "./lib/types";
import { SIGN_IN_TEXT, actions, getState } from "./store.ts";

/**
 * The store, driven the way the screens drive it. Every request it makes is
 * caught here: a test says what the server answers and reads what was sent.
 */
interface Call {
  url: string;
  method: string;
  body?: string;
}
const calls: Call[] = [];
let answer: (call: Call) => { status: number; body: unknown } = () => ({ status: 500, body: { ok: false } });
globalThis.fetch = (async (url: unknown, init?: { method?: string; body?: unknown }) => {
  const call: Call = { url: String(url), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined };
  calls.push(call);
  const r = answer(call);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
}) as unknown as typeof fetch;

interface Person {
  p: Partial<Profile>;
  goals: string[];
  answers: Record<string, string>;
}
// The brief's two people: a family in a tier 1 city and a student.
const rajesh: Person = {
  p: { employment: "salaried", takeHome: 160000, rent: 0, emi: 38000, monthlySpend: 65000, cashOnHand: 300000, investedValue: 1800000, cityTier: "tier1", careerStage: "stable", dependents: "kids" },
  goals: ["child", "fire", "parents"],
  answers: { timeline: "8" },
};
const aarav: Person = {
  p: { employment: "student", takeHome: 8000, rent: 0, emi: 0, monthlySpend: 3500, cashOnHand: 22000, investedValue: 6000, cityTier: "tier1", careerStage: "studying", dependents: "none" },
  goals: ["gadget", "travel", "course"],
  answers: { timeline: "2", "cost:travel": "20000", "cost:gadget": "70000" },
};

/** Take a person through the intake, as the screens do. */
function intake(who: Person) {
  actions.startOnboarding();
  for (const [k, v] of Object.entries(who.p)) actions.setProfileField(k as keyof Profile, v as string | number);
  for (const g of who.goals) actions.toggleGoal(g);
  for (const [k, v] of Object.entries(who.answers)) actions.setAnswer(k, v);
  actions.finishOnboarding();
}

const lastReply = () => getState().chat[getState().chat.length - 1];
const goalIds = () => getState().goals.map((g) => g.id).sort();

test("adding or removing a goal leaves the person's mix alone", () => {
  intake(aarav);
  const mix = { ...getState().portfolio };
  const name = getState().portfolioProfile;
  assert.ok(allocationTotal(mix) > 0);
  // A goal twenty years out used to move a student from the Steady mix to the Bold one.
  actions.addGoal("fire");
  assert.deepEqual(getState().portfolio, mix);
  assert.equal(getState().portfolioProfile, name);
  actions.removeGoal("fire");
  assert.deepEqual(getState().portfolio, mix);
  assert.equal(getState().portfolioProfile, name);
});

test("a first goal on a plan with no mix still gets a starting mix", () => {
  intake(aarav);
  for (const id of goalIds()) actions.removeGoal(id);
  actions.setPortfolio({}, null);
  actions.addGoal("car");
  assert.ok(allocationTotal(getState().portfolio) > 0, "a plan with a goal and no mix would grow at 0%");
});

test("a question from someone without an account never leaves the browser", () => {
  intake(rajesh);
  assert.equal(getState().user, null);
  calls.length = 0;
  actions.submitCopilot("can I retire at 55?");
  assert.deepEqual(calls, [], "the landing page says the plan stays in the browser without an account");
  assert.deepEqual(lastReply(), { role: "ai", text: SIGN_IN_TEXT });
  assert.equal(getState().chatTyping, false);
  // The app and the endpoint answer in the same words.
  assert.ok(readFileSync(new URL("../api/chat.ts", import.meta.url), "utf8").includes(SIGN_IN_TEXT));
});

test("a typed monthly amount above what is left gets the monthly sheet's warning", () => {
  intake(aarav);
  actions.submitCopilot("I can invest ₹40k a month");
  assert.equal(lastReply().text, "Set your monthly investment to ₹40,000. That is more than the ₹4,500 left after expenses.");
  actions.submitCopilot("I can invest ₹3,000 a month");
  assert.equal(lastReply().text, "Set your monthly investment to ₹3,000.");
});

test("opening New plan and leaving at once puts the saved answers back", () => {
  intake(rajesh);
  const profile = getState().profile;
  const picked = getState().selectedGoalIds;
  actions.startOnboarding();
  assert.equal(getState().profile.cityTier, null);
  actions.leaveOnboarding();
  assert.equal(getState().screen, "plan");
  assert.deepEqual(getState().profile, profile);
  assert.deepEqual(getState().selectedGoalIds, picked);
  // Emergency fund is priced from the profile: six months of this family's outgoings, not the catalogue's figure.
  actions.addGoal("emergency");
  assert.equal(getState().goals.find((g) => g.id === "emergency")?.targetToday, 620000);
});

test("a fund added from the search is saved with the plan, and an unresolved one is looked up again", async () => {
  intake(rajesh);
  actions.addLiveFund({ id: "live_122639", name: "A Flexi Cap Fund - Direct Plan - Growth", assetClass: "equity", risk: "High", fiveYr: 18.2, expense: 0, expReturn: 0.12, volatility: 0.16 });
  assert.equal(getState().liveFunds.live_122639.name, "A Flexi Cap Fund - Direct Plan - Growth");
  assert.ok(FUND_MAP.live_122639);

  // A plan saved before funds were stored with it: the id is in the mix and nothing describes it.
  actions.setPortfolio({ icici_nifty: 50, live_999001: 50 }, null);
  assert.equal(FUND_MAP.live_999001, undefined);
  answer = (call) =>
    call.url.includes("/api/instruments?code=999001")
      ? { status: 200, body: { code: "999001", name: "A Corporate Bond Fund - Direct - Growth", category: "Debt Scheme - Corporate Bond Fund", fundHouse: "", nav: 10, navDate: null, cagr1y: null, cagr3y: null, cagr5y: null } }
      : { status: 500, body: {} };
  await actions.restoreLiveFunds();
  assert.equal(getState().liveFunds.live_999001.assetClass, "debt");
  assert.ok(FUND_MAP.live_999001);
});

test("a sign-in whose saved plan could not be read is still owed that plan, and never overwrites it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  /** Run a store promise to its end, letting its retry waits pass at once. */
  const settle = async <T>(p: Promise<T>): Promise<T> => {
    let done = false;
    void p.finally(() => (done = true));
    while (!done) {
      await new Promise((resolve) => setImmediate(resolve));
      t.mock.timers.tick(3000);
    }
    return p;
  };
  const user = { id: "u1", email: "a@b.co" };
  const puts = () => calls.filter((c) => c.method === "PUT");

  // The account's plan: the family's, saved on first sign-in to an empty account.
  intake(rajesh);
  calls.length = 0;
  answer = (call) => (call.method === "GET" ? { status: 200, body: { ok: true, state: null } } : { status: 200, body: { ok: true } });
  assert.equal(await settle(actions.completeAuth(user)), "ok");
  await new Promise((resolve) => setImmediate(resolve));
  const accountPlan = JSON.parse(puts()[0].body ?? "{}").state as Record<string, unknown>;
  assert.deepEqual((accountPlan.goals as { id: string }[]).map((g) => g.id).sort(), ["child", "fire", "parents"]);

  // Later, on a device with newer scratch work, an explicit sign-in whose read keeps failing.
  actions.clearStaleUser();
  intake(aarav);
  calls.length = 0;
  answer = () => ({ status: 500, body: { ok: false } });
  assert.equal(await settle(actions.completeAuth(user, { preferServer: true })), "sync-failed");
  assert.equal(getState().owedAccountPlan, "u1");
  assert.deepEqual(puts(), [], "local work must not be pushed over a plan that was never read");

  // The read works again on the heal path, which does not ask for the server's plan by itself.
  answer = (call) => (call.method === "GET" ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 200, body: { ok: true } });
  assert.equal(await settle(actions.completeAuth(user)), "ok");
  assert.deepEqual(goalIds(), ["child", "fire", "parents"], "the account's plan wins, though the scratch plan is newer");
  assert.equal(getState().owedAccountPlan, null);
  t.mock.timers.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  for (const put of puts()) {
    const sent = (JSON.parse(put.body ?? "{}").state.goals as { id: string }[]).map((g) => g.id);
    assert.ok(!sent.includes("gadget"), "the scratch plan must never reach the account");
  }
});
