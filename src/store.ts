import { useSyncExternalStore } from "react";
import type { Allocation, ChatMessage, Holding, PlanGoal, PlanInputs, Profile, RiskProfile } from "./lib/types";
import { GOAL_MAP } from "./lib/goals";
import { autoAllocation, MODEL_PORTFOLIOS } from "./lib/portfolios";
import { adjustedTarget, emptyProfile, suggestedSip } from "./lib/profile";
import { assessRiskAppetite, capProfile, riskBandLabel } from "./lib/risk";
import { askGroq, type AiAction } from "./lib/groq";
import { FUND_MAP } from "./lib/funds";
import { computePlan, blendedReturn, requiredCorpus, requiredSip } from "./lib/finance";
import { formatINR } from "./lib/format";
import { parseCommand, type Command } from "./lib/command";
import {
  deleteAccount as apiDeleteAccount,
  loadPlan,
  logout as apiLogout,
  me,
  savePlan,
  savePlanBeacon,
  type AuthUser,
} from "./lib/authApi";

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
  /** Which surface is showing: the plan, the portfolio room, or money. */
  tab: "plan" | "portfolio" | "money";
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
  /** Signed-in account, if any. The plan syncs to the server while set. */
  user: AuthUser | null;
  /** Monotonic stamp (ms) bumped whenever plan data changes. It is the
      recency token both sides reconcile on, so no stale copy overwrites a
      newer one. */
  planUpdatedAt: number;
  /** True while a full-screen overlay (auth sheet, account menu) is open, so
      the copilot bar can step out of its way. Never persisted. */
  modalOpen: boolean;
}

/** The durable financial plan: exactly the fields that sync to an account.
    Navigation (screen, tab, onboarding), chat and the account itself are
    deliberately excluded, so adopting a server copy can never teleport a
    user mid-onboarding or revert a screen. */
const PLAN_KEYS = [
  "profile",
  "inflation",
  "inflationSource",
  "riskAppetite",
  "riskAppetiteSource",
  "monthlySip",
  "currentSavings",
  "monthlyIncome",
  "monthlyExpenses",
  "goals",
  "currentGoalId",
  "goalShares",
  "goalOrder",
  "goalOrderCustom",
  "goalSharesCustom",
  "portfolio",
  "portfolioProfile",
  "portfolioCustom",
  "externalHoldings",
  "selectedGoalIds",
] as const;
const PLAN_KEY_SET = new Set<string>(PLAN_KEYS);

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
  user: null,
  planUpdatedAt: 0,
  modalOpen: false,
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

let state: AppState = { ...defaults, ...loadPersisted(), chatOpen: false, chat: [], chatTyping: false, modalOpen: false };

const nowMs = () => Date.now();

/** Only push to the server once we have reconciled with it. Until then a
    local edit stays local, so a fresh device can never overwrite the
    account's real plan with defaults before it has even been read. */
let syncReady = false;

/** What persists to localStorage: everything except chat and the transient
    modal flag. Keeps `user` so a reload remembers the session to re-validate. */
function localBlob(): Record<string, unknown> {
  const { chat: _c, chatOpen: _o, chatTyping: _t, modalOpen: _m, ...rest } = state;
  return rest;
}

/** What syncs to an account: the plan fields plus their recency stamp. */
function planBlob(): Record<string, unknown> {
  const out: Record<string, unknown> = { planUpdatedAt: state.planUpdatedAt };
  for (const k of PLAN_KEYS) out[k] = (state as unknown as Record<string, unknown>)[k];
  return out;
}

/** Take only well-typed, known plan keys from an untrusted server blob; a
    malformed value is skipped (the current value stands) rather than crashing
    a render. */
function coercePlan(raw: unknown): Partial<AppState> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

  if (isObj(r.profile)) out.profile = r.profile;
  if (isObj(r.portfolio)) out.portfolio = r.portfolio;
  if (isObj(r.goalShares)) out.goalShares = r.goalShares;
  if (Array.isArray(r.goals)) out.goals = r.goals;
  if (Array.isArray(r.goalOrder)) out.goalOrder = r.goalOrder;
  if (Array.isArray(r.externalHoldings)) out.externalHoldings = r.externalHoldings;
  if (Array.isArray(r.selectedGoalIds)) out.selectedGoalIds = r.selectedGoalIds;
  for (const k of ["inflation", "riskAppetite", "monthlySip", "currentSavings", "monthlyIncome", "monthlyExpenses"]) {
    const v = num(r[k]);
    if (v !== undefined) out[k] = v;
  }
  for (const k of ["inflationSource", "riskAppetiteSource", "currentGoalId", "portfolioProfile"]) {
    const v = str(r[k]);
    if (v !== undefined) out[k] = v;
  }
  for (const k of ["goalOrderCustom", "goalSharesCustom", "portfolioCustom"]) {
    const v = bool(r[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let serverTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (typeof localStorage !== "undefined") {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, state: localBlob() }));
      } catch {
        // Storage full or blocked: the app still works, it just will not survive a refresh.
      }
    }, 300);
  }
  // Signed in AND reconciled: the server copy follows along, a beat behind.
  if (state.user && syncReady) {
    clearTimeout(serverTimer);
    serverTimer = setTimeout(() => {
      void savePlan(planBlob());
    }, 1500);
  }
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function set(patch: Partial<AppState>) {
  // A change to any plan field bumps the recency stamp, unless the caller
  // sets it explicitly (adoption preserves the server's stamp).
  const touchesPlan = Object.keys(patch).some((k) => PLAN_KEY_SET.has(k));
  const stamped =
    touchesPlan && (patch as Record<string, unknown>).planUpdatedAt === undefined
      ? { ...patch, planUpdatedAt: nowMs() }
      : patch;
  state = { ...state, ...stamped };
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

  // ---- Account ----
  /**
   * After register/login (or a session found at boot): reconcile the local
   * and server plans, then keep them in sync.
   *
   * preferServer is set for an explicit sign-in: the person is asking for
   * their account, so its saved plan wins outright and any anonymous scratch
   * work on this device is discarded, even if that local edit is technically
   * newer. Registration and silent session-restore instead reconcile by
   * recency, which is what multi-device sync needs. A transient read failure
   * blocks sync for the session rather than risk overwriting the server.
   */
  completeAuth: async (user: AuthUser, opts: { preferServer?: boolean } = {}): Promise<"ok" | "sync-failed"> => {
    syncReady = false;
    set({ user });

    // A cold serverless function or a paused database must not decide the
    // outcome of a sign-in: retry the read with a little patience, since a
    // sleeping Postgres typically wakes within a couple of seconds.
    let result = await loadPlan();
    for (const delayMs of [1200, 2500]) {
      if (result.status !== "error") break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      result = await loadPlan();
    }
    // Still unknown: report it instead of pretending. The caller surfaces the
    // failure (or revalidateSession heals it later); sync stays off so local
    // work can never overwrite an unread account plan.
    if (result.status === "error") return "sync-failed";

    if (result.status === "ok") {
      const serverRev = Number((result.state as Record<string, unknown>).planUpdatedAt) || 0;
      if (opts.preferServer || serverRev >= state.planUpdatedAt) {
        set({ ...coercePlan(result.state), planUpdatedAt: serverRev, user });
        syncReady = true;
        return "ok";
      }
    }
    // Server empty, or local newer on a non-explicit path: local is the truth.
    syncReady = true;
    if (state.planUpdatedAt > 0) void savePlan(planBlob());
    return "ok";
  },

  /**
   * Heal a half-open session: signed in but never reconciled (a boot-time
   * probe or plan load failed). Called on online/focus signals; a no-op when
   * everything is already healthy, so it costs nothing in the common case.
   */
  revalidateSession: async () => {
    if (!state.user || syncReady) return;
    const probe = await me();
    if (probe.status === "ok") void actions.completeAuth(probe.user);
    else if (probe.status === "unauthed") actions.clearStaleUser();
    // error: state still unknown — keep the identity, try on the next signal.
  },

  /** A dead/expired session found at boot: drop the signed-in identity but
      keep the local plan so the person can keep working or re-sign-in. */
  clearStaleUser: () => {
    syncReady = false;
    set({ user: null });
  },

  setModalOpen: (open: boolean) => set({ modalOpen: open }),

  signOut: async () => {
    // Flush the last edit while the cookie is still valid, then drop the
    // whole local plan: the next person on this device starts clean, so one
    // account's data can never seed another's.
    if (syncReady && state.user) await savePlan(planBlob());
    await apiLogout();
    syncReady = false;
    set({ ...defaults });
  },

  deleteAccount: async () => {
    const r = await apiDeleteAccount();
    if (!r.ok) return false;
    syncReady = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: the reset below still runs.
    }
    set({ ...defaults });
    return true;
  },

  /** Best-effort write on tab close: localStorage synchronously, the server
      via a keepalive request that outlives the page. */
  flushNow: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, state: localBlob() }));
    } catch {
      // Storage unavailable.
    }
    if (syncReady && state.user) savePlanBeacon(planBlob());
  },

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
      // The model may PROPOSE a plan action; only the deterministic engine
      // applies it, after re-validating, and its verbatim confirmation is
      // what the person reads.
      let msg = reply.text ?? "";
      if (reply.action) {
        const cmd = actionToCommand(reply.action);
        msg = cmd ? runCommand(cmd) : "I couldn't apply that safely. Try saying it with the goal and the amount.";
      }
      set({ chat: [...getState().chat, { role: "ai", text: msg || "Something went wrong. Try again." }], chatTyping: false });
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

/** Re-validate an AI-proposed action into a Command, or reject it. The model
    is natural-language understanding only; every bound is enforced here. */
function actionToCommand(a: AiAction): Command | null {
  const needsGoal = a.kind === "addGoal" || a.kind === "removeGoal" || a.kind === "setTarget" || a.kind === "setYears";
  const goal = needsGoal ? GOAL_MAP[a.goalId ?? ""] : undefined;
  if (needsGoal && !goal) return null;
  const amount = Math.round(Number(a.amount));
  const years = Math.round(Number(a.years));
  switch (a.kind) {
    case "addGoal":
      return { kind: "addGoal", goalId: goal!.id, name: goal!.name };
    case "removeGoal":
      return { kind: "removeGoal", goalId: goal!.id, name: goal!.name };
    case "setTarget":
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null;
      return { kind: "setTarget", goalId: goal!.id, name: goal!.name, amount };
    case "setYears":
      if (!Number.isFinite(years) || years < 1 || years > 60) return null;
      return { kind: "setYears", goalId: goal!.id, name: goal!.name, years };
    case "setPool":
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null;
      return { kind: "setPool", amount };
    case "setCash":
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return null;
      return { kind: "setCash", amount };
    case "autoSplit":
      return { kind: "autoSplit" };
    case "recommendPortfolio":
      return { kind: "recommendPortfolio" };
    default:
      return null;
  }
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

/** The WHOLE plan as compact JSON for the AI's system prompt: every goal with
    its numbers, the money totals, risk, mix and holdings. The model must never
    need a number that isn't here. */
function buildPlanData(s: AppState): unknown | null {
  if (s.goals.length === 0) return null;
  const goals = goalsByPriority(s).map((g) => {
    const r = computePlan(planInputsForGoal(s, g));
    return {
      name: g.name,
      targetTodayINR: g.targetToday,
      horizonYears: g.horizonYears,
      monthlySipINR: Math.round(goalMonthly(s, g.id)),
      capitalSetAsideINR: Math.round(totalCapital(s) * goalShareFraction(s, g.id)),
      projectedCorpusINR: Math.round(r.projectedCorpus),
      requiredCorpusINR: Math.round(r.requiredCorpus),
      gapINR: Math.round(r.gap),
      onTrack: r.onTrack,
      isCurrent: g.id === s.currentGoalId,
    };
  });
  const allocationPct: Record<string, number> = {};
  for (const [id, w] of Object.entries(s.portfolio)) allocationPct[FUND_MAP[id]?.name ?? id] = w;
  const cur = currentGoal(s);
  const curPlan = cur ? computePlan(toPlanInputs(s)) : null;
  return {
    goals,
    monthlyPoolINR: s.monthlySip,
    cashINR: s.currentSavings,
    investedINR: Math.round(holdingsTotal(s)),
    totalINR: Math.round(totalCapital(s)),
    monthsOfCover: s.monthlyExpenses > 0 ? Math.round((s.currentSavings / s.monthlyExpenses) * 10) / 10 : null,
    riskAppetite: riskBandLabel(s.riskAppetite),
    inflationPct: Math.round(s.inflation * 100),
    expectedReturnPct: curPlan ? Math.round(curPlan.blendedReturn * 1000) / 10 : null,
    allocationPct,
    holdings: s.externalHoldings.slice(0, 20).map((h) => ({ name: h.name, type: h.type, amountINR: h.amount })),
  };
}
