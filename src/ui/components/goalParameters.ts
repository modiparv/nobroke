import { CUSTOM_GOAL_ID } from "../../lib/goals.js";
import { formatINR, formatYears } from "../../lib/format.js";
import { el } from "../dom.js";
import { getState, setState, subscribe } from "../state.js";

interface ControlSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
  display: (v: number) => string;
}

function makeControl(spec: ControlSpec): { node: HTMLElement; sync: () => void } {
  const value = el("span", { class: "param-value" });
  const slider = el("input", {
    class: "param-slider",
    type: "range",
    min: String(spec.min),
    max: String(spec.max),
    step: String(spec.step),
    "aria-label": spec.label,
  }) as HTMLInputElement;

  slider.addEventListener("input", () => spec.set(parseFloat(slider.value)));

  const node = el("div", { class: "param" }, [
    el("div", { class: "param-head" }, [el("span", { class: "param-label", text: spec.label }), value]),
    slider,
  ]);

  function sync(): void {
    const v = spec.get();
    if (document.activeElement !== slider) slider.value = String(v);
    value.textContent = spec.display(v);
    const fill = ((v - spec.min) / (spec.max - spec.min)) * 100;
    slider.style.setProperty("--fill", `${Math.max(0, Math.min(100, fill))}%`);
  }
  return { node, sync };
}

export function mountGoalParameters(root: HTMLElement): void {
  const syncers: Array<() => void> = [];

  // Goal name
  const nameInput = el("input", {
    class: "param-name",
    type: "text",
    maxlength: "40",
    "aria-label": "Goal name",
  }) as HTMLInputElement;
  nameInput.addEventListener("input", () => setState({ goalName: nameInput.value }));
  syncers.push(() => {
    if (document.activeElement !== nameInput) nameInput.value = getState().goalName;
  });
  root.append(el("div", { class: "param-name-wrap" }, [el("span", { class: "param-label", text: "Goal name" }), nameInput]));

  const controls: ControlSpec[] = [
    {
      label: "Target amount (today's value)",
      min: 50000,
      max: 50000000,
      step: 50000,
      get: () => getState().targetToday,
      set: (v) => setState({ targetToday: v, goalId: CUSTOM_GOAL_ID }),
      display: (v) => formatINR(v),
    },
    {
      label: "Time horizon",
      min: 1,
      max: 30,
      step: 1,
      get: () => getState().horizonYears,
      set: (v) => setState({ horizonYears: v, goalId: CUSTOM_GOAL_ID }),
      display: (v) => formatYears(v),
    },
    {
      label: "Current savings (lump sum)",
      min: 0,
      max: 10000000,
      step: 25000,
      get: () => getState().currentSavings,
      set: (v) => setState({ currentSavings: v }),
      display: (v) => formatINR(v),
    },
    {
      label: "Monthly investment (SIP)",
      min: 0,
      max: 500000,
      step: 1000,
      get: () => getState().monthlySip,
      set: (v) => setState({ monthlySip: v }),
      display: (v) => formatINR(v) + "/mo",
    },
    {
      label: "Assumed inflation",
      min: 0,
      max: 12,
      step: 0.5,
      get: () => getState().inflation * 100,
      set: (v) => setState({ inflation: v / 100 }),
      display: (v) => v.toFixed(1) + "%",
    },
  ];

  for (const spec of controls) {
    const c = makeControl(spec);
    root.append(c.node);
    syncers.push(c.sync);
  }

  const syncAll = () => syncers.forEach((fn) => fn());
  syncAll();
  subscribe(syncAll);
}
