import { formatINR, formatYears } from "../../lib/format.js";
import { el } from "../dom.js";
import { currentGoal, getState, setState, subscribe, updateCurrentGoal } from "../state.js";
function makeControl(spec) {
    const value = el("span", { class: "param-value" });
    const slider = el("input", {
        class: "param-slider",
        type: "range",
        min: String(spec.min),
        max: String(spec.max),
        step: String(spec.step),
        "aria-label": spec.label,
    });
    slider.addEventListener("input", () => spec.set(parseFloat(slider.value)));
    const node = el("div", { class: "param" }, [
        el("div", { class: "param-head" }, [el("span", { class: "param-label", text: spec.label }), value]),
        slider,
    ]);
    function sync() {
        const v = spec.get();
        if (document.activeElement !== slider)
            slider.value = String(v);
        value.textContent = spec.display(v);
        const fill = ((v - spec.min) / (spec.max - spec.min)) * 100;
        slider.style.setProperty("--fill", `${Math.max(0, Math.min(100, fill))}%`);
    }
    return { node, sync };
}
export function mountGoalParameters(root) {
    const controls = [
        {
            label: "Target amount (today's value)",
            min: 50000,
            max: 50000000,
            step: 50000,
            get: () => currentGoal()?.targetToday ?? 0,
            set: (v) => updateCurrentGoal({ targetToday: v }),
            display: (v) => formatINR(v),
        },
        {
            label: "Time horizon",
            min: 1,
            max: 30,
            step: 1,
            get: () => currentGoal()?.horizonYears ?? 1,
            set: (v) => updateCurrentGoal({ horizonYears: v }),
            display: (v) => formatYears(v),
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
            label: "Current savings (lump sum)",
            min: 0,
            max: 20000000,
            step: 25000,
            get: () => getState().currentSavings,
            set: (v) => setState({ currentSavings: v }),
            display: (v) => formatINR(v),
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
    const syncers = [];
    for (const spec of controls) {
        const c = makeControl(spec);
        root.append(c.node);
        syncers.push(c.sync);
    }
    const syncAll = () => syncers.forEach((fn) => fn());
    syncAll();
    subscribe(syncAll);
}
//# sourceMappingURL=goalParameters.js.map