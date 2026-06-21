import { useSyncExternalStore } from "react";
import type { Allocation, ChatMessage, Holding, PlanGoal, PlanInputs, Profile, RiskProfile } from "./lib/types";
import { GOAL_MAP } from "./lib/goals";
import { autoAllocation } from "./lib/portfolios";
import { adjustedTarget, emptyProfile, suggestedSip } from "./lib/profile";
import { askGroq } from "./lib/groq";
import { FUND_MAP } from "./lib/funds";
import { computePlan, blendedReturn, requiredCorpus, requiredSip } from "./lib/finance";

export type Screen = "landing" | "onboarding" | "plan";

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
  /** Per-goal share of the monthly investment, as a percent (sums to 100). */
  goalShares: Record<string, number>;
  /** Goal ids in priority order (default: shortest tenure first). */
  goalOrder: string[];
  /** True once the user manually reorders priority (stops auto-sort by tenure). */
  goalOrderCustom: boolean;
  /** Existing investments the user adds manually; sum can be applied to current savings. */
  externalHoldings: Holding[];
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
  goalShares: {},
  goalOrder: [],
  goalOrderCustom: false,
  externalHoldings: [],
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
/** Fraction (0..1) of the monthly pool assigned to a goal; equal split as a fallback. */
export function goalShareFraction(s: AppState, id: string): number {
  const v = s.goalShares[id];
  if (v == null) return s.goals.length ? 1 / s.goals.length : 1;
  return v / 100;
}
export function goalMonthly(s: AppState, id: string): number {
  return s.monthlySip * goalShareFraction(s, id);
}
/** Goals in priority order (falls back to declaration order). */
export function goalsByPriority(s: AppState = state): PlanGoal[] {
  const order = s.goalOrder.length ? s.goalOrder : s.goals.map((g) => g.id);
  const byId = new Map(s.goals.map((g) => [g.id, g] as const));
  const out: PlanGoal[] = [];
  for (const id of order) {
    const g = byId.get(id);
    if (g) out.push(g);
  }
  for (const g of s.goals) if (!order.includes(g.id)) out.push(g);
  return out;
}
export function planInputsForGoal(s: AppState, g: PlanGoal): PlanInputs {
  const share = goalShareFraction(s, g.id);
  return {
    targetToday: g.targetToday,
    horizonYears: g.horizonYears,
    currentSavings: s.currentSavings * share,
    monthlySip: s.monthlySip * share,
    inflation: s.inflation,
    allocation: g.allocation,
  };
}
export function toPlanInputs(s: AppState = state): PlanInputs {
  const g = currentGoal(s);
  if (!g) return { targetToday: 0, horizonYears: 1, currentSavings: 0, monthlySip: 0, inflation: s.inflation, allocation: {} };
  return planInputsForGoal(s, g);
}

/** Recommend how to split the monthly pool across goals: fund the highest-priority
    (shortest-tenure) goals' monthly need first (waterfall); if there's surplus, split
    it proportionally to need. Returns percents summing to ~100. */
export function recommendShares(goals: PlanGoal[], order: string[], monthlySip: number, inflation: number): Record<string, number> {
  const shares: Record<string, number> = {};
  if (goals.length === 0) return shares;
  if (monthlySip <= 0) {
    const each = 100 / goals.length;
    for (const g of goals) shares[g.id] = each;
    return shares;
  }
  const required: Record<string, number> = {};
  let totalReq = 0;
  for (const g of goals) {
    const reqCorpus = requiredCorpus(g.targetToday, inflation, g.horizonYears);
    const req = requiredSip(reqCorpus, 0, blendedReturn(g.allocation), g.horizonYears);
    required[g.id] = req;
    totalReq += req;
  }
  if (totalReq <= 0) {
    const each = 100 / goals.length;
    for (const g of goals) shares[g.id] = each;
    return shares;
  }
  if (monthlySip >= totalReq) {
    for (const g of goals) shares[g.id] = (required[g.id] / totalReq) * 100;
    return shares;
  }
  const ordered = order.length ? order.filter((id) => goals.some((g) => g.id === id)) : goals.map((g) => g.id);
  let remaining = monthlySip;
  for (const id of ordered) {
    const give = Math.max(0, Math.min(required[id] ?? 0, remaining));
    shares[id] = (give / monthlySip) * 100;
    remaining -= give;
  }
  for (const g of goals) if (!(g.id in shares)) shares[g.id] = 0;
  return shares;
}

function orderByTenure(goals: PlanGoal[]): string[] {
  return [...goals].sort((a, b) => a.horizonYears - b.horizonYears).map((g) => g.id);
}
function buildPlanGoal(goalId: string, profile: Profile, horizonOverride?: number, confirmed = false): PlanGoal {
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
    tenureConfirmed: confirmed,
  };
}

// ---- Navigation ----
export const actions = {
  goLanding: () => set({ screen: "landing" }),
  goPlan: () => set({ screen: "plan" }),

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
    const goals = selected.map((id, i) =>
      buildPlanGoal(id, state.profile, i === 0 ? timeline : undefined, i === 0 && timeline != null),
    );
    const monthlySip = suggestedSip(state.profile);
    const order = orderByTenure(goals);
    set({
      goals,
      currentGoalId: goals[0].id,
      goalOrder: order,
      goalShares: recommendShares(goals, order, monthlySip, state.inflation),
      goalOrderCustom: false,
      monthlySip,
      currentSavings: state.profile.existingSavings,
      screen: "plan",
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
    const goals = selected.map((id, i) => buildPlanGoal(id, profile, i === 0 ? 7 : undefined, true));
    const monthlySip = suggestedSip(profile);
    const order = orderByTenure(goals);
    set({
      profile,
      selectedGoalIds: selected,
      goals,
      currentGoalId: goals[0].id,
      goalOrder: order,
      goalShares: recommendShares(goals, order, monthlySip, state.inflation),
      goalOrderCustom: false,
      monthlySip,
      currentSavings: profile.existingSavings,
      screen: "plan",
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
    const goals = [...state.goals, goal];
    const order = state.goalOrderCustom ? [...state.goalOrder, goal.id] : orderByTenure(goals);
    set({
      goals,
      currentGoalId: goal.id,
      goalOrder: order,
      goalShares: recommendShares(goals, order, state.monthlySip, state.inflation),
    });
  },

  setSip: (v: number) => set({ monthlySip: v }),
  setSavings: (v: number) => set({ currentSavings: v }),
  setInflation: (v: number) => set({ inflation: v }),

  // ---- Goal-based waterfall: target year, priority, money split ----
  setGoalTarget: (id: string, targetToday: number) =>
    set({ goals: state.goals.map((g) => (g.id === id ? { ...g, targetToday: Math.max(0, Math.round(targetToday)) } : g)) }),
  setGoalTenure: (id: string, horizonYears: number) => {
    const h = Math.max(1, Math.round(horizonYears));
    const goals = state.goals.map((g) => (g.id === id ? { ...g, horizonYears: h, tenureConfirmed: true } : g));
    set({ goals, goalOrder: state.goalOrderCustom ? state.goalOrder : orderByTenure(goals) });
  },
  moveGoalPriority: (id: string, dir: -1 | 1) => {
    const order = state.goalOrder.length ? [...state.goalOrder] : state.goals.map((g) => g.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set({ goalOrder: order, goalOrderCustom: true });
  },
  reorderGoals: (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const order = state.goalOrder.length ? [...state.goalOrder] : state.goals.map((g) => g.id);
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedId);
    set({ goalOrder: order, goalOrderCustom: true });
  },
  setGoalAmount: (id: string, amountINR: number) => {
    const sip = state.monthlySip;
    const ids = state.goals.map((g) => g.id);
    if (ids.length === 0 || sip <= 0) return;
    if (ids.length === 1) {
      set({ goalShares: { [id]: 100 } });
      return;
    }
    const wv = Math.max(0, Math.min(100, (amountINR / sip) * 100));
    const others = ids.filter((k) => k !== id);
    const otherTotal = others.reduce((acc, k) => acc + (state.goalShares[k] ?? 0), 0);
    const rest = 100 - wv;
    const shares: Record<string, number> = { [id]: wv };
    for (const k of others) shares[k] = otherTotal > 0 ? ((state.goalShares[k] ?? 0) / otherTotal) * rest : rest / others.length;
    set({ goalShares: shares });
  },
  recommendGoalSplit: () => set({ goalShares: recommendShares(state.goals, state.goalOrder, state.monthlySip, state.inflation) }),

  // Removes a goal and renormalizes the remaining shares so the split still sums
  // to 100% — no leak between the per-goal money and the monthly pool.
  removeGoal: (id: string) => {
    const goals = state.goals.filter((g) => g.id !== id);
    const goalOrder = state.goalOrder.filter((x) => x !== id);
    const remaining = Object.fromEntries(Object.entries(state.goalShares).filter(([k]) => k !== id));
    const total = Object.values(remaining).reduce((s, v) => s + (v > 0 ? v : 0), 0);
    let goalShares: Record<string, number> = {};
    if (goals.length === 0) goalShares = {};
    else if (total > 0)
      goalShares = Object.fromEntries(Object.entries(remaining).map(([k, v]) => [k, v > 0 ? (v / total) * 100 : 0]));
    else {
      const each = 100 / goals.length;
      for (const g of goals) goalShares[g.id] = each;
    }
    const currentGoalId = state.currentGoalId === id ? goals[0]?.id ?? "" : state.currentGoalId;
    set({ goals, goalOrder, goalShares, currentGoalId });
  },

  // ---- Existing investments (added manually; sum can feed total current savings) ----
  addHolding: (h: Omit<Holding, "id">) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    set({ externalHoldings: [...state.externalHoldings, { id, ...h }] });
  },
  removeHolding: (id: string) => set({ externalHoldings: state.externalHoldings.filter((h) => h.id !== id) }),
  applyHoldingsToSavings: () => set({ currentSavings: state.externalHoldings.reduce((s, h) => s + (h.amount > 0 ? h.amount : 0), 0) }),

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
  if (s.screen !== "plan" || !g) return null;
  const r = computePlan(toPlanInputs(s));
  const allocationPct: Record<string, number> = {};
  for (const [id, w] of Object.entries(g.allocation)) allocationPct[FUND_MAP[id]?.name ?? id] = w;
  return {
    goal: g.name,
    targetTodayINR: g.targetToday,
    horizonYears: g.horizonYears,
    monthlySipINR: Math.round(goalMonthly(s, g.id)),
    monthlyPoolINR: s.monthlySip,
    currentSavingsINR: Math.round(s.currentSavings * goalShareFraction(s, g.id)),
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
