import { useEffect, useRef, useState, type ReactNode } from "react";
import { actions, getState, useStore } from "../store";
import { btnGhost } from "../ui";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";
import SupportPill from "./SupportPill";

/**
 * Landing, in NoBroke's own register: blueprint minimalism. White ruled
 * paper (the notebook a plan is born in), one geometric face, brand blue as
 * the single accent, and the logo's rising line as the recurring motif —
 * the product's own chart language doing the talking. The one deep moment
 * is the brand navy, never black. Every claim is scoped to what the
 * product does today.
 */

/** Set to the founder's LinkedIn URL to light up the footer link. */
const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/parv-modi-3008p/";

const OFFERINGS = [
  {
    title: "See everything you own",
    paras: [
      "Cash, mutual funds, FDs, gold, EPF. One clean view of your wealth, today.",
      "Each holding takes seconds to add, and the totals update live. No accounts to link. No money to move.",
    ],
  },
  {
    title: "A plan built from real numbers",
    paras: [
      "Five short sections: income, spending, what you hold, your context, your goals. Every answer shapes the plan, so none can be skipped.",
      "The plan shows its work. Every assumption inspectable, every projection explained.",
    ],
  },
  {
    title: "One portfolio funds every goal",
    paras: [
      "Not a bucket per dream. A single portfolio, matched to the risk you can actually live with, carries the house, the wedding and the retirement together.",
      "Each goal gets a target, a date, and the monthly amount it truly needs.",
    ],
  },
  {
    title: "Ask. It runs the numbers.",
    paras: [
      "Change the plan in plain words: the monthly, a target, a horizon. It happens on the spot, every number recomputed.",
      "Anything else you ask is answered against your whole plan: every goal, target, monthly, projection and holding.",
    ],
  },
];

/**
 * Tier names walk the arc of wealth in the old stories: Akshaya, the vessel
 * that never empties; Meru, the golden mountain. The gate that scales with
 * seriousness is the number of goals; the top tier sells the whole-life view
 * plus a named human.
 */
const TIERS = [
  {
    name: "Akshaya",
    tagline: "The vessel that never empties",
    price: "₹299",
    period: "/month",
    annual: "₹2,999 a year (2 months free)",
    gate: "Unlimited goals",
    popular: true,
    features: [
      "Full planning, unlimited goals",
      "Statement import and reconciliation",
      "Portfolio x-ray and deeper nudges",
      "Priority copilot",
    ],
  },
  {
    name: "Meru",
    tagline: "The golden mountain",
    price: "₹999",
    period: "/month",
    annual: "₹9,999 a year (2 months free)",
    gate: "Your whole household",
    popular: false,
    features: [
      "Everything in Akshaya, household-wide",
      "Lifetime Balance Sheet, every calculation shown",
      "Tax lens on every holding",
      "A named human wealth manager, 1:1 reviews",
    ],
  },
];

/** Line art for the layer cards: quiet hairlines with the blue doing only
 *  the load-bearing stroke, drawn from tokens. */
const LAYERS = [
  {
    title: "Protect",
    body: "A cushion check before anything else: if cash covers less than three months of expenses, the plan says so plainly. Risk appetite is read from your answers, then handed to you. One slide to change.",
    art: (
      <div className="relative" aria-hidden>
        <div className="absolute -bottom-4 left-1/2 h-10 w-40 -translate-x-1/2 rounded-xl border border-line bg-surface" />
        <div className="absolute -bottom-2 left-1/2 h-10 w-44 -translate-x-1/2 rounded-xl border border-line bg-surface" />
        <div className="relative flex h-11 w-48 items-center justify-center gap-2 rounded-xl border border-line-2 bg-surface">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--accent-text))" strokeWidth="1.6">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          </svg>
          <span className="text-index uppercase tracking-[0.13em] text-text-2">Safety net</span>
        </div>
      </div>
    ),
  },
  {
    title: "Plan",
    body: "Every goal gets a target in today's money, a date, and the monthly it truly needs. Inflation is priced in. Trade-offs show the moment you make them.",
    art: (
      <div className="flex flex-col items-center gap-1" aria-hidden>
        <span className="text-index uppercase tracking-[0.13em] text-text-3">Goals</span>
        <svg viewBox="0 0 200 78" className="w-44 text-text-2">
          <path d="M22 74 A 78 78 0 0 1 178 74" fill="none" stroke="rgb(var(--text-3))" strokeDasharray="3 4" />
          <g fill="rgb(var(--surface))" stroke="rgb(var(--accent-text))">
            <circle cx="46" cy="45" r="13" />
            <circle cx="100" cy="20" r="13" />
            <circle cx="154" cy="45" r="13" />
          </g>
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M41 49v-5l5-4 5 4v5h-10z" />
            <path d="M100 25c-1.4-2.2-5-1.9-5 .8 0 2 2.9 3.7 5 5.2 2.1-1.5 5-3.2 5-5.2 0-2.7-3.6-3-5-.8z" />
            <path d="M148 44l6-3 6 3-6 3-6-3zM158 46v4" />
          </g>
        </svg>
      </div>
    ),
  },
  {
    title: "Prosper",
    body: "One portfolio carries every goal, tuned to your horizon and risk. Projections show the arithmetic: expected return, the gap, what changes if you wait.",
    art: (
      <svg viewBox="0 0 220 120" className="w-52" aria-hidden>
        <g stroke="rgb(var(--line))" strokeWidth="1">
          <line x1="10" y1="10" x2="10" y2="110" />
          <line x1="60" y1="10" x2="60" y2="110" />
          <line x1="110" y1="10" x2="110" y2="110" />
          <line x1="160" y1="10" x2="160" y2="110" />
          <line x1="210" y1="10" x2="210" y2="110" />
          <line x1="10" y1="35" x2="210" y2="35" />
          <line x1="10" y1="60" x2="210" y2="60" />
          <line x1="10" y1="85" x2="210" y2="85" />
          <line x1="10" y1="110" x2="210" y2="110" />
        </g>
        <polyline
          points="10,105 30,98 50,100 70,88 90,90 110,78 130,72 150,60 170,50 190,35 210,18"
          fill="none"
          stroke="rgb(var(--accent-text))"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="210" cy="18" r="3.5" fill="rgb(var(--accent-text))" />
      </svg>
    ),
  },
];

/** The division of labour as a plain two-column ledger. The AI column states
 *  only what the engine truly does. */
const HUMAN_ROWS = [
  "Chooses the goals that matter",
  "Sets the risk you can live with",
  "Sees the life behind the numbers",
  "Makes the final call, always",
];
const AI_ROWS = [
  "Recomputes every number in seconds",
  "Prices inflation into every target",
  "Keeps the portfolio matched to your risk",
  "Answers from your plan, instantly",
];

/**
 * The hero graphic is the product's own chart, drawn on the ruled paper:
 * one monthly amount splits across the goals, so each goal gets ITS OWN
 * line, growing to its own date and hollow circle — exactly how the app's
 * goals chart draws it, in the same categorical palette. The printed
 * figures are the whole pool's honest arithmetic: ₹25,000 a month for 20
 * years at the same conservative pace is put in ₹60.0L, growth ₹1.4Cr,
 * about ₹2.0Cr by 2046.
 */
function HeroPath() {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-eyebrow uppercase text-accent">One plan, every goal</span>
        <span className="num text-caption text-text-2">₹25,000 a month · Illustrative, not advice</span>
      </div>
      <svg
        viewBox="0 0 720 216"
        className="mt-3 w-full"
        role="img"
        aria-label="Three rising lines from one monthly amount: safety net by 2027, first home by 2034, early retirement by 2046"
      >
        {/* One monthly amount fans into three trajectories from a shared
            origin — each goal's share on its own line, in the app's own
            palette. The safety net finishes high early (it hits its small
            target first); the longer horizons pass beneath and overtake.
            Geometry generated and gap-checked, not eyeballed. */}
        <polyline
          points="0,196 100,190 200,177 300,158 400,133 500,105 600,71 700,34"
          fill="none"
          stroke="var(--chart-3)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points="0,196 63,191 126,181 189,168 251,153 314,136 377,117 440,96"
          fill="none"
          stroke="var(--chart-2)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points="0,196 26,192 51,185 77,177 103,169 129,160 154,150 180,140"
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <g fill="rgb(var(--surface))" strokeWidth="2">
          <circle cx="180" cy="140" r="6" stroke="var(--chart-1)" />
          <circle cx="440" cy="96" r="6" stroke="var(--chart-2)" />
          <circle cx="700" cy="34" r="6" stroke="var(--chart-3)" />
        </g>
        <g fontSize="11" fill="rgb(var(--text-2))">
          <text x="180" y="124">Safety net · 2027</text>
          <text x="440" y="78" textAnchor="middle">First home · 2034</text>
          <text x="700" y="16" textAnchor="end">Early retirement · 2046</text>
        </g>
      </svg>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line pt-3.5">
        <span className="num text-section font-medium text-text">₹2.0Cr</span>
        <span className="text-caption text-text-2">
          together by 2046 · put in <span className="num font-medium text-text">₹60.0L</span> · growth{" "}
          <span className="num font-medium text-text">₹1.4Cr</span>
        </span>
      </div>
    </div>
  );
}

/** Once-per-element scroll reveal. Motion-reduced users see content
 *  immediately (handled in CSS). */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

export default function Landing() {
  const s = useStore();
  const [showAuth, setShowAuth] = useState(false);
  const signedIn = !!s.user;

  // A returning sign-in lands on the saved plan; someone with an account but
  // no plan yet is sent into the intake.
  const afterAuth = () => {
    if (getState().goals.length > 0) actions.goPlan();
    else actions.startOnboarding();
  };

  // The landing's accent is the brand blue — the same stroke that rises in
  // the logo. In the product, fills stay ink; out here the blue is the brand.
  const btnBlue =
    "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-control bg-accent px-4 text-support font-medium text-surface transition hover:bg-accent-hi";
  const btnBlueLg =
    "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-control bg-accent px-7 text-sm font-medium text-surface transition hover:bg-accent-hi";

  const container = "mx-auto max-w-page px-4 sm:px-6";
  const eyebrow = "text-eyebrow uppercase text-accent";

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className={`${container} flex h-14 items-center justify-between`}>
          <Logo />
          {signedIn ? (
            <button className={btnBlue} onClick={afterAuth}>
              Go to my plan
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button className={`${btnGhost} border-transparent px-3.5 py-2`} onClick={() => setShowAuth(true)}>
                Login
              </button>
              <button className={btnBlue} onClick={actions.startOnboarding}>
                Join the waitlist
              </button>
            </div>
          )}
        </div>
      </header>

      {showAuth && <AuthSheet initialMode="login" onClose={() => setShowAuth(false)} onAuthed={afterAuth} />}

      {/* Hero: warm beige paper, ruled with blue ink, one column, and the
          product's own rising lines. */}
      <section className="paper-grid border-b border-line">
        <div className={`${container} py-14 sm:py-20`}>
          <div className="max-w-3xl">
            <span className={eyebrow}>Wealth, minus the noise</span>
            <h1 className="mt-4 text-3xl font-medium leading-[1.06] tracking-[-0.025em] text-text sm:text-5xl">
              We won't let you go broke.
            </h1>
            <p className="mt-5 max-w-xl text-body text-text-2">
              Financial planning &amp; wealth management for the Bharat that has goals to reach, but no one to plan
              them with.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {signedIn ? (
                <button className={btnBlueLg} onClick={afterAuth}>
                  Go to my plan
                </button>
              ) : (
                <>
                  <button className={btnBlueLg} onClick={actions.startOnboarding}>
                    Join the waitlist
                  </button>
                  <button className={`${btnGhost} h-12 bg-surface px-6`} onClick={() => setShowAuth(true)}>
                    Login
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="mt-14 sm:mt-16">
            <HeroPath />
          </div>
        </div>
      </section>

      {/* What it does: a ledger, not a brochure. Row by row, hairline by
          hairline, each entry marked with the blue index square. */}
      <section className={container}>
        <Reveal className="py-14 sm:py-20">
          <span className={eyebrow}>What it does</span>
          <div className="mt-5 border-t border-line">
            {OFFERINGS.map((o) => (
              <article key={o.title} className="grid gap-3 border-b border-line py-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10 sm:py-9">
                <h3 className="flex items-baseline gap-3 text-headline font-medium text-text">
                  <span aria-hidden className="relative top-[-2px] inline-block h-2 w-2 flex-none bg-accent" />
                  {o.title}
                </h3>
                <div className="flex max-w-xl flex-col gap-3 sm:pl-0">
                  {o.paras.map((p) => (
                    <p key={p} className="text-sm leading-relaxed text-text-2">
                      {p}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Human + AI: a plain two-column ledger. No circles, no theatre. The
          white table lifts off the warm paper on its own. */}
      <section className="border-y border-line">
        <div className={`${container} py-14 sm:py-20`}>
          <Reveal>
            <div className="text-center">
              <span className={eyebrow}>Human + AI</span>
              <h2 className="mx-auto mt-3 max-w-2xl text-xl font-medium leading-[1.15] tracking-[-0.02em] text-text sm:text-2xl">
                Your judgment, carried by numbers that never sleep.
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-3xl border border-line bg-surface sm:grid-cols-2">
              <div className="p-6 max-sm:border-b max-sm:border-line sm:border-r sm:border-line sm:p-8">
                <span className="text-support font-medium text-text">Human judgment</span>
                <ul className="mt-3">
                  {HUMAN_ROWS.map((r) => (
                    <li key={r} className="border-b border-line py-3 text-sm text-text-2 last:border-b-0">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-6 sm:p-8">
                <span className="text-support font-medium text-text">NoBroke AI</span>
                <ul className="mt-3">
                  {AI_ROWS.map((r) => (
                    <li key={r} className="border-b border-line py-3 text-sm text-text-2 last:border-b-0">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-5 text-center text-support text-text-2">
              Where the two meet, we call it{" "}
              <span className="inline-flex items-baseline gap-1.5 font-medium text-text">
                <span aria-hidden className="relative top-[-1px] inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Goal Intelligence
              </span>
              .
            </p>
          </Reveal>
        </div>
      </section>

      <section className={container}>
        <Reveal className="py-14 sm:py-20">
          <div className="text-center">
            <span className={eyebrow}>Our philosophy</span>
            <h2 className="mt-3 text-xl font-medium tracking-[-0.02em] text-text sm:text-2xl">
              We plan in lifetimes, not market cycles.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {LAYERS.map((l, idx) => (
              <div key={l.title} className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="paper-grid flex h-44 items-center justify-center border-b border-line">{l.art}</div>
                <div className="p-5">
                  <span className="num text-index uppercase tracking-[0.13em] text-accent">Layer {idx + 1}</span>
                  <h3 className="mt-2 text-section font-medium">{l.title}</h3>
                  <p className="mt-2 text-support text-text-2">{l.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="pricing" className={container}>
        <Reveal className="border-t border-line py-14 sm:py-20">
          <div className="text-center">
            <span className={eyebrow}>Pricing</span>
            <h2 className="mt-3 text-xl font-medium tracking-[-0.02em] text-text sm:text-2xl">
              Two tiers. One promise.
            </h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative flex flex-col rounded-card border bg-surface p-5 ${
                  t.popular ? "border-accent" : "border-line"
                }`}
              >
                {t.popular && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-accent px-2.5 py-0.5 text-index font-medium uppercase tracking-wide text-surface">
                    Most chosen
                  </span>
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-section font-medium">{t.name}</h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-index uppercase tracking-wide text-text-2">
                    {t.gate}
                  </span>
                </div>
                <p className="mt-0.5 text-caption text-text-2">{t.tagline}</p>
                <p className="num mt-4 text-2xl font-medium">
                  {t.price}
                  {t.period && <span className="text-support font-normal text-text-2">{t.period}</span>}
                </p>
                {t.annual && <p className="num mt-0.5 text-caption text-text-2">{t.annual}</p>}
                <ul className="mt-4 flex-1 space-y-2">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2 text-support text-text-2">
                      <span aria-hidden className="relative top-[7px] inline-block h-1 w-1 flex-none rounded-full bg-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-control border border-line text-support text-text-2">
                  Early access soon
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* The one deep moment: brand navy on ruled paper, never black. */}
      <section className="paper-grid-deep">
        <div className={`${container} py-16 text-center sm:py-24`}>
          <Reveal>
            <h2 className="text-xl font-medium tracking-[-0.02em] text-on-band sm:text-2xl">
              Start with what you have.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-support text-on-band-2">
              Five short sections. A plan that shows its work.
            </p>
            <button className={`${btnBlueLg} mt-8 px-8`} onClick={actions.startOnboarding}>
              Start now
            </button>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className={`${container} py-12`}>
          <div className="grid gap-10 sm:grid-cols-[1fr_auto_auto] sm:gap-20">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-caption text-text-2">Wealth, minus the noise. Built in Bharat.</p>
            </div>
            <div>
              <span className="text-eyebrow uppercase text-text-3">Product</span>
              <ul className="mt-3 space-y-2 text-support">
                <li>
                  <button onClick={actions.startOnboarding} className="text-text-2 transition hover:text-text">
                    Start
                  </button>
                </li>
                <li>
                  <a href="#pricing" className="text-text-2 transition hover:text-text">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <span className="text-eyebrow uppercase text-text-3">About</span>
              <ul className="mt-3 space-y-2 text-support">
                <li className="text-text-2">Parv Modi · Founder</li>
                {FOUNDER_LINKEDIN && (
                  <li>
                    <a
                      href={FOUNDER_LINKEDIN}
                      target="_blank"
                      rel="noreferrer"
                      className="text-text-2 transition hover:text-text"
                    >
                      LinkedIn
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-line pt-6">
            <p className="max-w-2xl text-caption text-text-2">
              NoBroke is an early prototype and is not a SEBI-registered investment adviser. Projections are
              illustrative, use simplified assumptions, and are not investment advice.
            </p>
          </div>
        </div>
      </footer>

      <SupportPill />
    </div>
  );
}
