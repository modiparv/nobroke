import { useSyncExternalStore } from "react";
import type { Allocation, ChatMessage, Holding, PlanGoal, PlanInputs, Profile, RiskProfile } from "./lib/types";
import { GOAL_MAP } from "./lib/goals";
import { autoAllocation, MODEL_PORTFOLIOS } from "./lib/portfolios";
import { adjustedTarget, emptyProfile, suggestedSip } from "./lib/profile";
import { assessRiskAppetite, capProfile } from "./lib/risk";
import { askGroq } from "./lib/groq";
import { FUND_MAP } from "./lib/funds";
import { computePlan, blendedReturn, requiredCorpus, requiredSip } from "./lib/finance";
import { formatINR } from "./lib/format";
import { parseCommand, type Command } from "./lib/command";

export type Screen = "landing" | "onboarding" | "plan";

export interface AppState {
  screen: Screen;
  onboardingStepIndex: number;
  onboardingAnswers: Record<string, string>;
  selectedGoalIds: string[];
  profile: Profile;
  inflation: number;
  /** Where the inflation assumption came from; a user's explicit choice is never overwritten. */
  inflationSource: "default" | "macro" | "user";
  /** 0..100. Assessed from the intake, adjustable by hand; caps every mix recommendation. */
  riskAppetite: number;
  riskAppetiteSource: "assessed" | "user";
  monthlySip: number;
  currentSavings: number;
  /** Monthly take-home income from the intake; editable later in Money. */
  monthlyIncome: number;
  /** Total monthly outgoings: rent + EMIs + everything else. */
  monthlyExpenses: number;
  goals: PlanGoal[];
  currentGoalId: string;
  /** Per-goal share of the monthly investment, as a percent (sums to 100). */
  goalShares: Record<string, number>;
  /** Goal ids in priority order (default: shortest tenure first). */
  goalOrder: string[];
  /** True once the user manually reorders priority (stops auto-sort by tenure). */
  goalOrderCustom: boolean;
  /** Which surface is showing. Plan is the only screen most users ever see. */
  tab: "plan" | "money";
  /**
   * True once the user sets a goal's monthly amount by hand. Balancing the split
   * is otherwise silent and automatic (there is no Auto-balance button), but an
   * explicit edit must never be quietly overwritten.
   */
  goalSharesCustom: boolean;
  /** The single shared portfolio every goal's money grows in (one mix for all goals). */
  portfolio: Allocation;
  /** Risk preset backing the shared portfolio, if one is active. */
  portfolioProfile: RiskProfile | null;
  /** True once the user hand-edits the portfolio (stops auto re-recommendation). */
  portfolioCustom: boolean;
  /** Existing investments the user adds manually; sum can be applied to current savings. */
  externalHoldings: Holding[];
  chatOpen: boolean;
  chat: ChatMessage[];
  chatTyping: boolean;
}

const defaults: AppState = {
  screen: "landing",
  onboardingStepIndex: 0,
  onboardingAnswers: {},
  selectedGoalIds: [],
  profile: emptyProfile(),
  inflation: 0.06,
  inflationSource: "default",
  riskAppetite: 50,
  riskAppetiteSource: "assessed",
  monthlySip: 25000,
  currentSavings: 0,
  monthlyIncome: 0,
  monthlyExpenses: 0,
  goals: [],
  currentGoalId: "",
  goalShares: {},
  goalOrder: [],
  goalOrderCustom: false,
  tab: "plan",
  goalSharesCustom: false,
  portfolio: {},
  portfolioProfile: null,
  portfolioCustom: false,
  externalHoldings: [],
  chatOpen: false,
  chat: [],
  chatTyping: false,
};

/**
 * Persistence: the plan survives a refresh. Everything except the chat thread
 * is saved to localStorage a moment after each change; a version key means a
 * future shape change degrades to a clean start, never a crash.
 */
const STORAGE_KEY = "nobroke_state_v1";

function loadPersisted(): Partial<AppState> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; state?: Partial<AppState> };
    if (parsed?.v !== 1 || typeof parsed.state !== "object" || parsed.state === null) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

let state: AppState = { ...defaults, ...loadPersisted(), chatOpen: false, chat: [], chatTyping: false };

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (typeof localStorage === "undefined") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { chat: _c, chatOpen: _o, chatTyping: _t, ...rest } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, state: rest }));
    } catch {
      // Storage full or blocked: the app still works, it just will not survive a refresh.
    }
  }, 300);
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  persist();
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
/** Sum of the user's already-invested holdings (existing investments). */
export function holdingsTotal(s: AppState = state): number {
  return s.externalHoldings.reduce((sum, h) => sum + (h.amount > 0 ? h.amount : 0), 0);
}
/** Money already working toward goals = cash in hand/bank + existing investments. */
export function totalCapital(s: AppState = state): number {
  return s.currentSavings + holdingsTotal(s);
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
    // Starting corpus = cash in hand + existing investments, split per goal.
    currentSavings: totalCapital(s) * share,
    monthlySip: s.monthlySip * share,
    inflation: s.inflation,
    allocation: s.portfolio,
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
export function recommendShares(goals: PlanGoal[], order: string[], monthlySip: number, inflation: number, allocation: Allocation): Record<string, number> {
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
    const req = requiredSip(reqCorpus, 0, blendedReturn(allocation), g.horizonYears);
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
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    targetToday: adjustedTarget(g, profile.cityTier),
    horizonYears: horizon,
    tenureConfirmed: confirmed,
  };
}

/** One portfolio for all goals. As an advisor would, we calibrate its risk to the
    goals' corpus-weighted time horizon — bigger / longer goals pull the single mix
    toward equity, shorter ones toward debt — then flag any near-term mismatch in
    the UI. This keeps the user on ONE simple mix instead of a basket per goal. */
export function recommendedPortfolio(
  goals: PlanGoal[],
  riskAppetite = 50,
): { allocation: Allocation; profile: RiskProfile } {
  if (goals.length === 0) return { allocation: {}, profile: "balanced" };
  let weight = 0;
  let weightedYears = 0;
  for (const g of goals) {
    const w = Math.max(1, g.targetToday);
    weight += w;
    weightedYears += w * g.horizonYears;
  }
  const horizon = weight > 0 ? weightedYears / weight : goals[0].horizonYears;
  // Horizon suggests the mix; the person's risk appetite caps it.
  const profile = capProfile(autoAllocation(horizon).profile, riskAppetite);
  return { allocation: { ...MODEL_PORTFOLIOS[profile].allocation }, profile };
}

// ---- Navigation ----
export const actions = {
  goLanding: () => set({ screen: "landing" }),
  goPlan: () => set({ screen: "plan" }),
  setTab: (tab: AppState["tab"]) => set({ tab }),

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
    const p = state.profile;
    const selected = state.selectedGoalIds.length ? state.selectedGoalIds : ["home"];
    const timeline = state.onboardingAnswers.timeline ? Number(state.onboardingAnswers.timeline) : undefined;
    const goals = selected.map((id, i) =>
      buildPlanGoal(id, p, i === 0 ? timeline : undefined, i === 0 && timeline != null),
    );
    const monthlySip = suggestedSip(p);
    const order = orderByTenure(goals);
    const riskAppetite = assessRiskAppetite({
      profile: p,
      goals,
      monthlyIncome: p.takeHome,
      monthlyExpenses: p.rent + p.emi + p.monthlySpend,
      currentSavings: p.cashOnHand,
    });
    const { allocation: portfolio, profile: portfolioProfile } = recommendedPortfolio(goals, riskAppetite);
    set({
      goals,
      currentGoalId: goals[0].id,
      goalOrder: order,
      goalShares: recommendShares(goals, order, monthlySip, state.inflation, portfolio),
      goalOrderCustom: false,
      riskAppetite,
      riskAppetiteSource: "assessed",
      monthlySip,
      monthlyIncome: p.takeHome,
      monthlyExpenses: p.rent + p.emi + p.monthlySpend,
      currentSavings: p.cashOnHand,
      externalHoldings:
        p.investedValue > 0
          ? [{ id: "intake", category: "Funds", type: "Portfolio", name: "Existing investments", amount: p.investedValue }]
          : [],
      portfolio,
      portfolioProfile,
      portfolioCustom: false,
      screen: "plan",
    });
  },

  startDemo: () => {
    const profile: Profile = {
      cityTier: "metro",
      employment: "salaried",
      careerStage: "stable",
      dependents: "partner",
      rent: 30000,
      emi: 12000,
      monthlySpend: 55000,
      takeHome: 185000,
      cashOnHand: 400000,
      investedValue: 1100000,
    };
    const selected = ["home", "travel", "fire"];
    const goals = selected.map((id, i) => buildPlanGoal(id, profile, i === 0 ? 7 : undefined, true));
    const monthlySip = suggestedSip(profile);
    const order = orderByTenure(goals);
    const riskAppetite = assessRiskAppetite({
      profile,
      goals,
      monthlyIncome: profile.takeHome,
      monthlyExpenses: profile.rent + profile.emi + profile.monthlySpend,
      currentSavings: profile.cashOnHand,
    });
    const { allocation: portfolio, profile: portfolioProfile } = recommendedPortfolio(goals, riskAppetite);
    set({
      profile,
      selectedGoalIds: selected,
      riskAppetite,
      riskAppetiteSource: "assessed",
      goals,
      currentGoalId: goals[0].id,
      goalOrder: order,
      goalShares: recommendShares(goals, order, monthlySip, state.inflation, portfolio),
      goalOrderCustom: false,
      monthlySip,
      monthlyIncome: profile.takeHome,
      monthlyExpenses: profile.rent + profile.emi + profile.monthlySpend,
      currentSavings: profile.cashOnHand,
      externalHoldings: [
        { id: "intake", category: "Funds", type: "Portfolio", name: "Existing investments", amount: profile.investedValue },
      ],
      portfolio,
      portfolioProfile,
      portfolioCustom: false,
      screen: "plan",
    });
  },

  // ---- Dashboard ----
  setCurrentGoal: (id: string) => set({ currentGoalId: id }),

  updateCurrentGoal: (patch: Partial<PlanGoal>) =>
    set({ goals: state.goals.map((g) => (g.id === state.currentGoalId ? { ...g, ...patch } : g)) }),

  /** The one portfolio every goal shares. Editing it marks it custom so we stop
      auto-re-recommending a mix from the goals' horizon. */
  setPortfolio: (portfolio: Allocation, portfolioProfile: RiskProfile | null) =>
    set({ portfolio, portfolioProfile, portfolioCustom: true }),
  /** The user owns the dial. Recommendations respect it immediately; a mix
      the user built by hand is left alone. */
  setRiskAppetite: (v: number) => {
    const riskAppetite = Math.max(0, Math.min(100, Math.round(v)));
    if (state.portfolioCustom || state.goals.length === 0) {
      set({ riskAppetite, riskAppetiteSource: "user" });
      return;
    }
    const rec = recommendedPortfolio(state.goals, riskAppetite);
    set({
      riskAppetite,
      riskAppetiteSource: "user",
      portfolio: rec.allocation,
      portfolioProfile: rec.profile,
    });
  },

  /** Re-tune the single mix to the goals' blended horizon (the ✨ advisor pick). */
  recommendPortfolio: () => {
    const { allocation, profile } = recommendedPortfolio(state.goals, state.riskAppetite);
    set({ portfolio: allocation, portfolioProfile: profile, portfolioCustom: false });
  },

  addGoal: (id: string) => {
    if (state.goals.some((g) => g.id === id)) {
      set({ currentGoalId: id });
      return;
    }
    const goal = buildPlanGoal(id, state.profile);
    const goals = [...state.goals, goal];
    const order = state.goalOrderCustom ? [...state.goalOrder, goal.id] : orderByTenure(goals);
    // A new goal can shift the goals' blended horizon, so re-tune the shared
    // portfolio too — unless the user has hand-customized it.
    const rec = recommendedPortfolio(goals, state.riskAppetite);
    const portfolio = state.portfolioCustom ? state.portfolio : rec.allocation;
    const portfolioProfile = state.portfolioCustom ? state.portfolioProfile : rec.profile;
    set({
      goals,
      currentGoalId: goal.id,
      goalOrder: order,
      goalShares: recommendShares(goals, order, state.monthlySip, state.inflation, portfolio),
      portfolio,
      portfolioProfile,
    });
  },

  setSip: (v: number) => {
    // Rebalancing across goals is the silent default; only an explicit per-goal
    // edit pins the split (spec section 4).
    if (state.goalSharesCustom) return set({ monthlySip: v });
    set({
      monthlySip: v,
      goalShares: recommendShares(state.goals, state.goalOrder, v, state.inflation, state.portfolio),
    });
  },
  setSavings: (v: number) => set({ currentSavings: v }),
  setIncome: (v: number) => set({ monthlyIncome: Math.max(0, Math.round(v)) }),
  setExpenses: (v: number) => set({ monthlyExpenses: Math.max(0, Math.round(v)) }),
  setInflation: (v: number) => set({ inflation: v, inflationSource: "user" }),

  /** Live CPI from the macro feed becomes the planning default, but never
      tramples an inflation rate the user set by hand. */
  applyMacroInflation: (annualPct: number) => {
    if (state.inflationSource === "user") return;
    if (!(annualPct > 0) || annualPct > 25) return;
    set({ inflation: Math.round(annualPct * 10) / 1000, inflationSource: "macro" });
  },

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
  /** Pin one goal's monthly amount, then hand the REMAINDER back to the
      recommendation model: the other goals re-split by the priority waterfall
      (nearest goals funded first), not by dumb proportional scaling. */
  setGoalAmount: (id: string, amountINR: number) => {
    const sip = state.monthlySip;
    const goals = state.goals;
    if (goals.length === 0 || sip <= 0) return;
    if (goals.length === 1) {
      set({ goalShares: { [id]: 100 }, goalSharesCustom: true });
      return;
    }
    const pinnedPct = Math.max(0, Math.min(100, (amountINR / sip) * 100));
    const others = goals.filter((g) => g.id !== id);
    const order = (state.goalOrder.length ? state.goalOrder : goals.map((g) => g.id)).filter((x) => x !== id);
    const remaining = sip * (1 - pinnedPct / 100);
    const shares: Record<string, number> = { [id]: pinnedPct };
    if (remaining <= 0) {
      for (const g of others) shares[g.id] = 0;
    } else {
      const rec = recommendShares(others, order, remaining, state.inflation, state.portfolio);
      for (const g of others) shares[g.id] = (rec[g.id] ?? 0) * (remaining / sip);
    }
    set({ goalShares: shares, goalSharesCustom: true });
  },
  /** Apply the model's split outright and unpin, so silent rebalancing resumes. */
  recommendGoalSplit: () =>
    set({
      goalShares: recommendShares(state.goals, state.goalOrder, state.monthlySip, state.inflation, state.portfolio),
      goalSharesCustom: false,
    }),

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
    // Re-tune the shared mix to whatever goals remain (unless hand-customized).
    const rec = recommendedPortfolio(goals, state.riskAppetite);
    const keep = state.portfolioCustom || goals.length === 0;
    const portfolio = keep ? state.portfolio : rec.allocation;
    const portfolioProfile = keep ? state.portfolioProfile : rec.profile;
    set({ goals, goalOrder, goalShares, currentGoalId, portfolio, portfolioProfile });
  },

  // ---- Existing investments (added manually; sum can feed total current savings) ----
  addHolding: (h: Omit<Holding, "id">) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    set({ externalHoldings: [...state.externalHoldings, { id, ...h }] });
  },
  removeHolding: (id: string) => set({ externalHoldings: state.externalHoldings.filter((h) => h.id !== id) }),

  // ---- Copilot / chat ----
  openChat: () => set({ chatOpen: true }),
  collapseChat: () => set({ chatOpen: false }),
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

  /** Copilot input: first try to understand it as a goal/plan command and apply
      it instantly; otherwise fall back to the AI for a general answer. */
  submitCopilot: (text: string) => {
    const t = text.trim();
    if (!t || state.chatTyping) return;
    const cmd = parseCommand(t);
    if (cmd) {
      set({ chat: [...state.chat, { role: "user", text: t }], chatOpen: true });
      const reply = runCommand(cmd);
      set({ chat: [...getState().chat, { role: "ai", text: reply }] });
      return;
    }
    set({ chatOpen: true });
    actions.sendChat(t);
  },
};

function ensureGoal(id: string) {
  if (!state.goals.some((g) => g.id === id)) actions.addGoal(id);
}

/** Execute a parsed copilot command and return a short, friendly confirmation. */
function runCommand(cmd: Command): string {
  switch (cmd.kind) {
    case "addGoal":
      if (state.goals.some((g) => g.id === cmd.goalId)) {
        actions.setCurrentGoal(cmd.goalId);
        return `${cmd.name} is already in your plan.`;
      }
      actions.addGoal(cmd.goalId);
      return `Added ${cmd.name} to your goals. ✨`;
    case "removeGoal":
      if (!state.goals.some((g) => g.id === cmd.goalId)) return `${cmd.name} isn't in your plan.`;
      actions.removeGoal(cmd.goalId);
      return `Removed ${cmd.name}. Its money was reshared across your other goals.`;
    case "setPool":
      actions.setSip(cmd.amount);
      return `Set your monthly investment to ${formatINR(cmd.amount)}.`;
    case "setCash":
      actions.setSavings(cmd.amount);
      return `Set your cash in hand to ${formatINR(cmd.amount)}.`;
    case "setTarget":
      ensureGoal(cmd.goalId);
      actions.setGoalTarget(cmd.goalId, cmd.amount);
      return `Set ${cmd.name}'s target to ${formatINR(cmd.amount)} in today's money.`;
    case "setYears":
      ensureGoal(cmd.goalId);
      actions.setGoalTenure(cmd.goalId, cmd.years);
      return `Set ${cmd.name} to ${cmd.years} ${cmd.years === 1 ? "year" : "years"} away.`;
    case "autoSplit":
      actions.recommendGoalSplit();
      return `Auto-balanced your money across goals. ✨`;
    case "recommendPortfolio":
      actions.recommendPortfolio();
      return `Matched your portfolio to your goals' timeline. ✨`;
    case "newPlan":
      actions.startOnboarding();
      return `Starting a fresh plan. Answer a few quick questions. ✨`;
  }
}

/** Compact plan JSON injected into the AI's system prompt on the dashboard. */
function buildPlanData(s: AppState): unknown | null {
  const g = currentGoal(s);
  if (s.screen !== "plan" || !g) return null;
  const r = computePlan(toPlanInputs(s));
  const allocationPct: Record<string, number> = {};
  for (const [id, w] of Object.entries(s.portfolio)) allocationPct[FUND_MAP[id]?.name ?? id] = w;
  return {
    goal: g.name,
    targetTodayINR: g.targetToday,
    horizonYears: g.horizonYears,
    monthlySipINR: Math.round(goalMonthly(s, g.id)),
    monthlyPoolINR: s.monthlySip,
    currentSavingsINR: Math.round(totalCapital(s) * goalShareFraction(s, g.id)),
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
