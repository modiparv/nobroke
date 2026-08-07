import { useState } from "react";
import { actions, getState, useStore } from "../store";
import { btnGhost, btnPrimary } from "../ui";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";
import SupportPill from "./SupportPill";

/**
 * Landing, repositioned on the premium wealth-management idea: expert-grade
 * care, previously reserved for the wealthy, for people who are still building.
 * Dark, editorial, numbers-led, minimal copy. The wealth monitor leads because
 * it is the product's strongest honest promise (the Money tab).
 */

const FEATURES = [
  { n: "01", title: "Wealth monitor", body: "Everything you own in one place. Cash, funds, FDs, gold." },
  { n: "02", title: "Goal planning", body: "Each goal gets a target, a date and a monthly amount." },
  { n: "03", title: "One portfolio", body: "A single mix funds every goal." },
  { n: "04", title: "Copilot", body: "Ask anything. Change anything. Plain words." },
];

/**
 * Tier names walk the arc of wealth in the old stories: Arth, the foundation;
 * Akshaya, the vessel that never empties; Meru, the golden mountain.
 *
 * Pricing strategy, merged from three playbooks:
 *   wealth management  human access anchors the top; no AUM percentage, ever
 *   financial planning flat transparent fees, the fee-only model
 *   copilots           freemium with honest usage gates, not crippled tools
 * The gate that scales with seriousness is the number of goals; the top tier
 * sells the whole-life view (the Lifetime Balance Sheet, every assumption
 * inspectable) plus a named human. Early cohort keeps their price for life.
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

/**
 * The hero graphic is the product's own arithmetic, not an illustration:
 * ₹25,000 a month for 8 years at a conservative return is what the curve and
 * every number here actually compute to. The projected figure is the
 * brightest thing in the hero, which is the whole hierarchy in one card.
 */
function HeroProjection() {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase text-text-3">A goal, projected</span>
        <span className="text-caption text-text-2">Home down payment · 2034</span>
      </div>
      <p className="num mt-3 text-hero font-medium">₹37.0L</p>
      <p className="mt-0.5 text-caption text-text-2">projected by 2034, at ₹25,000 a month</p>
      <svg viewBox="0 0 320 110" className="mt-4 w-full" role="img" aria-label="Projected value curving above the amount put in">
        <path d="M0 104 C 90 96, 180 76, 320 22 L 320 110 L 0 110 Z" className="fill-accent/10" />
        <path d="M0 106 C 100 100, 210 88, 320 62" className="stroke-text-2" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
        <path d="M0 104 C 90 96, 180 76, 320 22" className="stroke-accent" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="320" cy="22" r="4" className="fill-accent" />
      </svg>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
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

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 bg-bg/40">
        <div className="mx-auto flex h-14 max-w-page items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <a
              href="#pricing"
              className="hidden items-center px-3 text-support text-text-2 transition hover:text-text sm:inline-flex"
            >
              Pricing
            </a>
            {signedIn ? (
              <button className={`${btnPrimary} px-3.5 py-2`} onClick={afterAuth}>
                Go to my plan
              </button>
            ) : (
              <>
                <button className={`${btnGhost} px-3.5 py-2`} onClick={() => setShowAuth(true)}>
                  Sign in
                </button>
                <button className={`${btnPrimary} px-3.5 py-2`} onClick={actions.startOnboarding}>
                  Start
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {showAuth && <AuthSheet initialMode="login" onClose={() => setShowAuth(false)} onAuthed={afterAuth} />}

      <main className="mx-auto max-w-page px-4 sm:px-6">
        <section className="grid items-center gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_400px] lg:gap-16">
          <div className="max-w-3xl">
          <span className="text-eyebrow uppercase text-text-3">Wealth, minus the noise</span>
          <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.025em] text-display sm:text-6xl">
            We won't let you go broke.
          </h1>
          <p className="mt-5 max-w-xl text-body text-text-2 sm:text-base">
            Track everything you own, plan every goal, and grow it all in one simple portfolio.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {signedIn ? (
              <button className={btnPrimary} onClick={afterAuth}>
                Go to my plan
              </button>
            ) : (
              <>
                <button className={btnPrimary} onClick={actions.startOnboarding}>
                  Start free
                </button>
                <button className={btnGhost} onClick={() => setShowAuth(true)}>
                  Sign in
                </button>
              </>
            )}
          </div>
          <p className="mt-5 text-caption text-text-2">2-minute setup · No jargon · Cancel anytime</p>
          </div>
          <HeroProjection />
        </section>

        <section className="border-t border-line">
          <ul className="divide-y divide-line">
            {FEATURES.map((f) => (
              <li key={f.n} className="-mx-3 flex items-baseline gap-5 rounded-card px-3 py-6 transition-colors hover:bg-surface/60 sm:gap-8 sm:py-8">
                <span className="num text-index tracking-[0.06em] text-text-3">{f.n}</span>
                <div className="grid flex-1 gap-1 sm:grid-cols-[240px_1fr] sm:gap-8">
                  <h3 className="text-section font-medium">{f.title}</h3>
                  <p className="text-body text-text-2">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* The division of labour, stated plainly: the person stays pilot in
            command, the product is the instrument panel. Monochrome on purpose
            — this is a promise, not a feature, so nothing here glows. */}
        <section className="border-t border-line py-14 sm:py-20">
          <span className="text-eyebrow uppercase text-text-3">Pilot in command</span>
          <h2 className="mt-3 max-w-xl text-2xl font-medium tracking-[-0.02em] text-display sm:text-3xl">
            Your judgment, carried by numbers that never sleep.
          </h2>
          <div className="mt-8 max-w-3xl">
            <div className="grid grid-cols-2 gap-6 border-b border-line pb-3 sm:gap-10">
              <span className="text-eyebrow uppercase text-text-3">You</span>
              <span className="text-eyebrow uppercase text-text-3">NoBroke</span>
            </div>
            {(
              [
                ["Decide what actually matters", "Watches every holding, every day"],
                ["Know what you can live with", "Finds the fees and tax you leak"],
                ["Choose when to act", "Runs the numbers before you commit"],
                ["Hold the context no statement shows", "Remembers every decision, and why"],
              ] as const
            ).map(([you, us]) => (
              <div key={you} className="grid grid-cols-2 gap-6 border-b border-line py-4 sm:gap-10">
                <p className="text-body text-display">{you}</p>
                <p className="text-body text-display">{us}</p>
              </div>
            ))}
            <p className="pt-6 text-center text-section font-medium">A plan you understand.</p>
          </div>
        </section>

        <section id="pricing" className="border-t border-line py-14 sm:py-20">
          <span className="text-eyebrow uppercase text-text-3">Pricing</span>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-display sm:text-3xl">Three tiers. One promise.</h2>
          <p className="mt-3 max-w-2xl text-body text-text-2">
            No percentage of your assets. No commissions from funds. A flat fee for judgement, so our incentive is your
            outcome, nothing else.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative flex flex-col rounded-card border bg-surface p-5 ${
                  t.popular ? "border-text" : "border-line"
                }`}
              >
                {t.popular && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-accent-fill px-2.5 py-0.5 text-index font-medium uppercase tracking-wide text-on-accent">
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
                      <span aria-hidden className="text-text-3">·</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {t.cta === "start" ? (
                  <button className={`${btnPrimary} mt-5 w-full`} onClick={actions.startOnboarding}>
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
          <p className="mt-4 text-caption text-text-2">
            Indicative pricing for early access. Founding members keep their price for life.
          </p>
        </section>

        <section className="py-14 sm:py-20">
          <div className="hero-band rounded-screen px-6 py-14 text-center text-on-band sm:py-20">
            <h2 className="text-2xl font-medium tracking-[-0.02em] sm:text-4xl">Start with what you have.</h2>
            <button
              className="mt-7 inline-flex items-center justify-center rounded-control bg-accent-fill px-6 py-3 text-sm font-medium text-on-accent transition hover:bg-accent-fill-hi"
              onClick={actions.startOnboarding}
            >
              Start now
            </button>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-page px-4 pb-10 sm:px-6">
        <p className="mx-auto max-w-2xl text-center text-caption text-text-2">
          NoBroke is an early prototype. Projections are illustrative, use simplified assumptions, and are not investment
          advice.
        </p>
      </footer>

      <SupportPill />
    </div>
  );
}
