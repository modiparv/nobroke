import { useState } from "react";
import { STEPS, TOTAL_STAGES, type Step } from "../lib/onboarding";
import { GOALS } from "../lib/goals";
import { credentialError, login, register } from "../lib/authApi";
import type { Profile } from "../lib/types";
import { actions, getState, useStore } from "../store";
import { btnIntake } from "../ui";
import SupportPill from "./SupportPill";
import Logo from "./Logo";
import PasswordField from "./PasswordField";

/**
 * The commitment moment: the intake is done, so this is when someone is most
 * willing to create an account. Signing up builds the plan and saves it to
 * the new account; signing in adopts an existing account's plan (or uses this
 * intake if that account has none yet); skipping just shows the plan locally.
 */
function AccountStep({ step }: { step: Step }) {
  const s = useStore();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (they signed in earlier, or chose "New plan"): no auth
  // form, just save this plan to their account and show it.
  if (s.user) {
    return (
      <div className="fade-up mx-auto flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">Your plan is ready.</h1>
        <p className="mt-3 text-muted">Signed in as {s.user.email}. We will save it to your account.</p>
        <button className={`${btnIntake} mt-8 w-full max-w-sm`} onClick={() => actions.finishOnboarding()}>
          {step.cta}
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (busy) return;
    const invalid = credentialError(email, password, mode === "register");
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    // A retry after "signed in but plan not loaded" skips the credential round
    // trip: the session already exists (re-registering would even be rejected).
    const existing = getState().user;
    const r =
      existing && existing.email.toLowerCase() === email.trim().toLowerCase()
        ? { ok: true as const, user: existing }
        : mode === "register"
          ? await register(email, password)
          : await login(email, password);
    if (!r.ok || !r.user) {
      setBusy(false);
      setError(r.error ?? "Something went wrong. Try again.");
      return;
    }
    if (mode === "register") {
      // Build the plan from the intake, then push it to the fresh account.
      // If the seed save cannot happen right now, the plan still shows locally
      // and revalidateSession pushes it once the connection heals.
      actions.finishOnboarding();
      void actions.completeAuth(r.user);
    } else {
      // Existing account: its saved plan wins; fall back to this intake only
      // if the account has none yet. If the plan cannot be READ, do not guess
      // — deciding from local state here is exactly how someone's real plan
      // gets shadowed by a fresh intake.
      const synced = await actions.completeAuth(r.user, { preferServer: true });
      if (synced !== "ok") {
        setBusy(false);
        setError("You're signed in, but your saved plan couldn't be loaded. Check your connection and try again.");
        return;
      }
      if (getState().goals.length === 0) actions.finishOnboarding();
      else actions.goPlan();
    }
  };

  // Same affordance as AuthSheet: 56px fields, hints in placeholders, and
  // the button disabled until the group validates instead of erroring after.
  const field =
    "h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none transition focus:border-text focus:ring-1 focus:ring-text";
  const invalid = credentialError(email, password, mode === "register") != null;

  return (
    <div className="fade-up mx-auto flex w-full max-w-sm flex-col items-center text-center">
      <h1 className="text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">{step.title}</h1>
      <p className="mt-3 text-muted">{step.subtitle}</p>

      <form
        className="mt-7 flex w-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="ob-email" className="text-caption font-medium text-text-2">
            Email
          </label>
          <input
            id="ob-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@email.com"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="ob-password" className="text-caption font-medium text-text-2">
            Password
          </label>
          <PasswordField
            id="ob-password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder={mode === "register" ? "Create a password (8+ characters)" : "Password"}
            className={field}
          />
        </div>
        {error && (
          <p role="alert" aria-live="polite" className="rounded-control bg-neg-bg px-3 py-2 text-support text-neg">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || invalid} className={`${btnIntake} w-full`}>
          {busy ? "One moment…" : mode === "register" ? "Create account and see plan" : "Sign in and see plan"}
        </button>
      </form>

      <div className="mt-4 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "register" ? "login" : "register");
            setError(null);
          }}
          className="text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
        >
          {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <button
          type="button"
          onClick={() => actions.finishOnboarding()}
          className="text-caption text-text-2 transition hover:text-text"
        >
          Skip for now, just show my plan
        </button>
      </div>
    </div>
  );
}

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
      <h1 className="max-w-[22ch] text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">{step.title}</h1>
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
      <button className={`${btnIntake} mt-8 w-full max-w-sm`} onClick={commit} disabled={!ok}>
        {challenge ? "Yes, this is right" : "Continue"}
      </button>
    </div>
  );
}

/**
 * The five sections of the intake, listed in full from the very first screen
 * so the person knows the size of what they are agreeing to. One line each on
 * what the active section needs. Deliberately monochrome: the rail is not
 * interactive, and the accent never decorates.
 */
const STAGES = [
  { n: 1, label: "Income", desc: "What lands in your account each month." },
  { n: 2, label: "Spending", desc: "Rent, EMIs and everything else that goes out." },
  { n: 3, label: "What you hold", desc: "Cash and investments you already have." },
  { n: 4, label: "Context", desc: "City, career and who depends on you." },
  { n: 5, label: "Goals", desc: "What you are building toward, and when." },
];

/** Indian account rails, listed honestly as coming soon. Nothing here fakes
 *  a connection: the step informs and steps aside. */
const CONNECT_SOURCES = [
  { name: "Investment portfolio", via: "CAMS · KFintech" },
  { name: "Banking and income", via: "Finvu · OneMoney · CAMSFinserv" },
  { name: "Trading and execution", via: "DhanHQ · HDFC Sec · AngelOne" },
  { name: "Identity and KYC", via: "NSDL · KRA" },
];

function StageRail({ current, allDone }: { current: number; allDone: boolean }) {
  return (
    <nav aria-label="Intake sections">
      <ol className="flex flex-col">
        {STAGES.map((st, idx) => {
          const state = allDone || st.n < current ? "done" : st.n === current ? "active" : "todo";
          return (
            <li key={st.n} className="relative pb-8 pl-5 last:pb-0">
              {idx < STAGES.length - 1 && (
                <span aria-hidden className="absolute bottom-2 left-[3px] top-4 w-px bg-line-2" />
              )}
              <span
                aria-hidden
                className={`absolute left-0 top-[6px] h-[7px] w-[7px] rounded-full ${
                  state === "active" ? "bg-text" : state === "done" ? "bg-text-2" : "border border-line-2"
                }`}
              />
              <p
                className={`text-support font-medium ${
                  state === "active" ? "text-text" : state === "done" ? "text-display" : "text-text-2"
                }`}
              >
                {st.label}
                {state === "done" && <span className="sr-only"> (completed)</span>}
              </p>
              {state === "active" && <p className="mt-1 text-caption text-text-2">{st.desc}</p>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function Onboarding() {
  const s = useStore();
  const i = s.onboardingStepIndex;
  const step = STEPS[i];
  const next = () => actions.setStep(i + 1);

  const progress = step.kind === "account" ? 100 : step.stage <= 0 ? 0 : (step.stage / TOTAL_STAGES) * 100;

  return (
    <div className="flex min-h-screen">
      {/* The journey lives in its own column, on its own ground: every
          section visible from the first screen, ticked off as it completes. */}
      <aside className="hidden w-72 flex-none flex-col justify-between border-r border-line bg-sidebar px-7 pb-6 pt-6 lg:flex">
        <div>
          <Logo />
          <div className="mt-12">
            <StageRail current={step.stage} allDone={step.kind === "account"} />
          </div>
        </div>
        {s.user && (
          <button
            type="button"
            onClick={() => void actions.signOut()}
            className="flex items-center gap-2 text-support text-text-2 transition hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Log out of account
          </button>
        )}
      </aside>

      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-1 flex-col px-5 pb-10 pt-5 sm:px-8">
        <div className="flex items-center justify-between gap-3 pb-4">
          <button
            className="w-16 px-1 py-1.5 text-left text-sm font-medium text-muted hover:text-ink"
            style={{ visibility: i > 0 && step.kind !== "account" ? "visible" : "hidden" }}
            onClick={() => actions.setStep(i - 1)}
          >
            ← Back
          </button>
          <span className="lg:hidden">
            <Logo />
          </span>
          {/* Spacer keeps the logo centred. There is deliberately no skip: the
              intake is the plan's foundation, so every question is answered. */}
          <span className="w-16" aria-hidden="true" />
        </div>

        {/* On small screens the rail collapses to the progress bar. */}
        <div className="mb-2 flex items-center gap-3 lg:hidden">
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
            <h1 className="max-w-[16ch] text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">{step.title}</h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-muted">{step.subtitle}</p>
            <button className={`${btnIntake} mt-8 w-full max-w-sm`} onClick={next}>
              {step.cta}
            </button>
          </div>
        )}

        {step.kind === "goals" && (
          <div className="fade-up w-full">
            <h1 className="text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">{step.title}</h1>
            <p className="mt-3 text-muted">{step.subtitle}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GOALS.map((g) => {
                const sel = s.selectedGoalIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => actions.toggleGoal(g.id)}
                    className={`flex flex-col gap-1 rounded-card border p-4 text-left transition ${
                      sel ? "border-brand-deep bg-brand-deep text-on-accent" : "border-line hover:border-accent"
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
              <button className={`${btnIntake} px-10`} disabled={s.selectedGoalIds.length === 0} onClick={next}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step.kind === "single" && (
          <div className="fade-up w-full">
            <h1 className="text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">{step.title}</h1>
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
                    className={`flex flex-col gap-1 rounded-card border p-5 text-left transition ${
                      sel ? "border-brand-deep bg-brand-deep text-on-accent" : "border-line hover:border-accent"
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

          {step.kind === "connect" && (
            <div className="fade-up w-full">
              <h1 className="text-3xl font-serif font-normal tracking-[-0.01em] text-display sm:text-4xl">{step.title}</h1>
              <p className="mt-3 text-muted">{step.subtitle}</p>
              <div className="mt-6 flex flex-col gap-3">
                {CONNECT_SOURCES.map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
                    <div className="min-w-0">
                      <p className="text-row font-medium">{c.name}</p>
                      <p className="mt-0.5 text-caption text-text-2">{c.via}</p>
                    </div>
                    <span className="flex-none rounded-full border border-line px-2.5 py-1 text-index uppercase tracking-wide text-text-2">
                      Coming soon
                    </span>
                  </div>
                ))}
              </div>
              <button className={`${btnIntake} mt-8 w-full max-w-sm`} onClick={next}>
                Skip for now
              </button>
            </div>
          )}

          {step.kind === "money" && <MoneyStep key={step.id} step={step} onContinue={next} />}

          {step.kind === "account" && <AccountStep step={step} />}
        </div>
      </div>

      <SupportPill />
    </div>
  );
}
