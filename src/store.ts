import { useSyncExternalStore } from "react";
import type { Allocation, ChatMessage, PlanGoal, PlanInputs, Profile, RiskProfile } from "./lib/types";
import { GOAL_MAP } from "./lib/goals";
import { autoAllocation } from "./lib/portfolios";
import { adjustedTarget, emptyProfile, suggestedSip } from "./lib/profile";
import { askGroq } from "./lib/groq";
import { FUND_MAP } from "./lib/funds";
import { computePlan } from "./lib/finance";

export type Screen = "landing" | "onboarding" | "dashboard";

export interface AppState {
  screen: Screen;
  onboardingStepIndex: number;
  onboardingAnswers: Record<string, string>;
  selectedGoalIds: string[];
  profile: Profile;
  inflation: number;
  monthlySip: number;
  currentSavings: number;
  goals: PlanGoal[];
  currentGoalId: string;
  chatOpen: boolean;
  chat: ChatMessage[];
  chatTyping: boolean;
}

let state: AppState = {
  screen: "landing",
  onboardingStepIndex: 0,
  onboardingAnswers: {},
  selectedGoalIds: [],
  profile: emptyProfile(),
  inflation: 0.06,
  monthlySip: 25000,
  currentSavings: 0,
  goals: [],
  currentGoalId: "",
  chatOpen: false,
  chat: [],
  chatTyping: false,
};

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  emit();
}

export function getState(): AppState {
  return state;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---- Derived helpers ----
export function currentGoal(s: AppState = state): PlanGoal | undefined {
  return s.goals.find((g) => g.id === s.currentGoalId);
}
export function toPlanInputs(s: AppState = state): PlanInputs {
  const g = currentGoal(s);
  return {
    targetToday: g?.targetToday ?? 0,
    horizonYears: g?.horizonYears ?? 1,
    currentSavings: s.currentSavings,
    monthlySip: s.monthlySip,
    inflation: s.inflation,
    allocation: g?.allocation ?? {},
  };
}
export function planInputsForGoal(s: AppState, g: PlanGoal): PlanInputs {
  return {
    targetToday: g.targetToday,
    horizonYears: g.horizonYears,
    currentSavings: s.currentSavings,
    monthlySip: s.monthlySip,
    inflation: s.inflation,
    allocation: g.allocation,
  };
}
function buildPlanGoal(goalId: string, profile: Profile, horizonOverride?: number): PlanGoal {
  const g = GOAL_MAP[goalId];
  const horizon = horizonOverride ?? g.horizonYears;
  const auto = autoAllocation(horizon);
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    targetToday: adjustedTarget(g, profile.cityTier),
    horizonYears: horizon,
    allocation: { ...auto.allocation },
    activeProfile: auto.profile,
  };
}

// ---- Navigation ----
export const actions = {
  goLanding: () => set({ screen: "landing" }),

  startOnboarding: () =>
    set({ screen: "onboarding", onboardingStepIndex: 0, onboardingAnswers: {}, selectedGoalIds: [], profile: emptyProfile() }),

  setStep: (i: number) => set({ onboardingStepIndex: Math.max(0, i) }),

  setProfileField: (field: keyof Profile, value: string | number) =>
    set({ profile: { ...state.profile, [field]: value } as Profile }),

  setAnswer: (field: string, value: string) =>
    set({ onboardingAnswers: { ...state.onboardingAnswers, [field]: value } }),

  toggleGoal: (id: string) => {
    let sel = [...state.selectedGoalIds];
    if (sel.includes(id)) sel = sel.filter((x) => x !== id);
    else if (sel.length < 3) sel.push(id);
    else return;
    set({ selectedGoalIds: sel });
  },

  finishOnboarding: () => {
    const selected = state.selectedGoalIds.length ? state.selectedGoalIds : ["home"];
    const timeline = state.onboardingAnswers.timeline ? Number(state.onboardingAnswers.timeline) : undefined;
    const goals = selected.map((id, i) => buildPlanGoal(id, state.profile, i === 0 ? timeline : undefined));
    set({
      goals,
      currentGoalId: goals[0].id,
      monthlySip: suggestedSip(state.profile),
      currentSavings: state.profile.existingSavings,
      screen: "dashboard",
    });
  },

  startDemo: () => {
    const profile: Profile = {
      cityTier: "metro",
      employment: "salaried",
      careerStage: "stable",
      rent: 30000,
      emi: 12000,
      takeHome: 185000,
      existingSavings: 1500000,
    };
    const selected = ["home", "travel", "fire"];
    const goals = selected.map((id, i) => buildPlanGoal(id, profile, i === 0 ? 7 : undefined));
    set({
      profile,
      selectedGoalIds: selected,
      goals,
      currentGoalId: goals[0].id,
      monthlySip: suggestedSip(profile),
      currentSavings: profile.existingSavings,
      screen: "dashboard",
    });
  },

  // ---- Dashboard ----
  setCurrentGoal: (id: string) => set({ currentGoalId: id }),

  updateCurrentGoal: (patch: Partial<PlanGoal>) =>
    set({ goals: state.goals.map((g) => (g.id === state.currentGoalId ? { ...g, ...patch } : g)) }),

  setAllocation: (allocation: Allocation, activeProfile: RiskProfile | null) =>
    set({ goals: state.goals.map((g) => (g.id === state.currentGoalId ? { ...g, allocation, activeProfile } : g)) }),

  addGoal: (id: string) => {
    if (state.goals.some((g) => g.id === id)) {
      set({ currentGoalId: id });
      return;
    }
    const goal = buildPlanGoal(id, state.profile);
    set({ goals: [...state.goals, goal], currentGoalId: goal.id });
  },

  setSip: (v: number) => set({ monthlySip: v }),
  setSavings: (v: number) => set({ currentSavings: v }),
  setInflation: (v: number) => set({ inflation: v }),

  // ---- Chat (Groq-powered) ----
  openChat: () => set({ chatOpen: true }),
  closeChat: () => set({ chatOpen: false, chat: [], chatTyping: false }),

  sendChat: (text: string) => {
    const t = text.trim();
    if (!t || state.chatTyping) return;
    const history: ChatMessage[] = [...state.chat, { role: "user", text: t }];
    const planData = buildPlanData(state);
    set({ chat: history, chatTyping: true });
    void askGroq(history, planData).then((reply) => {
      set({ chat: [...getState().chat, { role: "ai", text: reply }], chatTyping: false });
    });
  },
};

/** Compact plan JSON injected into the AI's system prompt on the dashboard. */
function buildPlanData(s: AppState): unknown | null {
  const g = currentGoal(s);
  if (s.screen !== "dashboard" || !g) return null;
  const r = computePlan(toPlanInputs(s));
  const allocationPct: Record<string, number> = {};
  for (const [id, w] of Object.entries(g.allocation)) allocationPct[FUND_MAP[id]?.name ?? id] = w;
  return {
    goal: g.name,
    targetTodayINR: g.targetToday,
    horizonYears: g.horizonYears,
    monthlySipINR: s.monthlySip,
    currentSavingsINR: s.currentSavings,
    inflationPct: Math.round(s.inflation * 100),
    projectedCorpusINR: Math.round(r.projectedCorpus),
    requiredCorpusINR: Math.round(r.requiredCorpus),
    gapINR: Math.round(r.gap),
    onTrack: r.onTrack,
    expectedReturnPct: Math.round(r.blendedReturn * 1000) / 10,
    allocationPct,
    otherGoals: s.goals.filter((x) => x.id !== g.id).map((x) => x.name),
  };
}
