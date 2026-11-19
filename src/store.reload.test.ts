import { strict as assert } from "node:assert";
import test from "node:test";
import type { Profile } from "./lib/types";

/**
 * The store across a reload. Each page load is a fresh copy of the store that
 * reads what the last one saved in the browser, as a real reload does.
 */
type Store = typeof import("./store.ts");

const saved = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => void saved.set(k, String(v)),
    removeItem: (k: string) => void saved.delete(k),
  },
});

interface Call {
  url: string;
  method: string;
  body?: string;
}
const calls: Call[] = [];
/** What the server answers. "never" leaves the request out, as a slow connection does. */
let answer: (call: Call) => { status: number; body: unknown } | "never" = () => ({ status: 200, body: { ok: true } });
globalThis.fetch = (async (url: unknown, init?: { method?: string; body?: unknown }) => {
  const call: Call = { url: String(url), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined };
  calls.push(call);
  const r = answer(call);
  if (r === "never") return new Promise(() => {});
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
}) as unknown as typeof fetch;

let pages = 0;
/** Open the app in the same browser: a new page, the same saved data. */
async function openPage(): Promise<Store> {
  return (await import(new URL(`./store.ts?page=${++pages}`, import.meta.url).href)) as Store;
}
/** A browser nobody has used. */
function newBrowser() {
  saved.clear();
  calls.length = 0;
  answer = () => ({ status: 200, body: { ok: true } });
}

interface Person {
  p: Partial<Profile>;
  goals: string[];
  answers: Record<string, string>;
}
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
function intake(page: Store, who: Person) {
  page.actions.startOnboarding();
  for (const [k, v] of Object.entries(who.p)) page.actions.setProfileField(k as keyof Profile, v as string | number);
  for (const g of who.goals) page.actions.toggleGoal(g);
  for (const [k, v] of Object.entries(who.answers)) page.actions.setAnswer(k, v);
  page.actions.finishOnboarding();
}

const turn = () => new Promise((resolve) => setImmediate(resolve));
const puts = () => calls.filter((c) => c.method === "PUT");
const sent = (put: Call) => JSON.parse(put.body ?? "{}").state as { planUpdatedAt: number; profile: Profile; goals: { id: string }[] };
/** Run a store promise to its end, letting its waits pass at once. Needs mocked timers. */
async function settle<V>(t: { mock: { timers: { tick: (ms: number) => void } } }, p: Promise<V>): Promise<V> {
  let done = false;
  void p.finally(() => (done = true));
  while (!done) {
    await turn();
    t.mock.timers.tick(3000);
  }
  return p;
}

test("New plan, a reload, then My plan: the saved answers are still put back", async () => {
  newBrowser();
  const first = await openPage();
  intake(first, rajesh);
  const profile = first.getState().profile;
  first.actions.startOnboarding();
  first.actions.flushNow();

  const second = await openPage();
  assert.equal(second.getState().screen, "onboarding");
  assert.equal(second.getState().profile.cityTier, null);
  second.actions.leaveOnboarding();
  assert.equal(second.getState().screen, "plan");
  assert.deepEqual(second.getState().profile, profile);
  // Emergency fund is priced from this family's outgoings again, not from the catalogue.
  second.actions.addGoal("emergency");
  assert.equal(second.getState().goals.find((g) => g.id === "emergency")?.targetToday, 620000);
});

test("signed in: New plan, its blanks saved to the account, a reload, then My plan still puts the answers back", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  newBrowser();
  const user = { id: "u1", email: "a@b.co" };
  // What the account holds: the last plan sent to it.
  let account: unknown = null;
  answer = (call) => {
    if (call.url !== "/api/plan") return { status: 200, body: { ok: true } };
    if (call.method === "PUT") account = JSON.parse(call.body ?? "{}").state;
    return { status: 200, body: { ok: true, state: account } };
  };

  const first = await openPage();
  intake(first, rajesh);
  const profile = first.getState().profile;
  assert.equal(await settle(t, first.actions.completeAuth(user)), "ok");
  first.actions.startOnboarding();
  // Long enough for the blanks to reach the account, then the tab is reloaded.
  t.mock.timers.tick(3000);
  await turn();
  first.actions.flushNow();
  await turn();
  assert.equal(sent(puts()[puts().length - 1]).profile.cityTier, null, "the account holds the intake's blanks, as it does today");

  const second = await openPage();
  assert.equal(await settle(t, second.actions.completeAuth(user)), "ok");
  second.actions.leaveOnboarding();
  assert.deepEqual(second.getState().profile, profile);
  t.mock.timers.tick(3000);
  await turn();
  assert.deepEqual(sent(puts()[puts().length - 1]).profile, profile, "and the account gets them back too");
});

test("a reload while the sign-in's read is still out: the account's plan is still the one that wins", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  newBrowser();
  const user = { id: "u2", email: "c@d.co" };

  // The account's plan is the family's, saved some time ago.
  const other = await openPage();
  intake(other, rajesh);
  const s = other.getState();
  const accountPlan = { planUpdatedAt: s.planUpdatedAt - 60_000, profile: s.profile, goals: s.goals, goalOrder: s.goalOrder, monthlySip: s.monthlySip, portfolio: s.portfolio, portfolioProfile: s.portfolioProfile };

  // This browser has newer scratch work. The person signs in, the read is slow, and they reload.
  newBrowser();
  const first = await openPage();
  intake(first, aarav);
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? "never" : { status: 200, body: { ok: true } });
  void first.actions.completeAuth(user, { preferServer: true });
  await turn();
  first.actions.flushNow();

  // The reloaded page finds the session and reads the plan, without being told it was an explicit sign-in.
  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 200, body: { ok: true } });
  const second = await openPage();
  assert.equal(await settle(t, second.actions.completeAuth(user)), "ok");
  assert.deepEqual(second.getState().goals.map((g) => g.id).sort(), ["child", "fire", "parents"]);
  t.mock.timers.tick(5000);
  await turn();
  for (const put of puts()) assert.ok(!sent(put).goals.some((g) => g.id === "gadget"), "the scratch plan must never reach the account");
});

test("New plan here, then the account's plan arrives from another device: this browser's old answers are not put over it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  newBrowser();
  const user = { id: "u3", email: "e@f.co" };

  // Another device holds the student's plan, edited after this browser's copy.
  const other = await openPage();
  intake(other, aarav);
  const theirs = other.getState();

  newBrowser();
  const first = await openPage();
  intake(first, rajesh);
  first.actions.startOnboarding();
  first.actions.flushNow();
  const accountPlan = { planUpdatedAt: first.getState().planUpdatedAt + 60_000, profile: theirs.profile, goals: theirs.goals, goalOrder: theirs.goalOrder, selectedGoalIds: theirs.selectedGoalIds, monthlySip: theirs.monthlySip, portfolio: theirs.portfolio, portfolioProfile: theirs.portfolioProfile };

  answer = (call) => (call.url === "/api/plan" && call.method === "GET" ? { status: 200, body: { ok: true, state: accountPlan } } : { status: 200, body: { ok: true } });
  const second = await openPage();
  assert.equal(await settle(t, second.actions.completeAuth(user)), "ok");
  second.actions.leaveOnboarding();
  assert.deepEqual(second.getState().goals.map((g) => g.id).sort(), ["course", "gadget", "travel"]);
  assert.equal(second.getState().profile.takeHome, 8000, "the plan and its answers stay a pair");
});

test("a mix saved in this browser under a name the app does not know opens as the person's own mix", async () => {
  newBrowser();
  const first = await openPage();
  intake(first, rajesh);
  first.actions.flushNow();
  // An older version of the app saved names like this one.
  const key = [...saved.keys()][0];
  const blob = JSON.parse(saved.get(key) ?? "{}");
  blob.state.portfolioProfile = "aggressive";
  saved.set(key, JSON.stringify(blob));

  const second = await openPage();
  assert.equal(second.getState().portfolioProfile, null);
  assert.equal(second.getState().portfolioCustom, true);
  const kept = { ...second.getState().portfolio };
  second.actions.setRiskAppetite(second.getState().riskAppetite - 5);
  assert.deepEqual(second.getState().portfolio, kept, "a step on the risk level leaves it alone");
});
