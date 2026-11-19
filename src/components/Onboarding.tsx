import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  STAGES,
  STEPS,
  TOTAL_STAGES,
  clampStepIndex,
  goalCostAnswer,
  goalCostKey,
  goalEstimate,
  resumeStepIndex,
  stageFill,
  type Step,
} from "../lib/onboarding";
import { GOAL_MAP, GOALS } from "../lib/goals";
import { inr } from "../lib/glue";
import { credentialError, inviteCodeError, login, register } from "../lib/authApi";
import type { Profile } from "../lib/types";
import { actions, getState, useStore } from "../store";
import { btnIntake } from "../ui";
import { CredentialFields } from "./AuthSheet";
import SupportPill from "./SupportPill";
import Logo from "./Logo";

/**
 * The intake, one question to a screen. Every step has the same anatomy,
 * top to bottom and left-aligned like the rest of the app: the question (the
 * one serif line on the screen), a sentence of help, the control, and at
 * most one blue button. A chosen option is marked in ink with a tick; blue
 * is only ever the way forward.
 */

/** The question. Serif, so the intake reads as a conversation rather than
    a form; sized in rem, so the phone's text setting scales it. */
const question =
  "text-balance font-serif text-[1.75rem] font-normal leading-[1.15] tracking-[-0.01em] text-text outline-none sm:text-[2.125rem]";
const helper = "mt-3 max-w-[52ch] text-pretty text-body text-text-2";
/** A second, quieter action under the main button: text, 44px to tap. */
const quietLink = "inline-flex min-h-11 items-center text-support transition-colors";
/** The most digits a rupee field takes: enough for thousands of crores, and
    short enough that the amount always fits its field on a 360px phone. */
const MAX_DIGITS = 12;
const digitsOnly = (text: string) => text.replace(/[^\d]/g, "").slice(0, MAX_DIGITS);
const grouped = (digits: string) => (digits === "" ? "" : Number(digits).toLocaleString("en-IN"));

function Tick({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}

/** The mark on a single-choice option: an empty ring, or an ink disc with a
    tick once chosen. With the ink outline around the option, the choice
    reads without colour. */
function ChoiceMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-6 w-6 flex-none place-items-center rounded-full ${on ? "bg-text text-bg" : "border-[1.5px] border-text-3 bg-surface"}`}
    >
      {on && <Tick />}
    </span>
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

/** What is stored for a step's field so far: a profile value or an intake answer. */
function storedAnswer(field: string): string | number | null | undefined {
  const st = getState();
  return PROFILE_FIELDS.has(field)
    ? (st.profile as unknown as Record<string, string | number | null>)[field]
    : st.onboardingAnswers[field];
}

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
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (they signed in earlier, or chose "New plan"): no auth
  // form, just save this plan to their account and show it.
  if (s.user) {
    return (
      <div>
        <h1 id="intake-question" tabIndex={-1} className={question}>
          Your plan is ready.
        </h1>
        <p className={helper}>You are signed in as {s.user.email}. The plan is saved to your account.</p>
        <button className={`${btnIntake} mt-6 w-full max-w-sm`} onClick={() => actions.finishOnboarding()}>
          {step.cta}
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (busy) return;
    const invalid = credentialError(email, password, mode === "register") ?? (mode === "register" ? inviteCodeError(invite) : null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    // A retry after "signed in but plan not loaded" skips the credential round
    // trip: the session already exists (re-registering would even be rejected).
    const existing = getState().user;
    let r =
      existing && existing.email.toLowerCase() === email.trim().toLowerCase()
        ? { ok: true as const, user: existing }
        : mode === "register"
          ? await register(email, password, invite)
          : await login(email, password);
    // A returning user often types correct credentials into the register
    // form. "Email already exists" with these credentials means they meant to
    // sign in - try that before showing anyone an error.
    let usedLogin = mode === "login";
    // The same goes for a refused invite code (403): someone who already has
    // an account needs no invitation.
    if (mode === "register" && !r.ok && (r.status === 409 || r.status === 403)) {
      const refused = r;
      const asLogin = await login(email, password);
      if (asLogin.ok && asLogin.user) {
        r = asLogin;
        usedLogin = true;
      } else {
        setBusy(false);
        setError(
          refused.status === 409
            ? "An account with this email already exists, but this password doesn't match it. Sign in with the password you created earlier."
            : (refused.error ?? "That invite code was not accepted."),
        );
        return;
      }
    }
    if (!r.ok || !r.user) {
      setBusy(false);
      setError(r.error ?? "Something went wrong. Try again.");
      return;
    }
    if (!usedLogin) {
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

  // The same fields as the sign-in sheet, at the intake's own height. The
  // button stays disabled until they validate: "not yet", never an error
  // after the fact.
  const invalid = credentialError(email, password, mode === "register") != null || (mode === "register" && inviteCodeError(invite) != null);

  return (
    <div>
      <h1 id="intake-question" tabIndex={-1} className={question}>
        {step.title}
      </h1>
      <p className={helper}>{step.subtitle}</p>

      <form
        className="mt-6 flex w-full max-w-sm flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <CredentialFields
          idPrefix="ob"
          mode={mode}
          size="intake"
          email={email}
          password={password}
          invite={invite}
          onEmail={setEmail}
          onPassword={setPassword}
          onInvite={setInvite}
          error={error}
        />
        <button type="submit" disabled={invalid} aria-disabled={busy} className={`${btnIntake} mt-1 w-full`}>
          {busy ? "One moment…" : mode === "register" ? "Create account and see plan" : "Sign in and see plan"}
        </button>
      </form>

      <div className="mt-2 flex flex-col items-start">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "register" ? "login" : "register");
            setError(null);
          }}
          className={`${quietLink} font-medium text-text underline underline-offset-2 hover:text-text-2`}
        >
          {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <button type="button" onClick={() => actions.finishOnboarding()} className={`${quietLink} text-text-2 hover:text-text`}>
          Skip for now and show my plan
        </button>
      </div>
    </div>
  );
}

/**
 * Plausibility checks against the answers already given. An implausible
 * answer is never blocked outright, but it is challenged: the person must
 * confirm it is genuinely true before the intake moves on. Honest numbers
 * are the plan's foundation.
 */
const CHECKS: Record<string, (v: number, p: Profile) => string | null> = {
  takeHome: (v) => (v > 0 && v < 1000 ? "That is under ₹1,000 a month. Confirm if that is right." : null),
  rent: (v, p) => (p.takeHome > 0 && v >= p.takeHome ? "Rent alone takes everything that comes in. Confirm if that is right." : null),
  emi: (v, p) =>
    p.takeHome > 0 && p.rent + v >= p.takeHome ? "Rent and EMIs together take everything that comes in. Confirm if that is right." : null,
  monthlySpend: (v, p) => {
    if (p.takeHome > 0 && p.rent + p.emi + v >= p.takeHome)
      return "These numbers say you spend everything that comes in, or more. Confirm if that is right.";
    if (v === 0) return "Nothing at all for groceries, bills and transport? Confirm if family covers all of it.";
    return null;
  },
  investedValue: (v, p) =>
    p.takeHome > 0 && v > p.takeHome * 600 ? "That is a very large amount next to this income. Confirm if the value is right." : null,
};

/**
 * A compulsory money question: type the exact amount, then continue. Continue
 * stays disabled until an explicit answer exists (0 typed out counts; an empty
 * field does not), which is what makes the intake honest. The field starts
 * empty, with no grey "0" in it that could be read as an answer.
 */
function MoneyStep({ step, onContinue }: { step: Step; onContinue: () => void }) {
  const prior = Number(storedAnswer(step.field!) ?? 0);
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

  // One line under the field: what is wrong with the amount, or a large
  // amount said back in lakhs and crores so a slipped zero is caught here.
  const tooLow = min > 0 && raw !== "" && !ok;
  const echo = ok && value! >= 100000 ? `That is ${inr(value!)}.` : null;

  return (
    <div>
      <h1 id="intake-question" tabIndex={-1} className={question}>
        {step.title}
      </h1>
      {step.subtitle && (
        <p id="intake-help" className={helper}>
          {step.subtitle}
        </p>
      )}
      <label className="mt-6 flex h-16 w-full max-w-sm cursor-text items-center gap-2 rounded-2xl border border-line-2 bg-surface px-4 transition-colors focus-within:border-text focus-within:ring-1 focus-within:ring-text">
        <span aria-hidden className="text-[1.5rem] font-medium leading-none text-text-2">
          ₹
        </span>
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={grouped(raw)}
          aria-labelledby="intake-question"
          aria-describedby={step.subtitle ? "intake-help" : undefined}
          onChange={(e) => {
            setRaw(digitsOnly(e.target.value));
            setChallenge(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="num h-full w-full min-w-0 bg-transparent text-[1.75rem] font-medium tracking-tight text-text outline-none"
        />
      </label>
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] max-w-sm text-support text-text-2">
        {tooLow ? `Enter at least ₹${min.toLocaleString("en-IN")}.` : echo}
      </p>
      {/* Amber, a mark and the words: a question back to the person, not an error. */}
      {challenge && (
        <p role="alert" className="mt-2 flex max-w-sm items-start gap-2 rounded-control bg-cau-bg px-3 py-2.5 text-support text-cau">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden className="mt-0.5 flex-none">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.8v3.6" />
            <path d="M8 11v.1" />
          </svg>
          <span>{challenge}</span>
        </p>
      )}
      <button className={`${btnIntake} mt-4 w-full max-w-sm`} onClick={commit} disabled={!ok}>
        {challenge ? "Yes, this is right" : "Continue"}
      </button>
    </div>
  );
}

/**
 * One question, a short list of answers. Tapping an answer stores it and
 * moves on, so a first pass needs no button. Coming back to a question that
 * already has its answer shows Continue, so the way forward never depends
 * on tapping the same answer again.
 */
function SingleStep({ step, onContinue }: { step: Step; onContinue: () => void }) {
  const s = useStore();
  const current = String(storedAnswer(step.field!) ?? "");
  const [hadAnswer] = useState(current !== "");
  // The chosen answer shows for a moment before the next question. If the
  // person presses Back in that moment, the move forward is dropped.
  const moveOn = useRef<number>();
  useEffect(() => () => window.clearTimeout(moveOn.current), []);
  // "The first one" is the first goal picked, and the plan uses the answer
  // for that goal alone. The screen says which goal that is.
  const firstGoal = step.field === "timeline" ? GOAL_MAP[s.selectedGoalIds[0]] : undefined;
  const lead = firstGoal ? `This is for ${firstGoal.name}, the first goal you picked. ` : "";

  return (
    <div>
      <h1 id="intake-question" tabIndex={-1} className={question}>
        {step.title}
      </h1>
      {(lead || step.subtitle) && (
        <p className={helper}>
          {lead}
          {step.subtitle}
        </p>
      )}
      <div role="group" aria-labelledby="intake-question" className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {step.options!.map((opt) => {
          const sel = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={sel}
              onClick={() => {
                setAnswer(step.field!, opt.value);
                window.clearTimeout(moveOn.current);
                moveOn.current = window.setTimeout(onContinue, 200);
              }}
              className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 text-left transition-colors ${
                sel ? "border-text ring-1 ring-text" : "border-line-2 hover:border-text-3"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-body font-medium text-text">{opt.label}</span>
                {opt.hint && <span className="mt-0.5 block text-support text-text-2">{opt.hint}</span>}
              </span>
              <ChoiceMark on={sel} />
            </button>
          );
        })}
      </div>
      {hadAnswer && (
        <button className={`${btnIntake} mt-6 w-full max-w-sm`} onClick={onContinue}>
          Continue
        </button>
      )}
    </div>
  );
}

/**
 * Up to three goals from the catalogue. Each tile carries the goal's name
 * and the price the plan would start it at for this person (their city, and
 * for the emergency fund their own outgoings). Names wrap rather than clip,
 * and an amount never splits from its unit. A picked tile turns ink with a
 * tick. Once three are picked the rest step back, and the count says why.
 * On a phone the count and Continue hold to the bottom of the screen while
 * the list scrolls.
 */
function GoalsStep({ step, onContinue }: { step: Step; onContinue: () => void }) {
  const s = useStore();
  const count = s.selectedGoalIds.length;
  const full = count >= 3;
  // An odd catalogue would leave one tile alone in the last row: it takes the row.
  const lastSpan = GOALS.length % 2 === 1 ? "col-span-2" : "";

  return (
    <div>
      <h1 id="intake-question" tabIndex={-1} className={question}>
        {step.title}
      </h1>
      <p className={helper}>{step.subtitle}</p>
      <div role="group" aria-labelledby="intake-question" className="mt-6 grid grid-cols-2 gap-2">
        {GOALS.map((g, k) => {
          const sel = s.selectedGoalIds.includes(g.id);
          const blocked = full && !sel;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => actions.toggleGoal(g.id)}
              aria-pressed={sel}
              aria-disabled={blocked}
              className={`flex min-h-[4.5rem] flex-col justify-between gap-1 rounded-2xl border px-3.5 py-3 text-left transition-colors sm:min-h-14 sm:flex-row sm:items-center sm:gap-3 sm:px-4 ${
                k === GOALS.length - 1 ? lastSpan : ""
              } ${
                sel
                  ? "border-accent-fill bg-accent-fill text-on-accent"
                  : blocked
                    ? "cursor-not-allowed border-line text-text-2"
                    : "border-line-2 bg-surface text-text hover:border-text-3"
              }`}
            >
              <span className="text-balance text-body font-medium leading-snug">{g.name}</span>
              <span className="flex items-center justify-between gap-2 sm:flex-none">
                <span className={`num whitespace-nowrap text-support ${sel ? "text-on-accent/80" : "text-text-2"}`}>
                  {inr(goalEstimate(g, s.profile))}
                </span>
                {sel && <Tick size={16} />}
              </span>
            </button>
          );
        })}
      </div>
      {/* On a phone this bar is held to the bottom of the screen, and at the
          end of the list it sits flush on the bottom edge (the negative margin
          takes back the page's own bottom padding). */}
      <div className="sticky bottom-0 -mx-5 -mb-10 mt-4 flex items-center justify-between gap-4 border-t border-line bg-bg px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:mb-0 sm:mt-6 sm:flex-row-reverse sm:justify-end sm:border-0 sm:p-0">
        <p aria-live="polite" className="text-support text-text-2">
          <span className="block text-body font-medium text-text">{count} of 3 picked</span>
          {full && <span className="block">Remove one to pick another.</span>}
        </p>
        <button className={`${btnIntake} flex-none`} disabled={count === 0} onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}

/**
 * What each picked goal will cost, in today's money: one field per goal,
 * holding the price the plan would start it at. Nothing here has to be
 * typed. A field left alone, or emptied, keeps the estimate; a price typed
 * here becomes that goal's target. A student's trip is ₹20,000, not the
 * ₹2 L a family trip costs, and the first screen should know it.
 */
function CostsStep({ step, onContinue, onBack }: { step: Step; onContinue: () => void; onBack: () => void }) {
  const s = useStore();
  const picked = s.selectedGoalIds.map((id) => GOAL_MAP[id]).filter(Boolean);
  const estimate = (id: string) => goalEstimate(GOAL_MAP[id], s.profile);
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(picked.map((g) => [g.id, s.onboardingAnswers[goalCostKey(g.id)] || String(estimate(g.id))])),
  );
  const changed = picked.some((g) => goalCostAnswer(Number(raw[g.id]), estimate(g.id)) !== "");

  const commit = () => {
    for (const g of picked) actions.setAnswer(goalCostKey(g.id), goalCostAnswer(Number(raw[g.id]), estimate(g.id)));
    onContinue();
  };

  // Reached with nothing picked (an older saved intake can land here): the
  // one thing to do is go and pick.
  if (picked.length === 0) {
    return (
      <div>
        <h1 id="intake-question" tabIndex={-1} className={question}>
          {step.title}
        </h1>
        <p className={helper}>You have not picked a goal yet. Pick at least one and its price shows here.</p>
        <button className={`${btnIntake} mt-6 w-full max-w-sm`} onClick={onBack}>
          Pick your goals
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 id="intake-question" tabIndex={-1} className={question}>
        {step.title}
      </h1>
      <p className={helper}>{step.subtitle}</p>
      <div className="mt-6 flex w-full max-w-sm flex-col gap-5">
        {picked.map((g) => {
          const id = `intake-cost-${g.id}`;
          return (
            <div key={g.id}>
              <label htmlFor={id} className="block text-body font-medium text-text">
                {g.name}
              </label>
              <p id={`${id}-about`} className="text-support text-text-2">
                {g.blurb}
              </p>
              <div className="mt-2 flex h-14 cursor-text items-center gap-2 rounded-2xl border border-line-2 bg-surface px-4 transition-colors focus-within:border-text focus-within:ring-1 focus-within:ring-text">
                <span aria-hidden className="text-headline font-medium text-text-2">
                  ₹
                </span>
                <input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={grouped(raw[g.id] ?? "")}
                  // An emptied field shows the estimate it will fall back to.
                  placeholder={estimate(g.id).toLocaleString("en-IN")}
                  aria-describedby={`${id}-about`}
                  onChange={(e) => setRaw({ ...raw, [g.id]: digitsOnly(e.target.value).replace(/^0+/, "") })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                  }}
                  className="num h-full w-full min-w-0 bg-transparent text-headline font-medium text-text outline-none placeholder:font-normal placeholder:text-text-3"
                />
              </div>
            </div>
          );
        })}
      </div>
      <button className={`${btnIntake} mt-6 w-full max-w-sm`} onClick={commit}>
        Continue
      </button>
      {changed && (
        <div>
          <button
            type="button"
            onClick={() => setRaw(Object.fromEntries(picked.map((g) => [g.id, String(estimate(g.id))])))}
            className={`${quietLink} mt-1 text-text-2 underline underline-offset-2 hover:text-text`}
          >
            Use our estimates instead
          </button>
        </div>
      )}
    </div>
  );
}

/** The opening screen. The five sections are a real sequence, so they are
    numbered. On a wide screen the rail beside the question already lists
    them, so the list here is for phones and tablets. */
function IntroStep({ step, onContinue }: { step: Step; onContinue: () => void }) {
  return (
    <div>
      <h1 id="intake-question" tabIndex={-1} className={question}>
        {step.title}
      </h1>
      <p className={helper}>{step.subtitle}</p>
      <ol className="mt-6 max-w-md divide-y divide-line border-y border-line lg:hidden">
        {STAGES.map((st) => (
          <li key={st.n} className="flex gap-3 py-2.5">
            <span aria-hidden className="num w-4 flex-none text-body text-text-2">
              {st.n}
            </span>
            <span className="min-w-0">
              <span className="block text-body font-medium text-text">{st.label}</span>
              <span className="block text-support text-text-2">{st.desc}</span>
            </span>
          </li>
        ))}
      </ol>
      <button className={`${btnIntake} mt-6 w-full max-w-sm`} onClick={onContinue}>
        {step.cta}
      </button>
    </div>
  );
}

/**
 * The five sections of the intake, listed in full beside every question on
 * a wide screen, so the person knows the size of what they are agreeing to.
 * The order is real, so each carries its number. A finished section swaps
 * the number for a tick on ink, the current one has an ink ring and its one
 * line of description, and the ones ahead are grey. Deliberately monochrome:
 * the rail is not interactive, and blue stays with the button.
 */
function StageRail({ current, allDone }: { current: number; allDone: boolean }) {
  return (
    <nav aria-label="Intake sections">
      <ol className="flex flex-col">
        {STAGES.map((st, idx) => {
          const state = allDone || st.n < current ? "done" : st.n === current ? "active" : "todo";
          return (
            <li key={st.n} aria-current={state === "active" ? "step" : undefined} className="relative flex gap-3 pb-7 last:pb-0">
              {idx < STAGES.length - 1 && (
                <span aria-hidden className={`absolute bottom-1 left-[11.5px] top-7 w-px ${state === "done" ? "bg-text" : "bg-line-2"}`} />
              )}
              {state === "done" ? (
                <span role="img" aria-label="Done" className="grid h-6 w-6 flex-none place-items-center rounded-full bg-text text-bg">
                  <Tick />
                </span>
              ) : (
                <span
                  aria-hidden
                  className={`num grid h-6 w-6 flex-none place-items-center rounded-full text-index font-medium ${
                    state === "active" ? "border-[1.5px] border-text text-text" : "border border-text-3 text-text-2"
                  }`}
                >
                  {st.n}
                </span>
              )}
              <div className="min-w-0 pt-0.5">
                <p className={`text-support font-medium ${state === "todo" ? "text-text-2" : "text-text"}`}>{st.label}</p>
                {state === "active" && <p className="mt-1 text-support text-text-2">{st.desc}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The same five sections on a phone or tablet, where there is no room for
 * the rail: one segment per section, in ink. Sections passed are full, the
 * current one fills as its questions go by, and the words under it say
 * which section this is and how many there are.
 */
function ProgressRail({ index }: { index: number }) {
  const step = STEPS[index];
  const fill = stageFill(index);
  return (
    <div className="lg:hidden">
      <div aria-hidden className="flex gap-1.5">
        {fill.map((f, k) => (
          <span key={k} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-2">
            <span
              className="block h-full rounded-full bg-text transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${f * 100}%` }}
            />
          </span>
        ))}
      </div>
      {step.stage > 0 && (
        <p className="mt-2 flex items-baseline justify-between gap-3 text-support">
          <span className="font-medium text-text">{step.stageLabel}</span>
          <span className="whitespace-nowrap text-text-2">
            Section {step.stage} of {TOTAL_STAGES}
          </span>
        </p>
      )}
      {step.kind === "account" && <p className="mt-2 text-support text-text-2">All {TOTAL_STAGES} sections done</p>}
    </div>
  );
}

/**
 * True when the page itself opened on the intake: the browser had saved an
 * intake in progress and has just restored it. The saved place is a step
 * number, and the list has lost a step since, so it can sit one question
 * ahead of the answers. In that one case the place is checked against the
 * answers before the first paint. Moving about inside a running app is never
 * second-guessed. (In development a hot reload runs this file again, so the
 * check is remembered as done.)
 */
let restoredOnLoad = !import.meta.hot?.data.intakeChecked && getState().screen === "onboarding";
if (import.meta.hot) import.meta.hot.data.intakeChecked = true;

export default function Onboarding() {
  const s = useStore();
  // The saved index is clamped where it is read: an intake saved before a
  // step was removed can point past the end of the list.
  const i = clampStepIndex(s.onboardingStepIndex);
  const step = STEPS[i];

  // A restored intake never resumes past a question that has no answer.
  useLayoutEffect(() => {
    if (!restoredOnLoad) return;
    restoredOnLoad = false;
    const st = getState();
    const at = resumeStepIndex(st.onboardingStepIndex, st.profile, st.onboardingAnswers, st.selectedGoalIds);
    if (at !== st.onboardingStepIndex) actions.setStep(at);
  }, []);

  const next = () => actions.setStep(Math.min(i + 1, STEPS.length - 1));
  const back = () => (i > 0 ? actions.setStep(i - 1) : actions.goPlan());
  // Step 0 with an existing plan offers the way back out: "New plan" from
  // the app must never trap someone in the intake.
  const canGoBack = (i > 0 && step.kind !== "account") || (i === 0 && s.goals.length > 0);

  // A new question starts at the top of the page (the goal list can be
  // scrolled) and takes keyboard focus, so a screen reader reads it. A money
  // question puts focus in its field instead.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (STEPS[i].kind !== "money") document.getElementById("intake-question")?.focus({ preventScroll: true });
  }, [i]);

  return (
    <div className="flex min-h-screen">
      {/* The sections live in their own column, on their own ground: every
          one visible from the first screen, ticked off as it completes. */}
      <aside className="sticky top-0 hidden h-screen w-72 flex-none flex-col justify-between self-start border-r border-line bg-sidebar px-7 pb-6 pt-6 lg:flex">
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
            className="flex min-h-11 items-center gap-2 self-start text-support text-text-2 transition-colors hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Log out of account
          </button>
        )}
      </aside>

      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-1 flex-col px-5 pb-10 pt-3 sm:px-8">
        {/* Back on the left, the logo in the middle on a phone. There is
            deliberately no skip: the intake is the plan's foundation, so
            every question is answered. */}
        <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            type="button"
            className="-ml-2 inline-flex min-h-11 items-center gap-1 justify-self-start rounded-control pl-1 pr-2 text-support font-medium text-text-2 transition-colors hover:text-text"
            style={{ visibility: canGoBack ? "visible" : "hidden" }}
            onClick={back}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
            {i > 0 ? "Back" : "My plan"}
          </button>
          <span className="lg:hidden">
            <Logo />
          </span>
        </div>

        <div className="mt-3">
          <ProgressRail index={i} />
        </div>

        {/* One step at a time. Moving to the next question is the answer to
            a tap, so the new step eases in once (and does not when motion is
            reduced). Nothing else on the screen moves on its own. */}
        <div key={step.id} className="fade-up flex-1 pt-7 sm:pt-10">
          {step.kind === "intro" && <IntroStep step={step} onContinue={next} />}
          {step.kind === "single" && <SingleStep step={step} onContinue={next} />}
          {step.kind === "money" && <MoneyStep step={step} onContinue={next} />}
          {step.kind === "goals" && <GoalsStep step={step} onContinue={next} />}
          {step.kind === "costs" && <CostsStep step={step} onContinue={next} onBack={back} />}
          {step.kind === "account" && <AccountStep step={step} />}
        </div>
      </div>

      <SupportPill />
    </div>
  );
}
