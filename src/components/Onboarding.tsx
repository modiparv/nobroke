import { useEffect, useState } from "react";
import { STEPS, TOTAL_STAGES, type Step } from "../lib/onboarding";
import { GOALS } from "../lib/goals";
import { inferIncome, rentDefault } from "../lib/profile";
import { formatINR } from "../lib/format";
import type { Profile } from "../lib/types";
import { actions, getState, useStore } from "../store";
import { btnGhost, btnPrimary } from "../ui";
import Logo from "./Logo";

const PROFILE_FIELDS = new Set(["cityTier", "employment", "careerStage", "rent", "emi", "takeHome", "existingSavings"]);

function setAnswer(field: string, value: string | number) {
  if (PROFILE_FIELDS.has(field)) actions.setProfileField(field as keyof Profile, value);
  else actions.setAnswer(field, String(value));
}

function SliderStep({ step, onContinue }: { step: Step; onContinue: () => void }) {
  const min = step.min ?? 0;
  const max = step.max ?? 100;
  const profile = getState().profile;
  const seed =
    step.field === "rent" ? rentDefault(profile.cityTier) : step.field === "takeHome" ? inferIncome(profile) : min;
  const [value, setValue] = useState(seed);

  useEffect(() => {
    setAnswer(step.field!, seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="fade-up flex w-full flex-col items-center text-center">
      <h1 className="max-w-[16ch] text-3xl font-semibold tracking-tight sm:text-4xl">{step.title}</h1>
      {step.subtitle && <p className="mx-auto mt-4 max-w-[52ch] text-muted">{step.subtitle}</p>}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-5 text-4xl font-semibold tracking-tight sm:text-5xl">{formatINR(value)}</div>
        <input
          type="range"
          min={min}
          max={max}
          step={step.step ?? 1}
          value={value}
          aria-label={step.title}
          className="w-full"
          onChange={(e) => {
            const v = Number(e.target.value);
            setValue(v);
            setAnswer(step.field!, v);
          }}
          style={{ background: `linear-gradient(90deg,#6750F2 ${pct}%,#ECECEF ${pct}%)`, borderRadius: 999, height: 6 }}
        />
      </div>
      <button className={`${btnPrimary} mt-8 min-w-[180px]`} onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

export default function Onboarding() {
  const s = useStore();
  const i = s.onboardingStepIndex;
  const step = STEPS[i];
  const next = () => actions.setStep(i + 1);

  const progress = step.kind === "outro" ? 100 : step.stage <= 0 ? 0 : (step.stage / TOTAL_STAGES) * 100;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-10 pt-5 sm:px-8">
      <div className="flex items-center justify-between gap-3 pb-4">
        <button
          className="px-1 py-1.5 text-sm font-medium text-muted hover:text-ink"
          style={{ visibility: i > 0 && step.kind !== "outro" ? "visible" : "hidden" }}
          onClick={() => actions.setStep(i - 1)}
        >
          ← Back
        </button>
        <Logo />
        <button className={`${btnGhost} px-3 py-1.5 text-xs`} onClick={actions.startDemo}>
          Skip to demo
        </button>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
          <div className="h-full rounded-full bg-brand-deep transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        {step.stage > 0 && (
          <span className="whitespace-nowrap text-xs font-medium text-muted">
            {step.stageLabel} · {step.stage} of {TOTAL_STAGES}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center">
        {step.kind === "intro" && (
          <div className="fade-up flex w-full flex-col items-center text-center">
            <span className="text-5xl">💙</span>
            <h1 className="mt-4 max-w-[16ch] text-3xl font-semibold tracking-tight sm:text-4xl">{step.title}</h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-muted">{step.subtitle}</p>
            <button className={`${btnPrimary} mt-8 min-w-[180px]`} onClick={next}>
              {step.cta}
            </button>
          </div>
        )}

        {step.kind === "goals" && (
          <div className="fade-up w-full">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{step.title}</h1>
            <p className="mt-3 text-muted">{step.subtitle}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GOALS.map((g) => {
                const sel = s.selectedGoalIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => actions.toggleGoal(g.id)}
                    className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition ${
                      sel ? "border-brand-deep bg-brand-deep text-white" : "border-line hover:border-brand"
                    }`}
                  >
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="text-sm font-medium">{g.name}</span>
                    <span className={`text-xs ${sel ? "text-white/70" : "text-muted"}`}>{g.blurb}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">{s.selectedGoalIds.length}/3 picked</span>
              <button className={btnPrimary} disabled={s.selectedGoalIds.length === 0} onClick={next}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step.kind === "single" && (
          <div className="fade-up w-full">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{step.title}</h1>
            {step.subtitle && <p className="mt-3 text-muted">{step.subtitle}</p>}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {step.options!.map((opt) => {
                const current = PROFILE_FIELDS.has(step.field!)
                  ? String((s.profile as unknown as Record<string, unknown>)[step.field!] ?? "")
                  : s.onboardingAnswers[step.field!] ?? "";
                const sel = current === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setAnswer(step.field!, opt.value);
                      window.setTimeout(next, 200);
                    }}
                    className={`flex flex-col gap-1 rounded-2xl border p-5 text-left transition ${
                      sel ? "border-brand-deep bg-brand-deep text-white" : "border-line hover:border-brand"
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-base font-medium">{opt.label}</span>
                    {opt.hint && <span className={`text-xs ${sel ? "text-white/70" : "text-muted"}`}>{opt.hint}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step.kind === "slider" && <SliderStep key={step.id} step={step} onContinue={next} />}

        {step.kind === "outro" && (
          <div className="fade-up flex w-full flex-col items-center text-center">
            <span className="text-5xl">💞</span>
            <h1 className="mt-4 max-w-[18ch] text-3xl font-semibold tracking-tight sm:text-4xl">{step.title}</h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-muted">{step.subtitle}</p>
            <button className={`${btnPrimary} mt-8 min-w-[180px]`} onClick={actions.finishOnboarding}>
              {step.cta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
