import { STEPS, TOTAL_STAGES, rentDefault } from "../../lib/onboarding.js";
import { GOALS } from "../../lib/goals.js";
import { inferIncome } from "../../lib/profile.js";
import { formatINR } from "../../lib/format.js";
import { clear, el } from "../dom.js";
import { finishOnboarding, getState, setState, startDemo, subscribe } from "../state.js";
const PROFILE_FIELDS = new Set(["cityTier", "employment", "careerStage", "rent", "emi", "takeHome", "existingSavings"]);
function setAnswer(field, value) {
    if (PROFILE_FIELDS.has(field)) {
        setState({ profile: { ...getState().profile, [field]: value } });
    }
    else {
        setState({ onboardingAnswers: { ...getState().onboardingAnswers, [field]: String(value) } });
    }
}
function goTo(index) {
    setState({ onboardingStepIndex: Math.max(0, Math.min(STEPS.length - 1, index)) });
}
export function mountOnboarding(root) {
    clear(root);
    const touched = new Set();
    const progressFill = el("span", { class: "ob-progress-fill" });
    const stageLabel = el("span", { class: "ob-stage-label" });
    const backBtn = el("button", { class: "ob-back", type: "button", text: "← Back", "aria-label": "Back" });
    backBtn.addEventListener("click", () => goTo(getState().onboardingStepIndex - 1));
    const skipBtn = el("button", { class: "btn-ghost ob-skip", type: "button", text: "Skip to demo" });
    skipBtn.addEventListener("click", startDemo);
    const topBar = el("div", { class: "ob-top" }, [backBtn, el("span", { class: "logo-word small", text: "NoBroke" }), skipBtn]);
    const progress = el("div", { class: "ob-progress" }, [el("span", { class: "ob-progress-track" }, [progressFill]), stageLabel]);
    const body = el("div", { class: "ob-body" });
    root.append(el("div", { class: "ob-shell" }, [topBar, progress, body]));
    function continueBtn(label = "Continue", enabled = true, onClick) {
        const b = el("button", { class: "btn-primary btn-lg ob-continue", type: "button", text: label });
        b.disabled = !enabled;
        if (onClick)
            b.addEventListener("click", onClick);
        return b;
    }
    function buildIntro(step) {
        body.append(el("div", { class: "ob-step ob-intro" }, [
            el("span", { class: "ob-emoji-big", text: "💫" }),
            el("h1", { class: "ob-title", text: step.title }),
            el("p", { class: "ob-subtitle", text: step.subtitle ?? "" }),
            continueBtn(step.cta ?? "Let's go", true, () => goTo(getState().onboardingStepIndex + 1)),
        ]));
    }
    function buildGoals(step) {
        const chips = [];
        const count = el("span", { class: "ob-goal-count" });
        const cont = continueBtn("Continue", getState().selectedGoalIds.length > 0, () => goTo(getState().onboardingStepIndex + 1));
        function refresh() {
            const sel = getState().selectedGoalIds;
            count.textContent = `${sel.length}/3 picked`;
            cont.disabled = sel.length === 0;
            for (const c of chips)
                c.classList.toggle("selected", sel.includes(c.getAttribute("data-id") ?? ""));
        }
        const grid = el("div", { class: "ob-goal-grid" });
        for (const g of GOALS) {
            const chip = el("button", { class: "ob-goal-chip", type: "button", "data-id": g.id }, [
                el("span", { class: "ob-goal-emoji", text: g.emoji }),
                el("span", { class: "ob-goal-name", text: g.name }),
                el("span", { class: "ob-goal-blurb", text: g.blurb }),
            ]);
            chip.addEventListener("click", () => {
                let sel = [...getState().selectedGoalIds];
                if (sel.includes(g.id))
                    sel = sel.filter((x) => x !== g.id);
                else if (sel.length < 3)
                    sel.push(g.id);
                else
                    return;
                setState({ selectedGoalIds: sel });
                refresh();
            });
            chips.push(chip);
            grid.append(chip);
        }
        body.append(el("div", { class: "ob-step" }, [
            el("h1", { class: "ob-title", text: step.title }),
            el("p", { class: "ob-subtitle", text: step.subtitle ?? "" }),
            grid,
            el("div", { class: "ob-foot" }, [count, cont]),
        ]));
        refresh();
    }
    function buildSingle(step) {
        const grid = el("div", { class: "ob-option-grid" });
        const current = PROFILE_FIELDS.has(step.field ?? "")
            ? String(getState().profile[step.field ?? ""] ?? "")
            : getState().onboardingAnswers[step.field ?? ""] ?? "";
        for (const opt of step.options ?? []) {
            const card = el("button", { class: "ob-option" + (current === opt.value ? " selected" : ""), type: "button" }, [
                el("span", { class: "ob-option-emoji", text: opt.emoji ?? "•" }),
                el("span", { class: "ob-option-label", text: opt.label }),
                opt.hint ? el("span", { class: "ob-option-hint", text: opt.hint }) : el("span", {}),
            ]);
            card.addEventListener("click", () => {
                setAnswer(step.field ?? "", opt.value);
                for (const c of grid.children)
                    c.classList.remove("selected");
                card.classList.add("selected");
                window.setTimeout(() => goTo(getState().onboardingStepIndex + 1), 220);
            });
            grid.append(card);
        }
        body.append(el("div", { class: "ob-step" }, [
            el("h1", { class: "ob-title", text: step.title }),
            step.subtitle ? el("p", { class: "ob-subtitle", text: step.subtitle }) : el("span", {}),
            grid,
        ]));
    }
    function sliderDefault(step) {
        const p = getState().profile;
        switch (step.field) {
            case "rent":
                return rentDefault(p.cityTier);
            case "takeHome":
                return inferIncome(p);
            default:
                return step.min ?? 0;
        }
    }
    function buildSlider(step) {
        const field = step.field ?? "";
        const p = getState().profile;
        let value = touched.has(field) ? p[field] ?? 0 : sliderDefault(step);
        if (!touched.has(field))
            setAnswer(field, value); // seed the default
        const valueEl = el("span", { class: "ob-slider-value", text: formatINR(value) });
        const slider = el("input", {
            class: "param-slider ob-slider",
            type: "range",
            min: String(step.min ?? 0),
            max: String(step.max ?? 100),
            step: String(step.step ?? 1),
            value: String(value),
            "aria-label": step.title,
        });
        function setFill(v) {
            const fill = (((v - (step.min ?? 0)) / ((step.max ?? 100) - (step.min ?? 0))) * 100);
            slider.style.setProperty("--fill", `${Math.max(0, Math.min(100, fill))}%`);
        }
        setFill(value);
        slider.addEventListener("input", () => {
            touched.add(field);
            value = parseFloat(slider.value);
            valueEl.textContent = formatINR(value);
            setFill(value);
            setAnswer(field, value);
        });
        body.append(el("div", { class: "ob-step ob-slider-step" }, [
            el("h1", { class: "ob-title", text: step.title }),
            step.subtitle ? el("p", { class: "ob-subtitle", text: step.subtitle }) : el("span", {}),
            el("div", { class: "ob-slider-wrap" }, [valueEl, slider]),
            continueBtn("Continue", true, () => goTo(getState().onboardingStepIndex + 1)),
        ]));
    }
    function buildOutro(step) {
        body.append(el("div", { class: "ob-step ob-intro" }, [
            el("span", { class: "ob-emoji-big spin", text: "💞" }),
            el("h1", { class: "ob-title", text: step.title }),
            el("p", { class: "ob-subtitle", text: step.subtitle ?? "" }),
            continueBtn(step.cta ?? "See my plan", true, finishOnboarding),
        ]));
    }
    let lastIndex = -1;
    function render() {
        const s = getState();
        if (s.onboardingStepIndex === lastIndex)
            return;
        lastIndex = s.onboardingStepIndex;
        const step = STEPS[s.onboardingStepIndex];
        clear(body);
        backBtn.style.visibility = s.onboardingStepIndex > 0 && step.kind !== "outro" ? "visible" : "hidden";
        const isEnd = step.kind === "outro";
        progressFill.style.width = isEnd ? "100%" : step.stage <= 0 ? "0%" : `${(step.stage / TOTAL_STAGES) * 100}%`;
        stageLabel.textContent = step.stage > 0 ? `${step.stageLabel} · ${step.stage} of ${TOTAL_STAGES}` : "";
        switch (step.kind) {
            case "intro":
                buildIntro(step);
                break;
            case "goals":
                buildGoals(step);
                break;
            case "single":
                buildSingle(step);
                break;
            case "slider":
                buildSlider(step);
                break;
            case "outro":
                buildOutro(step);
                break;
        }
    }
    render();
    subscribe(render);
}
//# sourceMappingURL=onboarding.js.map