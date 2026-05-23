import type { Allocation, PlanInputs } from "../types.js";
import { DEFAULT_GOAL_ID, GOAL_MAP } from "../lib/goals.js";
import { autoAllocation } from "../lib/portfolios.js";

export interface AppState {
  goalId: string;
  goalName: string;
  targetToday: number;
  horizonYears: number;
  currentSavings: number;
  monthlySip: number;
  /** Annual inflation, decimal. */
  inflation: number;
  allocation: Allocation;
  /** Active model portfolio (for highlight), or null when hand-tuned. */
  activeProfile: string | null;
}

type Listener = (s: AppState) => void;

const defaultGoal = GOAL_MAP[DEFAULT_GOAL_ID];
const initAuto = autoAllocation(defaultGoal.horizonYears);

let state: AppState = {
  goalId: defaultGoal.id,
  goalName: defaultGoal.name,
  targetToday: defaultGoal.targetToday,
  horizonYears: defaultGoal.horizonYears,
  currentSavings: 300000,
  monthlySip: 45000,
  inflation: 0.06,
  allocation: initAuto.allocation,
  activeProfile: initAuto.profile,
};

const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function subscribe(fn: Listener): void {
  listeners.add(fn);
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export function toPlanInputs(s: AppState): PlanInputs {
  return {
    targetToday: s.targetToday,
    horizonYears: s.horizonYears,
    currentSavings: s.currentSavings,
    monthlySip: s.monthlySip,
    inflation: s.inflation,
    allocation: s.allocation,
  };
}
