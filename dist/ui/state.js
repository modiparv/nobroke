import { DEFAULT_GOAL_ID, GOAL_MAP } from "../lib/goals.js";
import { autoAllocation } from "../lib/portfolios.js";
const defaultGoal = GOAL_MAP[DEFAULT_GOAL_ID];
const initAuto = autoAllocation(defaultGoal.horizonYears);
let state = {
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
const listeners = new Set();
export function getState() {
    return state;
}
export function subscribe(fn) {
    listeners.add(fn);
}
export function setState(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners)
        fn(state);
}
export function toPlanInputs(s) {
    return {
        targetToday: s.targetToday,
        horizonYears: s.horizonYears,
        currentSavings: s.currentSavings,
        monthlySip: s.monthlySip,
        inflation: s.inflation,
        allocation: s.allocation,
    };
}
//# sourceMappingURL=state.js.map