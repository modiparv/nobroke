import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allocationTotal } from "./lib/finance.ts";
import { FUND_MAP } from "./lib/funds.ts";
import { mixName } from "./lib/portfolios.ts";
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

/** Answer the intake as a person does, up to its last step. */
function answerIntake(who: Person) {
  actions.startOnboarding();
  for (const [k, v] of Object.entries(who.p)) actions.setProfileField(k as keyof Profile, v as string | number);
  for (const g of who.goals) actions.toggleGoal(g);
  for (const [k, v] of Object.entries(who.answers)) actions.setAnswer(k, v);
}
/** Take a person through the whole intake, as the screens do. */
function intake(who: Person) {
  answerIntake(who);
  actions.finishOnboarding();
}

const lastReply = () => getState().chat[getState().chat.length - 1];
const goalIds = () => getState().goals.map((g) => g.id).sort();
const puts = () => calls.filter((c) => c.method === "PUT");
const goalsSent = (put: Call) => (JSON.parse(put.body ?? "{}").state.goals as { id: string }[]).map((g) => g.id);
const turn = () => new Promise((resolve) => setImmediate(resolve));
/** Run a store promise to its end, letting its retry waits pass at once. Needs mocked timers. */
async function settle<V>(t: { mock: { timers: { tick: (ms: number) => void } } }, p: Promise<V>): Promise<V> {
  let done = false;
  void p.finally(() => (done = true));
  while (!done) {
    await turn();
    t.mock.timers.tick(3000);
  }
  return p;
}
/** A browser with nobody signed in and no plan. */
async function freshBrowser() {
  answer = () => ({ status: 200, body: { ok: true } });
  await actions.signOut();
  calls.length = 0;
}
/** The plan as an account would hold it, from what is on screen now. */
function planAsSaved(stamp: number): Record<string, unknown> {
  const s = getState();
  return {
    planUpdatedAt: stamp,
    profile: s.profile,
    goals: s.goals,
    goalOrder: s.goalOrder,
    selectedGoalIds: s.selectedGoalIds,
    monthlySip: s.monthlySip,
    portfolio: s.portfolio,
    portfolioProfile: s.portfolioProfile,
    portfolioCustom: s.portfolioCustom,
  };
}

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

test("leaving New plan by the logo puts the saved answers back, and a finished intake keeps its own", () => {
  intake(rajesh);
  const profile = getState().profile;
  actions.startOnboarding();
  actions.setProfileField("takeHome", 90000);
  // Pressing New plan again on the intake must not replace the kept answers with the blanks.
  actions.startOnboarding();
  actions.goLanding();
  assert.equal(getState().screen, "landing");
  assert.deepEqual(getState().profile, profile);
  // "Go to my plan" then prices a new goal from this family's numbers, as before.
  actions.goPlan();
  actions.addGoal("emergency");
  assert.equal(getState().goals.find((g) => g.id === "emergency")?.targetToday, 620000);

  // An intake that was finished is the plan now: nothing older comes back.
  intake(aarav);
  assert.equal(getState().intakeBackup, null);
  actions.goLanding();
  assert.equal(getState().profile.takeHome, 8000);
});

test("after the goals change, a step on the risk level never moves the mix the other way", () => {
  intake(aarav);
  assert.equal(getState().portfolioProfile, "steady");
  // A goal twenty years out: the mix stays, and no longer matches what the goals would be given.
  actions.addGoal("fire");
  const level = getState().riskAppetite;
  const mix = { ...getState().portfolio };
  actions.setRiskAppetite(level - 5);
  assert.equal(getState().riskAppetite, level - 5);
  assert.equal(getState().portfolioProfile, "steady", "a lower level must not bring a riskier mix");
  assert.deepEqual(getState().portfolio, mix);
  // The level still does its job in its own direction.
  actions.setRiskAppetite(level + 5);
  assert.equal(getState().portfolioProfile, "bold");
  actions.setRiskAppetite(0);
  assert.equal(getState().portfolioProfile, "steady");

  // The mirror: a bold mix, then the long goal goes. A higher level must not bring a calmer mix.
  intake(aarav);
  actions.addGoal("fire");
  const base = getState().riskAppetite;
  actions.setRiskAppetite(base + 5);
  assert.equal(getState().portfolioProfile, "bold");
  actions.removeGoal("fire");
  assert.equal(getState().portfolioProfile, "bold", "removing a goal leaves the mix alone");
  const bold = { ...getState().portfolio };
  actions.setRiskAppetite(base + 10);
  assert.equal(getState().riskAppetite, base + 10);
  assert.equal(getState().portfolioProfile, "bold", "a higher level must not bring a calmer mix");
  assert.deepEqual(getState().portfolio, bold);
  // Downwards the level still does its job.
  actions.setRiskAppetite(0);
  assert.equal(getState().portfolioProfile, "steady");
});

test("a fund lookup or the inflation feed at boot never makes an old copy look newer than the account's", async (t) => {
  const opened = Date.now();
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: opened });
  await freshBrowser();
  // This browser's copy: the family's plan with a search fund, saved before funds were stored with plans.
  intake(rajesh);
  actions.setPortfolio({ icici_nifty: 50, live_999002: 50 }, null);
  const stamp = getState().planUpdatedAt;
  // The account's copy was edited on another device a little later: one goal fewer, more a month.
  const accountPlan = { ...planAsSaved(stamp + 2000), goals: getState().goals.filter((g) => g.id !== "parents"), monthlySip: 45000, portfolio: { icici_nifty: 100 } };

  // The next day this browser opens. The lookup and the feed both answer before the plan is read.
  t.mock.timers.tick(86_400_000);
  answer = (call) => {
    if (call.url.includes("/api/instruments?code=999002"))
      return { status: 200, body: { code: "999002", name: "A Liquid Fund - Direct - Growth", category: "Debt Scheme - Liquid Fund", fundHouse: "", nav: 10, navDate: null, cagr1y: null, cagr3y: null, cagr5y: null } };
    if (call.url === "/api/plan" && call.method === "GET") return { status: 200, body: { ok: true, state: accountPlan } };
    return { status: 200, body: { ok: true } };
  };
  await actions.restoreLiveFunds();
  assert.equal(getState().liveFunds.live_999002?.assetClass, "debt", "the fund is still restored");
  assert.equal(getState().planUpdatedAt, stamp, "a lookup is not an edit by the person");
  actions.applyMacroInflation(5.2);
  assert.equal(getState().inflation, 0.052);
  assert.equal(getState().planUpdatedAt, stamp, "the feed is not an edit by the person");

  assert.equal(await settle(t, actions.completeAuth({ id: "u2", email: "c@d.co" })), "ok");
  assert.deepEqual(goalIds(), ["child", "fire"], "the account's newer plan is the one shown");
  assert.equal(getState().monthlySip, 45000);
  t.mock.timers.tick(5000);
  await turn();
  assert.deepEqual(puts(), [], "the old copy must never be sent to the account");
});

test("an explicit sign-in is owed the account's plan from its first moment, so a reconnect in the middle cannot push local work", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const user = { id: "u3", email: "e@f.co" };
  await freshBrowser();
  intake(rajesh);
  const accountPlan = planAsSaved(getState().planUpdatedAt - 60_000);
  // Newer scratch work on this device, then Sign in. The first read of the plan fails.
  intake(aarav);
  let planReads = 0;
  answer = (call) => {
    if (call.url === "/api/auth/me") return { status: 200, body: { ok: true, user } };
    if (call.url === "/api/plan" && call.method === "GET")
      return ++planReads === 1 ? { status: 500, body: { ok: false } } : { status: 200, body: { ok: true, state: accountPlan } };
    return { status: 200, body: { ok: true } };
  };
  const signIn = actions.completeAuth(user, { preferServer: true });
  await turn();
  // While the sign-in waits to try again, the window regains focus and the heal path reads the plan itself.
  await actions.revalidateSession();
  await turn();
  await turn();
  assert.deepEqual(goalIds(), ["child", "fire", "parents"], "the account's plan wins, though the scratch plan is newer");
  assert.equal(await settle(t, signIn), "ok");
  t.mock.timers.tick(5000);
  await turn();
  for (const put of puts()) assert.ok(!goalsSent(put).includes("gadget"), "the scratch plan must never reach the account");
  assert.deepEqual(goalIds(), ["child", "fire", "parents"]);
  assert.equal(getState().owedAccountPlan, null);
});

test("a saved plan whose mix has a name the app does not know opens as a mix of the person's own", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await freshBrowser();
  intake(rajesh);
  assert.equal(getState().portfolioProfile, "balanced");
  const stamp = getState().planUpdatedAt + 1000;
  // An older name, or a value changed by hand. It used to replace the whole app with the error card.
  answer = (call) => (call.method === "GET" ? { status: 200, body: { ok: true, state: { ...planAsSaved(stamp), portfolioProfile: "growth" } } } : { status: 200, body: { ok: true } });
  assert.equal(await settle(t, actions.completeAuth({ id: "u4", email: "g@h.co" })), "ok");
  assert.equal(getState().portfolioProfile, null);
  assert.equal(mixName(getState().portfolio, getState().portfolioProfile), "Your own mix");
  // It is kept as the person's own: a step on the risk level does not swap it for a ready-made mix.
  assert.equal(getState().portfolioCustom, true);
  const kept = { ...getState().portfolio };
  actions.setRiskAppetite(getState().riskAppetite - 5);
  assert.deepEqual(getState().portfolio, kept);

  // A mix the person built by hand on another device has no name: this device's old name must not stick to it.
  await freshBrowser();
  intake(rajesh);
  const later = getState().planUpdatedAt + 1000;
  answer = (call) =>
    call.method === "GET"
      ? { status: 200, body: { ok: true, state: { ...planAsSaved(later), portfolio: { icici_nifty: 50, hdfc_corp_bond: 50 }, portfolioProfile: null, portfolioCustom: true } } }
      : { status: 200, body: { ok: true } };
  assert.equal(await settle(t, actions.completeAuth({ id: "u4", email: "g@h.co" })), "ok");
  assert.equal(getState().portfolioProfile, null);
  assert.equal(getState().portfolioCustom, true);
});

test("a new plan starts with the split following need, even after the last plan's split was fixed by hand", () => {
  intake(rajesh);
  actions.setGoalAmount("child", 1000);
  assert.equal(getState().goalSharesCustom, true);
  intake(aarav);
  assert.equal(getState().goalSharesCustom, false);
  // So more a month is shared out again, instead of landing on the old fixed parts.
  const before = { ...getState().goalShares };
  actions.setSip(getState().monthlySip * 4);
  assert.notDeepEqual(getState().goalShares, before);
});

test("the account's copy does not undo the inflation feed when the feed answers before the plan is read", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await freshBrowser();
  intake(rajesh);
  const stamp = getState().planUpdatedAt;
  // The account holds this browser's own copy, saved while last year's figure was in use.
  let accountPlan: Record<string, unknown> = { ...planAsSaved(stamp), inflation: 0.05, inflationSource: "macro" };
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 200, body: { ok: true } });
  actions.applyMacroInflation(4.2);
  assert.equal(await settle(t, actions.completeAuth({ id: "u5", email: "i@j.co" })), "ok");
  assert.equal(getState().inflation, 0.042, "this year's figure stays");
  assert.equal(getState().inflationSource, "macro");
  assert.equal(getState().planUpdatedAt, stamp, "and it is still not an edit");

  // A rate the person set by hand on the account wins over the feed.
  await freshBrowser();
  intake(rajesh);
  accountPlan = { ...planAsSaved(getState().planUpdatedAt), inflation: 0.07, inflationSource: "user" };
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 200, body: { ok: true } });
  actions.applyMacroInflation(4.2);
  assert.equal(await settle(t, actions.completeAuth({ id: "u5", email: "i@j.co" })), "ok");
  assert.equal(getState().inflation, 0.07);
  assert.equal(getState().inflationSource, "user");
});

test("a second read that fails after the sign-in's own read landed leaves nothing owed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const user = { id: "u6", email: "k@l.co" };
  await freshBrowser();
  intake(rajesh);
  const accountPlan = planAsSaved(getState().planUpdatedAt);
  await freshBrowser();
  // The plan's reads answer, in the order they arrive: fail, fail, the plan, fail, fail.
  let planReads = 0;
  answer = (call) => {
    if (call.url === "/api/auth/me") return { status: 200, body: { ok: true, user } };
    if (call.url === "/api/plan" && call.method === "GET")
      return ++planReads === 3 ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 500, body: { ok: false } };
    return { status: 200, body: { ok: true } };
  };
  const signIn = actions.completeAuth(user, { preferServer: true });
  await turn();
  // The window regains focus while the sign-in waits to try again: a second run with reads of its own.
  await actions.revalidateSession();
  await turn();
  assert.equal(await settle(t, signIn), "ok");
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(3000);
    await turn();
  }
  assert.equal(planReads, 5);
  assert.deepEqual(goalIds(), ["child", "fire", "parents"]);
  assert.equal(getState().owedAccountPlan, null, "a device that has read the plan and is syncing is owed nothing");
});

test("a search fund looked up before the plan is read is still saved with the plan", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await freshBrowser();
  intake(rajesh);
  actions.setPortfolio({ icici_nifty: 50, live_999003: 50 }, null);
  const stamp = getState().planUpdatedAt;
  // The account holds this browser's own copy, saved before the fund could be looked up.
  const accountPlan = { ...planAsSaved(stamp), liveFunds: {} };
  answer = (call) => {
    if (call.url.includes("/api/instruments?code=999003"))
      return { status: 200, body: { code: "999003", name: "Another Liquid Fund - Direct - Growth", category: "Debt Scheme - Liquid Fund", fundHouse: "", nav: 10, navDate: null, cagr1y: null, cagr3y: null, cagr5y: null } };
    if (call.url === "/api/plan" && call.method === "GET") return { status: 200, body: { ok: true, state: accountPlan } };
    return { status: 200, body: { ok: true } };
  };
  await actions.restoreLiveFunds();
  assert.ok(getState().liveFunds.live_999003);
  assert.equal(await settle(t, actions.completeAuth({ id: "u7", email: "m@n.co" })), "ok");
  await turn();
  assert.ok(getState().liveFunds.live_999003, "the fund stays in the plan after the account's copy is adopted");
  assert.equal(getState().planUpdatedAt, stamp, "and it is still not an edit");
  t.mock.timers.tick(5000);
  await turn();
  const sent = puts().map((p) => Object.keys(JSON.parse(p.body ?? "{}").state.liveFunds ?? {}));
  assert.deepEqual(sent[sent.length - 1], ["live_999003"], "and it reaches the account");
});

test("signing in at the end of a New plan intake builds the plan from that intake when the account has none", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const user = { id: "u8", email: "o@p.co" };
  // The family's plan is in this browser. New plan, the student's answers, then Sign in on the last step.
  await freshBrowser();
  intake(rajesh);
  answerIntake(aarav);
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: null } } : { status: 200, body: { ok: true } });
  assert.equal(await settle(t, actions.completeAuth(user, { preferServer: true })), "ok");
  actions.finishIntakeAfterSignIn();
  assert.equal(getState().screen, "plan");
  assert.deepEqual(goalIds(), ["course", "gadget", "travel"], "not the older plan's goals under the new answers");
  assert.equal(getState().profile.takeHome, 8000);
  assert.equal(getState().intakeBackup, null);

  // An account that has a plan: that plan is shown, and the intake's answers are dropped.
  await freshBrowser();
  intake(rajesh);
  const accountPlan = planAsSaved(getState().planUpdatedAt - 60_000);
  await freshBrowser();
  intake(aarav);
  answerIntake(aarav);
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 200, body: { ok: true } });
  assert.equal(await settle(t, actions.completeAuth(user, { preferServer: true })), "ok");
  actions.finishIntakeAfterSignIn();
  assert.equal(getState().screen, "plan");
  assert.deepEqual(goalIds(), ["child", "fire", "parents"]);
  assert.equal(getState().profile.takeHome, 160000);

  // A first intake, with no older plan in the browser, still builds its plan.
  await freshBrowser();
  answerIntake(aarav);
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: null } } : { status: 200, body: { ok: true } });
  assert.equal(await settle(t, actions.completeAuth(user, { preferServer: true })), "ok");
  actions.finishIntakeAfterSignIn();
  assert.deepEqual(goalIds(), ["course", "gadget", "travel"]);
});
