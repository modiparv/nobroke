import { actions } from "../store";
import { btnGhost, btnPrimary } from "../ui";
import Logo from "./Logo";

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

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 bg-bg/40">
        <div className="mx-auto flex h-14 max-w-page items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <button className={`${btnGhost} px-3.5 py-2`} onClick={actions.startDemo}>
              See the demo
            </button>
            <button className={`${btnPrimary} px-3.5 py-2`} onClick={actions.startOnboarding}>
              Start
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-page px-4 sm:px-6">
        <section className="max-w-3xl py-20 sm:py-28">
          <span className="text-eyebrow uppercase text-text-3">Wealth, minus the noise</span>
          <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            We won't let you go broke.
          </h1>
          <p className="mt-5 max-w-xl text-body text-text-2 sm:text-base">
            Track everything you own, plan every goal, and grow it all in one simple portfolio.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <button className={btnPrimary} onClick={actions.startOnboarding}>
              Start free
            </button>
            <button className={btnGhost} onClick={actions.startDemo}>
              See the demo
            </button>
          </div>
          <p className="mt-5 text-caption text-text-3">2-minute setup · No jargon · Cancel anytime</p>
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

        <section className="py-14 sm:py-20">
          <div
            className="rounded-screen px-6 py-14 text-center text-white sm:py-20"
            style={{ background: "linear-gradient(135deg,#000000,#525252)" }}
          >
            <h2 className="text-2xl font-medium tracking-[-0.02em] sm:text-4xl">Start with what you have.</h2>
            <button
              className="mt-7 inline-flex items-center justify-center rounded-control bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-text-2"
              onClick={actions.startOnboarding}
            >
              Start now
            </button>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-page px-4 pb-10 sm:px-6">
        <p className="mx-auto max-w-2xl text-center text-caption text-text-3">
          NoBroke is an early prototype. Projections are illustrative, use simplified assumptions, and are not investment
          advice.
        </p>
      </footer>
    </div>
  );
}
