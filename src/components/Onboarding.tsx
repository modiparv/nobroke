import { useState } from "react";
import { STEPS, TOTAL_STAGES, type Step } from "../lib/onboarding";
import { GOALS } from "../lib/goals";
import type { Profile } from "../lib/types";
import { actions, getState, useStore } from "../store";
import { btnPrimary } from "../ui";
import Logo from "./Logo";

const PROFILE_FIELDS = new Set([
  "cityTier",
  "employment",
  "careerStage",
  "dependents",
  "rent",
  "emi",
  "monthlySpend",
  "takeHome",
  "cashOnHand",
  "investedValue",
]);

function setAnswer(field: string, value: string | number) {
  if (PROFILE_FIELDS.has(field)) actions.setProfileField(field as keyof Profile, value);
  else actions.setAnswer(field, String(value));
}

/**
 * Plausibility checks against the answers already given. An implausible
 * answer is never blocked outright, but it is challenged: the person must
 * confirm it is genuinely true before the intake moves on. Honest numbers
 * are the plan's foundation.
 */
const CHECKS: Record<string, (v: number, p: Profile) => string | null> = {
  takeHome: (v) =>
    v > 0 && v < 5000 ? "A take-home below ₹5,000 a month is unusual. Confirm only if it is accurate." : null,
  rent: (v, p) =>
    p.takeHome > 0 && v >= p.takeHome
      ? "Rent alone equals your entire take-home. Confirm only if that is truly the case."
      : null,
  emi: (v, p) =>
    p.takeHome > 0 && p.rent + v >= p.takeHome
      ? "Rent and EMIs together exceed your take-home. Confirm only if that is truly the case."
      : null,
  monthlySpend: (v, p) => {
    if (p.takeHome > 0 && p.rent + p.emi + v >= p.takeHome)
      return "These numbers say you spend more than you earn. A plan built on honest figures works; one built on guesses does not. Confirm only if this is truly the case.";
    if (v === 0)
      return "Zero for groceries, bills and transport is rare. Confirm only if someone else genuinely covers all of it.";
    return null;
  },
  investedValue: (v, p) =>
    p.takeHome > 0 && v > p.takeHome * 600
      ? "That is a very large portfolio against this income. Confirm only if the value is accurate."
      : null,
};

/**
 * A compulsory money question: type the exact amount, then continue. Continue
 * stays disabled until an explicit answer exists (0 typed out counts; an empty
 * field does not), which is what makes the intake honest.
 */
function MoneyStep({ step, onContinue }: { step: Step; onContinue: () => void }) {
  const prior = PROFILE_FIELDS.has(step.field!)
    ? Number((getState().profile as unknown as Record<string, unknown>)[step.field!] ?? 0)
    : Number(getState().onboardingAnswers[step.field!] ?? 0);
  const [raw, setRaw] = useState(prior > 0 ? String(prior) : "");
  const [challenge, setChallenge] = useState<string | null>(null);

  const min = step.min ?? 0;
  const value = raw === "" ? null : Number(raw);
  const ok = value != null && Number.isFinite(value) && value >= min;

  const commit = () => {
    if (!ok) return;
    const check = CHECKS[step.field!];
    const message = check ? check(value!, getState().profile) : null;
    // First press surfaces the challenge; the second, unchanged press confirms.
    if (message && challenge !== message) {
      setChallenge(message);
      return;
    }
    setAnswer(step.field!, value!);
    onContinue();
  };

  return (
    <div className="fade-up flex w-full flex-col items-center text-center">
      <h1 className="max-w-[22ch] text-3xl font-medium tracking-tight sm:text-4xl">{step.title}</h1>
      {step.subtitle && <p className="mx-auto mt-4 max-w-[52ch] text-muted">{step.subtitle}</p>}
      <div className="mt-8 flex w-full max-w-sm items-center justify-center gap-2 border-b-2 border-line pb-2 transition focus-within:border-text">
        <span className="text-3xl font-medium text-muted">₹</span>
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={raw === "" ? "" : Number(raw).toLocaleString("en-IN")}
          placeholder="0"
          aria-label={step.title}
          onChange={(e) => {
            setRaw(e.target.value.replace(/[^\d]/g, ""));
            setChallenge(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="num w-full bg-transparent text-center text-4xl font-medium tracking-tight outline-none sm:text-5xl"
        />
      </div>
      {min > 0 && raw !== "" && !ok && (
        <p className="mt-3 text-caption text-muted">Enter at least ₹{min.toLocaleString("en-IN")}.</p>
      )}
      {challenge && (
        <p className="mt-5 max-w-[46ch] rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-caption text-text">
          {challenge}
        </p>
      )}
      <button className={`${btnPrimary} mt-8 min-w-[180px]`} onClick={commit} disabled={!ok}>
        {challenge ? "Yes, this is right" : "Continue"}
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
          className="w-16 px-1 py-1.5 text-left text-sm font-medium text-muted hover:text-ink"
          style={{ visibility: i > 0 && step.kind !== "outro" ? "visible" : "hidden" }}
          onClick={() => actions.setStep(i - 1)}
        >
          ← Back
        </button>
        <Logo />
        {/* Spacer keeps the logo centred. There is deliberately no skip: the
            intake is the plan's foundation, so every question is answered. */}
        <span className="w-16" aria-hidden="true" />
      </div>

      <div className="mb-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
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
            <h1 className="max-w-[16ch] text-3xl font-medium tracking-tight sm:text-4xl">{step.title}</h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-muted">{step.subtitle}</p>
            <button className={`${btnPrimary} mt-8 min-w-[180px]`} onClick={next}>
              {step.cta}
            </button>
          </div>
        )}

        {step.kind === "goals" && (
          <div className="fade-up w-full">
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{step.title}</h1>
            <p className="mt-3 text-muted">{step.subtitle}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GOALS.map((g) => {
                const sel = s.selectedGoalIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => actions.toggleGoal(g.id)}
                    className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition ${
                      sel ? "border-brand-deep bg-brand-deep text-on-accent" : "border-line hover:border-brand"
                    }`}
                  >
                    <span className="text-sm font-medium">{g.name}</span>
                    <span className={`text-xs ${sel ? "text-on-accent/70" : "text-muted"}`}>{g.blurb}</span>
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
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{step.title}</h1>
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
                      sel ? "border-brand-deep bg-brand-deep text-on-accent" : "border-line hover:border-brand"
                    }`}
                  >
                    <span className="text-base font-medium">{opt.label}</span>
                    {opt.hint && <span className={`text-xs ${sel ? "text-on-accent/70" : "text-muted"}`}>{opt.hint}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step.kind === "money" && <MoneyStep key={step.id} step={step} onContinue={next} />}

        {step.kind === "outro" && (
          <div className="fade-up flex w-full flex-col items-center text-center">
            <h1 className="max-w-[18ch] text-3xl font-medium tracking-tight sm:text-4xl">{step.title}</h1>
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
