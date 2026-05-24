import { GOALS } from "../../lib/goals.js";
import { clear, el } from "../dom.js";
import { buildPlanGoal, getState, setState, subscribe } from "../state.js";

export function mountGoalSelector(root: HTMLElement): void {
  const menu = el("div", { class: "goal-add-menu", style: "display:none" });
  let menuOpen = false;

  function closeMenu(): void {
    menuOpen = false;
    menu.style.display = "none";
  }

  function addGoal(id: string): void {
    const s = getState();
    if (s.goals.some((g) => g.id === id)) {
      setState({ currentGoalId: id });
      return;
    }
    const goal = buildPlanGoal(id, s.profile);
    setState({ goals: [...s.goals, goal], currentGoalId: goal.id });
  }

  function buildMenu(): void {
    clear(menu);
    const existing = new Set(getState().goals.map((g) => g.id));
    for (const g of GOALS) {
      if (existing.has(g.id)) continue;
      const item = el("button", { class: "goal-add-item", type: "button" }, [
        el("span", { class: "goal-emoji", text: g.emoji }),
        el("span", { text: g.name }),
      ]);
      item.addEventListener("click", () => {
        addGoal(g.id);
        closeMenu();
      });
      menu.append(item);
    }
    if (!menu.children.length) menu.append(el("span", { class: "goal-add-empty", text: "All goals added 🎉" }));
  }

  function render(): void {
    clear(root);
    const s = getState();
    const chips = el("div", { class: "goal-chips" });
    for (const g of s.goals) {
      const chip = el("button", { class: "goal-chip" + (g.id === s.currentGoalId ? " active" : ""), type: "button" }, [
        el("span", { class: "goal-emoji", text: g.emoji }),
        el("span", { class: "goal-chip-name", text: g.name }),
      ]);
      chip.addEventListener("click", () => setState({ currentGoalId: g.id }));
      chips.append(chip);
    }
    const addBtn = el("button", { class: "goal-chip goal-add-btn", type: "button" }, [
      el("span", { class: "goal-emoji", text: "＋" }),
      el("span", { class: "goal-chip-name", text: "Add goal" }),
    ]);
    addBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      menuOpen = !menuOpen;
      if (menuOpen) buildMenu();
      menu.style.display = menuOpen ? "flex" : "none";
    });
    chips.append(addBtn);
    root.append(el("div", { class: "goal-selector-wrap" }, [chips, menu]));
  }

  document.addEventListener("click", () => {
    if (menuOpen) closeMenu();
  });

  render();
  subscribe(render);
}
