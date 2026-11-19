import { strict as assert } from "node:assert";
import test from "node:test";
import { GOAL_MAP, GOALS } from "./goals.ts";
import {
  applyGoalCosts,
  clampStepIndex,
  firstUnanswered,
  goalCostAnswer,
  goalCostKey,
  goalEstimate,
  resumeStepIndex,
  stageFill,
  STAGES,
  STEPS,
  TOTAL_STAGES,
} from "./onboarding.ts";
import { adjustedTarget, emergencyTarget, emptyProfile } from "./profile.ts";
import type { Profile } from "./types";

/** Every word of a step that a person reads. */
const wordsOf = (s: (typeof STEPS)[number]) =>
  [s.title, s.subtitle ?? "", s.cta ?? "", s.stageLabel, ...(s.options ?? []).flatMap((o) => [o.label, o.hint ?? ""])].join(" ");

const indexOf = (id: string) => STEPS.findIndex((s) => s.id === id);

/** A profile with every intake question answered. */
const answered = (over: Partial<Profile> = {}): Profile => ({
  ...emptyProfile(),
  employment: "salaried",
  takeHome: 160000,
  emi: 38000,
  monthlySpend: 65000,
  cashOnHand: 300000,
  investedValue: 1800000,
  cityTier: "tier1",
  careerStage: "stable",
  dependents: "kids",
  ...over,
});

test("the intake asks what each goal costs right after the goals are picked", () => {
  const goals = STEPS.findIndex((s) => s.kind === "goals");
  const costs = STEPS.findIndex((s) => s.kind === "costs");
  assert.ok(goals >= 0 && costs === goals + 1);
  assert.equal(STEPS[costs].stage, STEPS[goals].stage);
});

test("a price given in the intake replaces the estimate; a blank or a bad value keeps it", () => {
  const goals = [
    { id: "travel", targetToday: 200000 },
    { id: "gadget", targetToday: 100000 },
    { id: "education", targetToday: 5200000 },
  ];
  const answers = { [goalCostKey("travel")]: "20000", [goalCostKey("gadget")]: "", [goalCostKey("education")]: "abc", "cost:nope": "5" };
  const priced = applyGoalCosts(goals, answers);
  assert.equal(priced[0].targetToday, 20000);
  assert.equal(priced[1].targetToday, 100000);
  assert.equal(priced[2].targetToday, 5200000);
  assert.equal(applyGoalCosts(goals, { [goalCostKey("travel")]: "0" })[0].targetToday, 200000);
  assert.equal(applyGoalCosts(goals, { [goalCostKey("travel")]: "-5" })[0].targetToday, 200000);
  assert.equal(applyGoalCosts(goals, { [goalCostKey("travel")]: "70000.6" })[0].targetToday, 70001);
  // No answers at all: nothing changes.
  assert.deepEqual(applyGoalCosts(goals, {}), goals);
});

test("there is no step for connecting accounts, and no step promises something for later", () => {
  for (const s of STEPS) {
    assert.notEqual(s.id, "connect");
    assert.notEqual(s.kind as string, "connect");
    assert.doesNotMatch(wordsOf(s), /\bsoon\b/i, `"${s.id}" says soon`);
    assert.doesNotMatch(wordsOf(s), /connect your|auto-?import|CAMS|KFintech|Finvu|OneMoney|DhanHQ|AngelOne|HDFC Sec|NSDL|\bKRA\b/i, `"${s.id}" names an account link`);
  }
});

test("every step has a title, a known kind and its own id", () => {
  const kinds = new Set(["intro", "goals", "costs", "single", "money", "account"]);
  for (const s of STEPS) {
    assert.ok(s.title.trim().length > 0, `"${s.id}" has no title`);
    assert.ok(kinds.has(s.kind), `"${s.id}" has the kind ${s.kind}`);
  }
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
  // A choice step has choices and a place to store the answer; a money step has a place too.
  for (const s of STEPS.filter((x) => x.kind === "single")) assert.ok(s.field && s.options && s.options.length >= 2, s.id);
  for (const s of STEPS.filter((x) => x.kind === "money")) assert.ok(s.field, s.id);
});

test("the intake opens on the intro, ends on the account step, and asks in this order", () => {
  assert.deepEqual(
    STEPS.map((s) => s.id),
    ["intro", "employment", "takeHome", "rent", "emi", "monthlySpend", "cashOnHand", "investedValue", "city", "stage", "dependents", "goals", "costs", "timeline", "account"],
  );
  assert.equal(STEPS[0].kind, "intro");
  assert.equal(STEPS[STEPS.length - 1].kind, "account");
});

test("the sections are numbered 1 to 5 without a gap, never go backwards, and each has a name", () => {
  assert.equal(TOTAL_STAGES, 5);
  assert.deepEqual(STAGES.map((st) => st.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(STAGES.map((st) => st.label), ["Income", "Spending", "What you hold", "About you", "Goals"]);
  for (const st of STAGES) assert.ok(st.desc.trim().length > 0, `section ${st.n} has no description`);
  const questions = STEPS.slice(1, -1);
  for (let k = 1; k < questions.length; k++) assert.ok(questions[k].stage >= questions[k - 1].stage, `"${questions[k].id}" goes back a section`);
  // Every question sits in a section, under that section's one name.
  for (const s of questions) assert.equal(s.stageLabel, STAGES[s.stage - 1].label, s.id);
  // The section sizes add up to the questions asked.
  assert.equal(STAGES.reduce((sum, st) => sum + st.steps, 0), questions.length);
  assert.deepEqual(STAGES.map((st) => st.steps), [2, 3, 2, 3, 3]);
});

test("the progress rail is empty on the intro, full only on the account step, and moves forward at every step", () => {
  assert.deepEqual(stageFill(0), [0, 0, 0, 0, 0]);
  assert.deepEqual(stageFill(STEPS.length - 1), [1, 1, 1, 1, 1]);
  // The first of two income questions: begun, not half done.
  assert.deepEqual(stageFill(indexOf("employment")), [0.25, 0, 0, 0, 0]);
  assert.deepEqual(stageFill(indexOf("takeHome")), [0.75, 0, 0, 0, 0]);
  // The step after the one that was removed: section 3 is done, section 4 has begun.
  assert.deepEqual(stageFill(indexOf("investedValue")), [1, 1, 0.75, 0, 0]);
  assert.deepEqual(stageFill(indexOf("city")), [1, 1, 1, 0.5 / 3, 0]);
  // The last question is still a question: the rail is not full yet.
  assert.deepEqual(stageFill(indexOf("timeline")), [1, 1, 1, 1, 2.5 / 3]);
  let before = 0;
  for (let k = 1; k < STEPS.length; k++) {
    const fill = stageFill(k);
    assert.equal(fill.length, TOTAL_STAGES);
    for (const f of fill) assert.ok(f >= 0 && f <= 1);
    const total = fill.reduce((a, b) => a + b, 0);
    assert.ok(total > before, `step ${k} does not move the rail forward`);
    before = total;
  }
  // A step number from an older, longer list still draws a rail.
  assert.deepEqual(stageFill(15), [1, 1, 1, 1, 1]);
});

test("a saved step number that no longer exists lands on a real step", () => {
  const last = STEPS.length - 1;
  // The list was 16 steps long; 15 was its account step.
  assert.equal(clampStepIndex(15), last);
  assert.equal(clampStepIndex(99), last);
  assert.equal(clampStepIndex(-3), 0);
  assert.equal(clampStepIndex(4.7), 4);
  for (const bad of [undefined, null, "7", Number.NaN, Number.POSITIVE_INFINITY, {}]) assert.equal(clampStepIndex(bad), 0);
  for (let k = 0; k < STEPS.length; k++) assert.equal(clampStepIndex(k), k);
  // Whatever was saved, there is a step to draw.
  for (const k of [-1, 0, 8, 14, 15, 16, 1000]) assert.ok(STEPS[clampStepIndex(k)]);
});

test("a saved intake never resumes past a question that has no answer", () => {
  const goals = ["child", "fire", "parents"];
  // What passing the cost step stores: a key for every picked goal, blank when the estimate was kept.
  const costs = { "cost:child": "", "cost:fire": "", "cost:parents": "" };
  // Saved on the old list at step 9, the city question, not yet answered.
  // Step 9 is now the career question; resuming goes back to the city one.
  const onCity = answered({ cityTier: null, careerStage: null, dependents: null });
  assert.equal(resumeStepIndex(9, onCity, {}, []), indexOf("city"));
  // Saved on the old list at step 12, the goals step, with nothing picked.
  assert.equal(resumeStepIndex(12, answered(), {}, []), indexOf("goals"));
  // Saved on the old list's timeline step (14), which is now the account step.
  assert.equal(resumeStepIndex(14, answered(), costs, goals), indexOf("timeline"));
  // Saved on the old list's cost step (13), which is now the timeline step: the prices were never confirmed.
  assert.equal(resumeStepIndex(13, answered(), {}, goals), indexOf("costs"));
  // Everything answered: the saved place stands, and one past the end is the last step.
  assert.equal(resumeStepIndex(15, answered(), { ...costs, timeline: "8" }, goals), STEPS.length - 1);
  assert.equal(resumeStepIndex(indexOf("costs"), answered(), {}, goals), indexOf("costs"));
  // Resuming never moves a person forward.
  assert.equal(resumeStepIndex(3, answered(), { ...costs, timeline: "8" }, goals), 3);
  // A fresh intake starts on the intro.
  assert.equal(resumeStepIndex(0, emptyProfile(), {}, []), 0);
  // A typed 0 is an answer to rent, EMIs, spend, cash and investments, but not to income.
  const zeros = answered({ rent: 0, emi: 0, monthlySpend: 0, cashOnHand: 0, investedValue: 0 });
  assert.equal(firstUnanswered(zeros, { "cost:travel": "", timeline: "2" }, ["travel"]), STEPS.length - 1);
  assert.equal(firstUnanswered(answered({ takeHome: 0 }), { timeline: "2" }, ["travel"]), indexOf("takeHome"));
});

test("the price shown for a goal in the intake is the one the plan starts it at", () => {
  const rajesh = answered();
  // Six months of outgoings for the emergency fund, the catalogue price for the city otherwise.
  assert.equal(goalEstimate(GOAL_MAP.emergency, rajesh), emergencyTarget(rajesh));
  assert.equal(goalEstimate(GOAL_MAP.emergency, rajesh), 620000);
  assert.equal(goalEstimate(GOAL_MAP.emergency, emptyProfile()), 25000);
  for (const g of GOALS.filter((x) => x.id !== "emergency")) assert.equal(goalEstimate(g, rajesh), adjustedTarget(g, "tier1"), g.id);
  assert.equal(goalEstimate(GOAL_MAP.child, rajesh), 6500000);
  // No city yet: the same fallback the plan uses.
  assert.equal(goalEstimate(GOAL_MAP.home, emptyProfile()), adjustedTarget(GOAL_MAP.home, null));
});

test("only a price the person changed is stored; the estimate and a blank are not", () => {
  assert.equal(goalCostAnswer(20000, 200000), "20000");
  assert.equal(goalCostAnswer(70000.4, 100000), "70000");
  assert.equal(goalCostAnswer(200000, 200000), "");
  assert.equal(goalCostAnswer(0, 200000), "");
  assert.equal(goalCostAnswer(-5, 200000), "");
  assert.equal(goalCostAnswer(Number.NaN, 200000), "");
  // Stored or not, the plan ends on the number the person saw.
  const goal = { id: "travel", targetToday: 200000 };
  for (const typed of [200000, 20000, 0]) {
    const priced = applyGoalCosts([goal], { [goalCostKey("travel")]: goalCostAnswer(typed, 200000) });
    assert.equal(priced[0].targetToday, typed > 0 ? typed : 200000);
  }
});

test("the words of the intake do not read as advice, a pick or a price for NoBroke", () => {
  const banned = /recommend|advice|advis[eo]r|\bbest\b|fits you|suits you|matched to you|wealth management|financial planning|coming soon|\bsoon\b/i;
  for (const s of STEPS) assert.doesNotMatch(wordsOf(s), banned, `step "${s.id}"`);
  for (const st of STAGES) assert.doesNotMatch(`${st.label} ${st.desc}`, banned, `section ${st.n}`);
  // The line under each goal's name is read in the intake's cost step.
  for (const g of GOALS) {
    assert.ok(g.blurb.trim().length > 0, `${g.id} has no description`);
    assert.doesNotMatch(g.blurb, banned, `goal "${g.id}"`);
    assert.doesNotMatch(g.blurb, /·|;|!/, `goal "${g.id}" is not one plain sentence`);
    assert.ok(g.blurb.length <= 56, `goal "${g.id}" runs past two lines on a phone`);
  }
});
