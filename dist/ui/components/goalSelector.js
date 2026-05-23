import { GOALS, CUSTOM_GOAL_ID } from "../../lib/goals.js";
import { autoAllocation } from "../../lib/portfolios.js";
import { clear, el } from "../dom.js";
import { getState, setState, subscribe } from "../state.js";
export function mountGoalSelector(root) {
    const chips = [];
    function selectGoal(goalId) {
        const g = GOALS.find((x) => x.id === goalId);
        if (g) {
            const auto = autoAllocation(g.horizonYears);
            setState({
                goalId: g.id,
                goalName: g.name,
                targetToday: g.targetToday,
                horizonYears: g.horizonYears,
                allocation: { ...auto.allocation },
                activeProfile: auto.profile,
            });
        }
        else {
            setState({ goalId: CUSTOM_GOAL_ID, goalName: getState().goalName || "My Goal" });
        }
    }
    function addChip(id, emoji, name) {
        const chip = el("button", { class: "goal-chip", type: "button", "data-id": id }, [
            el("span", { class: "goal-emoji", text: emoji }),
            el("span", { class: "goal-chip-name", text: name }),
        ]);
        chip.addEventListener("click", () => selectGoal(id));
        chips.push(chip);
        root.append(chip);
    }
    clear(root);
    for (const g of GOALS)
        addChip(g.id, g.emoji, g.name);
    addChip(CUSTOM_GOAL_ID, "✨", "Custom");
    function sync() {
        const { goalId } = getState();
        for (const chip of chips)
            chip.classList.toggle("active", chip.getAttribute("data-id") === goalId);
    }
    sync();
    subscribe(sync);
}
//# sourceMappingURL=goalSelector.js.map