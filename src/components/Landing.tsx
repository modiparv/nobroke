import { useEffect, useRef, useState, type ReactNode } from "react";
import { actions, getState, useStore } from "../store";
import { btnGhost } from "../ui";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";
import SupportPill from "./SupportPill";

/**
 * Landing, in the Decade register: near-monochrome, serif display set dimmer
 * than the numbers, black night sections that stay black in both themes, and
 * copy in short plain sentences. Every claim is scoped to what the product
 * does today.
 */

/** Set to the founder's LinkedIn URL to light up the footer link. */
const FOUNDER_LINKEDIN = "";

const OFFERINGS = [
  {
    n: "01",
    title: "See everything you own",
    paras: [
      "Cash, mutual funds, FDs, gold, EPF. One clean view of your wealth, in rupees, today.",
      "Each holding takes seconds to add, and the totals update live. No accounts to link. No money to move.",
    ],
  },
  {
    n: "02",
    title: "A plan built from real numbers",
    paras: [
      "Five short sections: income, spending, what you hold, your context, your goals. Every answer shapes the plan, so none can be skipped.",
      "The plan shows its work. Every assumption inspectable, every projection explained.",
    ],
  },
  {
    n: "03",
    title: "One portfolio funds every goal",
    paras: [
      "Not a bucket per dream. A single mix, matched to the risk you can actually live with, carries the house, the wedding and the retirement together.",
      "Each goal gets a target, a date, and the monthly amount it truly needs.",
    ],
  },
  {
    n: "04",
    title: "Ask. It runs the numbers.",
    paras: [
      "Change the plan in plain words: the monthly, a target, a horizon. It happens on the spot, every number recomputed.",
      "Anything else you ask is answered against the goal in front of you: its target, monthly, projection and mix.",
    ],
  },
];

/**
 * Tier names walk the arc of wealth in the old stories: Arth, the foundation;
 * Akshaya, the vessel that never empties; Meru, the golden mountain. The gate
 * that scales with seriousness is the number of goals; the top tier sells the
 * whole-life view plus a named human.
 */
const TIERS = [
  {
    name: "Arth",
    tagline: "The foundation",
    price: "Free",
    period: "",
    annual: "",
    gate: "2 goals",
    popular: false,
    features: [
      "Full planning for 2 goals",
      "One portfolio, live fund universe",
      "NoBroke Score on every fund",
      "Risk profile and copilot essentials",
    ],
    cta: "start" as const,
  },
  {
    name: "Akshaya",
    tagline: "The vessel that never empties",
    price: "₹299",
    period: "/month",
    annual: "₹2,999 a year (2 months free)",
    gate: "Unlimited goals",
    popular: true,
    features: [
      "Everything in Arth, unlimited goals",
      "Statement import and reconciliation",
      "Portfolio x-ray and deeper nudges",
      "Priority copilot",
    ],
    cta: "soon" as const,
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
    cta: "soon" as const,
  },
];

/** Stacked safety-net chip, goal arc, rising line: quiet monochrome line art
 *  for the layer cards, drawn from tokens so both themes carry it. */
const LAYERS = [
  {
    title: "Protect",
    body: "A cushion check before anything else: if cash covers less than three months of expenses, the plan says so plainly. Risk appetite is read from your answers, then handed to you. One slide to change.",
    art: (
      <div className="relative" aria-hidden>
        <div className="absolute -bottom-4 left-1/2 h-10 w-40 -translate-x-1/2 rounded-xl border border-line-2 bg-surface" />
        <div className="absolute -bottom-2 left-1/2 h-10 w-44 -translate-x-1/2 rounded-xl border border-line-2 bg-surface" />
        <div className="relative flex h-11 w-48 items-center justify-center gap-2 rounded-xl border border-line-2 bg-surface">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-text-2">
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
          <g fill="rgb(var(--surface))" stroke="rgb(var(--text-3))">
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
        <g stroke="rgb(var(--line-2))" strokeWidth="1">
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
          stroke="rgb(var(--text-2))"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="210" cy="18" r="3.5" fill="rgb(var(--text))" />
      </svg>
    ),
  },
];

/** The division of labour, in Decade's two-list form. The AI column states
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
 * The hero graphic is the product's own arithmetic, not an illustration:
 * ₹25,000 a month for 8 years at a conservative return is what the curve and
 * every number here actually compute to. The projected figure is the
 * brightest thing in the hero, which is the whole hierarchy in one card.
 */
function HeroProjection() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase text-text-3">A goal, projected</span>
        <span className="text-caption text-text-2">Home down payment · 2034</span>
      </div>
      <p className="num mt-3 text-hero font-medium">₹37.0L</p>
      <p className="mt-0.5 text-caption text-text-2">
        projected by 2034, at <span className="num">₹25,000</span> a month
      </p>
      <svg viewBox="0 0 320 110" className="mt-4 w-full" role="img" aria-label="Projected value curving above the amount put in">
        <path d="M0 104 C 90 96, 180 76, 320 22 L 320 110 L 0 110 Z" className="fill-accent/10" />
        <path d="M0 106 C 100 100, 210 88, 320 62" className="stroke-text-2" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
        <path d="M0 104 C 90 96, 180 76, 320 22" className="stroke-accent" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="320" cy="22" r="4" className="fill-accent" />
      </svg>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-text-3/30 pt-3">
        <span className="text-caption text-text-2">
          Put in <span className="num font-medium text-text">₹24.0L</span>
        </span>
        <span className="text-caption text-text-2">
          Growth <span className="num font-medium text-text">₹13.0L</span>
        </span>
        <span className="text-index uppercase text-text-3">Illustrative</span>
      </div>
    </div>
  );
}

/**
 * One exchange the command layer genuinely parses ("by 2032" → setYears),
 * with the product's verbatim reply. The footer states what recomputes.
 */
function CopilotExchange() {
  return (
    <div className="mt-6 w-full max-w-md rounded-card border border-line bg-surface p-4">
      <p className="text-caption text-text-2">You</p>
      <p className="mt-1 text-row">
        First home by <span className="num">2032</span>, not <span className="num">2036</span>.
      </p>
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-caption text-text-2">NoBroke</p>
        <p className="mt-1 text-row">
          Set First Home to <span className="num font-medium">6 years</span> away.
        </p>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-caption text-text-2">
        The plan recomputes on the spot: the monthly each goal needs, the projection, the gap.
      </p>
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

  // Decade palette: interactive elements are ink, not brand blue. Ink inverts
  // cleanly per theme; night sections get the fixed warm-white button.
  const btnInk =
    "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-control bg-text px-4 text-support font-medium text-bg transition hover:opacity-85";
  const btnInkLg =
    "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-control bg-text px-7 text-sm font-medium text-bg transition hover:opacity-85";

  const container = "mx-auto max-w-page px-4 sm:px-6";

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-3 z-30 px-3 sm:px-4">
        <div className="mx-auto flex h-14 max-w-page items-center justify-between rounded-full border border-line-2 bg-sidebar px-4 sm:px-5">
          <Logo />
          {signedIn ? (
            <button className={btnInk} onClick={afterAuth}>
              Go to my plan
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button className={`${btnGhost} px-3.5 py-2`} onClick={() => setShowAuth(true)}>
                Login
              </button>
              <button className={btnInk} onClick={actions.startOnboarding}>
                Join
              </button>
            </div>
          )}
        </div>
      </header>

      {showAuth && <AuthSheet initialMode="login" onClose={() => setShowAuth(false)} onAuthed={afterAuth} />}

      <section className={container}>
        <div className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_400px] lg:gap-16">
          <div className="max-w-3xl">
            <span className="text-eyebrow uppercase text-text-3">Wealth, in plain words</span>
            <h1 className="mt-4 font-serif text-4xl font-normal leading-[1.08] tracking-[-0.015em] text-display sm:text-5xl">
              We won't let you go broke.
            </h1>
            <p className="mt-5 max-w-xl text-body text-text-2 sm:text-base">
              Financial planning &amp; wealth management that unites the best of Human and Artificial Intelligence for
              your life's most important decisions.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {signedIn ? (
                <button className={btnInkLg} onClick={afterAuth}>
                  Go to my plan
                </button>
              ) : (
                <>
                  <button className={btnInkLg} onClick={actions.startOnboarding}>
                    Join
                  </button>
                  <button className={`${btnGhost} h-12 px-6`} onClick={() => setShowAuth(true)}>
                    Login
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="rounded-screen bg-accent-tint p-6 sm:p-8">
            <HeroProjection />
          </div>
        </div>
      </section>

      <section className={container}>
        <Reveal className="border-t border-line py-14 sm:py-20">
          <div className="grid gap-x-12 gap-y-14 sm:grid-cols-2">
            {OFFERINGS.map((o) => (
              <article key={o.n}>
                <span className="num text-support text-text-3">{o.n}</span>
                <h3 className="mt-3 font-serif text-2xl font-normal tracking-[-0.01em] text-display sm:text-3xl">
                  {o.title}
                </h3>
                <div className="mt-4 flex max-w-xl flex-col gap-3">
                  {o.paras.map((p) => (
                    <p key={p} className="text-body leading-relaxed text-text-2">
                      {p}
                    </p>
                  ))}
                </div>
                {o.n === "04" && <CopilotExchange />}
              </article>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Night section: stays near-black in both themes, like Decade's. */}
      <section className="bg-night">
        <div className={`${container} py-16 sm:py-24`}>
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-center font-serif text-3xl font-normal leading-[1.15] tracking-[-0.01em] text-on-night-2 sm:text-4xl">
              Human judgment, combined with the precision of technology.
            </h2>
            <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_360px_1fr] lg:gap-8">
              <div>
                <span className="text-support font-medium text-on-night">Human Judgment</span>
                <ul className="mt-4">
                  {HUMAN_ROWS.map((r) => (
                    <li key={r} className="border-b border-on-night-3/40 py-3.5 text-body text-on-night-2">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <svg
                viewBox="0 0 360 240"
                className="mx-auto w-full max-w-[340px]"
                role="img"
                aria-label="Two overlapping circles: human judgment and NoBroke AI, meeting in wealth intelligence"
              >
                <defs>
                  <pattern id="venn-hatch" width="5" height="8" patternUnits="userSpaceOnUse">
                    <line x1="2.5" y1="0" x2="2.5" y2="8" stroke="rgb(var(--on-night-3))" strokeWidth="1" opacity="0.6" />
                  </pattern>
                  <clipPath id="venn-left">
                    <circle cx="130" cy="120" r="104" />
                  </clipPath>
                </defs>
                <g clipPath="url(#venn-left)">
                  <circle cx="230" cy="120" r="104" fill="url(#venn-hatch)" />
                </g>
                <circle cx="130" cy="120" r="104" fill="none" stroke="rgb(var(--on-night-3))" strokeWidth="1" />
                <circle cx="230" cy="120" r="104" fill="none" stroke="rgb(var(--on-night-3))" strokeWidth="1" />
                <text x="180" y="112" textAnchor="middle" fill="rgb(var(--on-night))" fontSize="15" fontWeight="500">
                  Wealth
                </text>
                <text x="180" y="132" textAnchor="middle" fill="rgb(var(--on-night))" fontSize="15" fontWeight="500">
                  Intelligence
                </text>
              </svg>

              <div className="lg:text-right">
                <span className="text-support font-medium text-on-night">NoBroke AI</span>
                <ul className="mt-4">
                  {AI_ROWS.map((r) => (
                    <li key={r} className="border-b border-on-night-3/40 py-3.5 text-body text-on-night-2">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className={container}>
        <Reveal className="py-14 sm:py-20">
          <div className="text-center">
            <span className="text-eyebrow uppercase text-text-3">Our philosophy</span>
            <h2 className="mt-3 font-serif text-3xl font-normal tracking-[-0.01em] text-display sm:text-4xl">
              We plan in decades, not quarters.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {LAYERS.map((l, idx) => (
              <div key={l.title} className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="flex h-44 items-center justify-center border-b border-line">{l.art}</div>
                <div className="p-5">
                  <span className="num text-index uppercase tracking-[0.13em] text-text-3">Layer {idx + 1}</span>
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
            <span className="text-eyebrow uppercase text-text-3">Pricing</span>
            <h2 className="mt-3 font-serif text-3xl font-normal tracking-[-0.01em] text-display sm:text-4xl">
              Three tiers. One promise.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-body text-text-2">
              No percentage of your assets. No commissions from funds.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative flex flex-col rounded-card border bg-surface p-5 ${
                  t.popular ? "border-text" : "border-line"
                }`}
              >
                {t.popular && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-text px-2.5 py-0.5 text-index font-medium uppercase tracking-wide text-bg">
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
                      <span aria-hidden className="text-text-3">
                        ·
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {t.cta === "start" ? (
                  <button className={`${btnInk} mt-5 w-full`} onClick={actions.startOnboarding}>
                    Start free
                  </button>
                ) : (
                  <span className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-control border border-line text-support text-text-2">
                    Early access soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Closing call, on night like Decade's dark closer. */}
      <section className="bg-night">
        <div className={`${container} py-16 text-center sm:py-24`}>
          <Reveal>
            <h2 className="font-serif text-3xl font-normal tracking-[-0.01em] text-on-night sm:text-4xl">
              Start with what you have.
            </h2>
            <button
              className="mt-8 inline-flex h-12 items-center justify-center rounded-control bg-on-night px-8 text-sm font-medium text-night transition hover:opacity-85"
              onClick={actions.startOnboarding}
            >
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
              <p className="mt-3 max-w-xs text-caption text-text-2">Wealth, in plain words. Built in India.</p>
            </div>
            <div>
              <span className="text-eyebrow uppercase text-text-3">Product</span>
              <ul className="mt-3 space-y-2 text-support">
                <li>
                  <button onClick={actions.startOnboarding} className="text-text-2 transition hover:text-text">
                    Start free
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
