import { adjustedTarget, emergencyTarget } from "./profile.ts";
import type { Goal, Profile } from "./types";

export type StepKind = "intro" | "goals" | "costs" | "single" | "money" | "account";

/** The intake answer that holds a picked goal's own price, in today's money. */
export const goalCostKey = (id: string) => `cost:${id}`;

/** The intake's own prices for the picked goals, where given: a positive
    number replaces the catalogue's estimate; a blank or anything else keeps
    it. A student's trip is ₹20,000, not the ₹2 L a family trip costs. */
export function applyGoalCosts<T extends { id: string; targetToday: number }>(goals: T[], answers: Record<string, string>): T[] {
  return goals.map((g) => {
    const v = Number(answers[goalCostKey(g.id)]);
    return Number.isFinite(v) && v > 0 ? { ...g, targetToday: Math.round(v) } : g;
  });
}

/** The price the plan starts a goal at when the person gives none: the
    catalogue's price for their city, except the emergency fund, which is
    sized to their own outgoings. The intake shows this number, so what a
    person sees before the plan is what the plan then uses. */
export function goalEstimate(goal: Goal, profile: Profile): number {
  return goal.id === "emergency" ? emergencyTarget(profile) : adjustedTarget(goal, profile.cityTier);
}

/** What the cost step stores for one goal. Only a price the person changed
    is an answer. A field left at the estimate, or left empty, stores a blank,
    so the plan keeps working the estimate out itself. */
export function goalCostAnswer(typed: number, estimate: number): string {
  if (!Number.isFinite(typed) || typed <= 0) return "";
  const v = Math.round(typed);
  return v === Math.round(estimate) ? "" : String(v);
}

export interface StepOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Step {
  id: string;
  kind: StepKind;
  stage: number;
  stageLabel: string;
  title: string;
  subtitle?: string;
  cta?: string;
  field?: string;
  options?: StepOption[];
  /** Lowest acceptable answer for money steps (validation, not a slider bound). */
  min?: number;
}

/**
 * The intake. Every question is compulsory: a plan built on blanks is a guess,
 * so there is no skip. The order is income, then outgoings, then what is
 * already held, then the person's situation, then goals.
 */
export const STEPS: Step[] = [
  {
    id: "intro",
    kind: "intro",
    stage: 0,
    stageLabel: "",
    title: "Start with your numbers.",
    subtitle:
      "A plan needs real numbers: what comes in, what goes out and what you already hold. There are five short sections. Every answer changes the plan, so none can be skipped.",
    cta: "Begin",
  },

  // ---- Stage 1: Income ----
  {
    id: "employment",
    kind: "single",
    stage: 1,
    stageLabel: "Income",
    field: "employment",
    title: "How do you earn?",
    options: [
      { value: "salaried", label: "Salaried", hint: "A fixed pay cheque" },
      { value: "self_employed", label: "Business owner", hint: "You run your own business" },
      { value: "freelancer", label: "Freelance or consulting", hint: "Paid by the project" },
      { value: "student", label: "Student", hint: "Stipend or part-time income" },
    ],
  },
  {
    id: "takeHome",
    kind: "money",
    stage: 1,
    stageLabel: "Income",
    field: "takeHome",
    min: 100,
    title: "What comes in each month?",
    subtitle: "Salary after tax, stipend, freelance income or pocket money. Count what actually reaches you. Every number in your plan starts from this.",
  },

  // ---- Stage 2: Spending ----
  {
    id: "rent",
    kind: "money",
    stage: 2,
    stageLabel: "Spending",
    field: "rent",
    title: "Monthly rent or home loan EMI?",
    subtitle: "Enter 0 if you own outright or live with family.",
  },
  {
    id: "emi",
    kind: "money",
    stage: 2,
    stageLabel: "Spending",
    field: "emi",
    title: "Other EMIs each month?",
    subtitle: "Car, education and personal loans, and pay-later. Enter 0 if none.",
  },
  {
    id: "monthlySpend",
    kind: "money",
    stage: 2,
    stageLabel: "Spending",
    field: "monthlySpend",
    title: "What else do you spend each month?",
    subtitle: "Groceries, bills, transport, eating out, subscriptions. A close estimate is fine.",
  },

  // ---- Stage 3: What you hold ----
  {
    id: "cashOnHand",
    kind: "money",
    stage: 3,
    stageLabel: "What you hold",
    field: "cashOnHand",
    title: "How much cash is in the bank today?",
    subtitle: "Savings accounts and deposits you can reach, including any emergency fund.",
  },
  {
    id: "investedValue",
    kind: "money",
    stage: 3,
    stageLabel: "What you hold",
    field: "investedValue",
    title: "What are your investments worth today?",
    subtitle: "Mutual funds, stocks, FDs, gold, EPF. A close estimate of today's value is fine. Enter 0 if you have none yet.",
  },

  // ---- Stage 4: About you ----
  {
    id: "city",
    kind: "single",
    stage: 4,
    stageLabel: "About you",
    field: "cityTier",
    title: "Where do you live?",
    subtitle: "Living costs change what your goals cost.",
    options: [
      { value: "metro", label: "Metro", hint: "Mumbai, Delhi, Bengaluru" },
      { value: "tier1", label: "Tier 1 city", hint: "Pune, Jaipur, Kochi" },
      { value: "tier2", label: "Tier 2 city", hint: "Indore, Nagpur" },
      { value: "tier3", label: "Town or smaller city", hint: "Everywhere else" },
    ],
  },
  {
    id: "stage",
    kind: "single",
    stage: 4,
    stageLabel: "About you",
    field: "careerStage",
    title: "Where are you in your career?",
    options: [
      { value: "studying", label: "Still studying", hint: "Not working full-time yet" },
      { value: "starting", label: "Early career", hint: "First few working years" },
      { value: "growing", label: "Growing", hint: "Income rising year on year" },
      { value: "stable", label: "Established", hint: "Income largely settled" },
    ],
  },
  {
    id: "dependents",
    kind: "single",
    stage: 4,
    stageLabel: "About you",
    field: "dependents",
    title: "Who counts on your income?",
    subtitle: "The plan takes less risk when others depend on you.",
    options: [
      { value: "none", label: "Just me", hint: "No dependants" },
      { value: "partner", label: "A partner" },
      { value: "kids", label: "Partner and kids" },
      { value: "parents", label: "Parents or extended family" },
    ],
  },

  // ---- Stage 5: Goals ----
  {
    id: "goals",
    kind: "goals",
    stage: 5,
    stageLabel: "Goals",
    title: "What do you want to plan for?",
    subtitle: "Pick up to three. Each amount is an estimate of today's price. You can change it on the next screen.",
  },
  {
    id: "costs",
    kind: "costs",
    stage: 5,
    stageLabel: "Goals",
    title: "What will each one cost?",
    subtitle: "Prices today. We have filled in an estimate for each. Change any you know better.",
  },
  {
    id: "timeline",
    kind: "single",
    stage: 5,
    stageLabel: "Goals",
    field: "timeline",
    title: "When do you need the first one?",
    subtitle: "A rough answer is fine. You can change the year later.",
    options: [
      { value: "2", label: "Within 2 years" },
      { value: "4", label: "3 to 5 years" },
      { value: "8", label: "6 to 10 years" },
      { value: "14", label: "10 years or more" },
    ],
  },

  {
    id: "account",
    kind: "account",
    stage: 0,
    stageLabel: "",
    title: "Your plan is ready.",
    subtitle: "You can see it now. To save it and open it on any device, create an account. Accounts are by invitation for now.",
    cta: "See my plan",
  },
];

/** One line on what each section asks for, by its number. */
const STAGE_DESC: Record<number, string> = {
  1: "What comes in each month.",
  2: "Rent, EMIs and everything else that goes out.",
  3: "Cash and investments you have today.",
  4: "City, career and who depends on you.",
  5: "What you want, what it costs and when.",
};

export interface Stage {
  n: number;
  label: string;
  desc: string;
  /** How many questions the section holds. */
  steps: number;
}

/** The intake's sections, read off the steps themselves, so the rail, the
    progress bar and the "Section 2 of 5" count can never drift from the
    questions actually asked. */
export const STAGES: Stage[] = [...new Set(STEPS.map((s) => s.stage).filter((n) => n > 0))]
  .sort((a, b) => a - b)
  .map((n) => {
    const inStage = STEPS.filter((s) => s.stage === n);
    return { n, label: inStage[0].stageLabel, desc: STAGE_DESC[n] ?? "", steps: inStage.length };
  });

export const TOTAL_STAGES = STAGES.length;

/** A stored step index, made safe to read. The index lives in the browser's
    saved state, and a step has since been removed from the middle of the
    list, so an older saved intake can point past the end. Anything that is
    not a step number in range lands on the nearest real step. */
export function clampStepIndex(i: unknown): number {
  const n = typeof i === "number" && Number.isFinite(i) ? Math.trunc(i) : 0;
  return Math.min(Math.max(0, n), STEPS.length - 1);
}

/** The first question that plainly has no answer yet: a choice never made,
    an income never entered, no goal picked. A typed 0 is a real answer to
    most money questions ("Enter 0 if none"), so those are never counted as
    blank. Returns the last step when nothing is missing. */
export function firstUnanswered(profile: Profile, answers: Record<string, string>, goalIds: string[]): number {
  const stored = profile as unknown as Record<string, string | number | null | undefined>;
  const at = STEPS.findIndex((step) => {
    if (step.kind === "goals") return goalIds.length === 0;
    if (step.kind === "costs") return goalIds.some((id) => !(goalCostKey(id) in answers));
    if (!step.field) return false;
    const v = step.field in stored ? stored[step.field] : answers[step.field];
    if (step.kind === "single") return v == null || v === "";
    if (step.kind === "money") return (step.min ?? 0) > 0 && !(Number(v) >= step.min!);
    return false;
  });
  return at === -1 ? STEPS.length - 1 : at;
}

/** Where an intake saved in the browser picks up again. The saved step
    number can be ahead of the answers, because it counts steps and the step
    list has changed since it was saved. Resuming never lands past a question
    that has no answer, so none is skipped. */
export function resumeStepIndex(storedIndex: unknown, profile: Profile, answers: Record<string, string>, goalIds: string[]): number {
  return Math.min(clampStepIndex(storedIndex), firstUnanswered(profile, answers, goalIds));
}

/** How full each section's segment of the progress rail is at a step: 1 for
    sections already passed, 0 for those ahead. The current section counts
    the questions answered plus half of the one on screen, so its segment has
    visibly started on the first question and is not yet full on the last.
    The intro shows an empty rail and the account step a full one. */
export function stageFill(stepIndex: number): number[] {
  const step = STEPS[clampStepIndex(stepIndex)];
  if (step.kind === "account") return STAGES.map(() => 1);
  return STAGES.map((st) => {
    if (st.n < step.stage) return 1;
    if (st.n > step.stage) return 0;
    const inStage = STEPS.filter((s) => s.stage === st.n);
    return (inStage.indexOf(step) + 0.5) / inStage.length;
  });
}
