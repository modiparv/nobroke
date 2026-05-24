import { GOAL_MAP } from "../lib/goals.js";
import { autoAllocation } from "../lib/portfolios.js";
import { adjustedTarget, emptyProfile, suggestedSip } from "../lib/profile.js";
let state = {
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
    chat: [],
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
export function currentGoal(s = state) {
    return s.goals.find((g) => g.id === s.currentGoalId);
}
export function updateCurrentGoal(patch) {
    setState({
        goals: state.goals.map((g) => (g.id === state.currentGoalId ? { ...g, ...patch } : g)),
    });
}
export function toPlanInputs(s = state) {
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
export function planInputsForGoal(s, g) {
    return {
        targetToday: g.targetToday,
        horizonYears: g.horizonYears,
        currentSavings: s.currentSavings,
        monthlySip: s.monthlySip,
        inflation: s.inflation,
        allocation: g.allocation,
    };
}
export function buildPlanGoal(goalId, profile, horizonOverride) {
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
export function addChat(role, text) {
    setState({ chat: [...state.chat, { role, text }] });
}
export function startOnboarding() {
    setState({ screen: "onboarding", onboardingStepIndex: 0, onboardingAnswers: {}, selectedGoalIds: [], profile: emptyProfile() });
}
/** Convert onboarding answers + profile into a real plan and enter the dashboard. */
export function finishOnboarding() {
    const selected = state.selectedGoalIds.length ? state.selectedGoalIds : ["home"];
    const timeline = state.onboardingAnswers.timeline ? Number(state.onboardingAnswers.timeline) : undefined;
    const goals = selected.map((id, i) => buildPlanGoal(id, state.profile, i === 0 ? timeline : undefined));
    setState({
        goals,
        currentGoalId: goals[0].id,
        monthlySip: suggestedSip(state.profile),
        currentSavings: state.profile.existingSavings,
        screen: "dashboard",
        chat: [],
    });
}
/** Demo profile so the dashboard can be explored without onboarding. */
export function startDemo() {
    const profile = {
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
    setState({
        profile,
        selectedGoalIds: selected,
        goals,
        currentGoalId: goals[0].id,
        monthlySip: suggestedSip(profile),
        currentSavings: profile.existingSavings,
        screen: "dashboard",
        chat: [],
    });
}
//# sourceMappingURL=state.js.map