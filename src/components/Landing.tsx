import { actions } from "../store";
import { btnGhost, btnPrimary } from "../ui";
import Logo from "./Logo";

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line p-6">
      <span className="text-xs font-medium tracking-widest text-brand">{n}</span>
      <h3 className="mt-2 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <span className="text-2xl">{icon}</span>
      <h3 className="mt-3 text-base font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-5 py-4 sm:px-10">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#how" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:block">
            How it works
          </a>
          <button className={btnGhost} onClick={actions.startDemo}>
            Explore demo
          </button>
          <button className={btnPrimary} onClick={actions.startOnboarding}>
            Find your match
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-10">
        <section className="max-w-3xl py-16 sm:py-24">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span className="inline-block h-1.5 w-1.5 bg-brand" /> The dating agent for your money
          </span>
          <h1 className="mt-6 text-5xl font-extrabold uppercase leading-[0.88] tracking-[-0.045em] sm:text-7xl lg:text-8xl">
            Meet the goals <br className="hidden sm:block" />
            you'll fall for.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
            NoBroke gets to know you with a few honest questions, then matches you to a plan and a portfolio you'll
            actually stick with. No jargon, no forms, no judgement.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className={btnPrimary} onClick={actions.startOnboarding}>
              Find your match →
            </button>
            <button className={btnGhost} onClick={actions.startDemo}>
              Explore the demo
            </button>
          </div>
          <p className="mt-4 text-sm text-muted">Built for Gen-Z &amp; millennials · 2-minute setup · cancel anytime</p>
        </section>

        <section id="how" className="border-t border-line py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">It works like a great first date</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            <Step n="01" title="We get to know you" body="A handful of fun questions about your dreams and lifestyle. We never lead with “what's your salary.”" />
            <Step n="02" title="We find your match" body="Your answers become a goal plan and a portfolio tuned to your timeline and risk." />
            <Step n="03" title="You stay in control" body="Drag funds into your basket, track every goal, and ask NoBroke AI anything, anytime." />
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon="🧺" title="Drag-and-drop basket" body="Fill a basket with funds across stocks, bonds and gold, and watch your returns update live." />
          <Feature icon="💬" title="NoBroke AI" body="A chat that explains any money concept and tells you exactly where you stand." />
          <Feature icon="🎯" title="Goal tracking" body="Every dream (car, home, freedom) gets its own plan, target and timeline." />
          <Feature icon="🔗" title="Auto-import" body="Connect your accounts and pull in existing investments in one tap. (Coming soon.)" />
        </section>
      </main>

      <section className="mx-auto mb-14 max-w-6xl px-5 sm:px-10">
        <div className="rounded-3xl bg-brand-deep px-8 py-14 text-center text-white sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Your money deserves a great match.</h2>
          <button
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-medium text-brand-deep transition hover:bg-brand-mint"
            onClick={actions.startOnboarding}
          >
            Start now →
          </button>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 pb-12 sm:px-10">
        <p className="mx-auto max-w-2xl text-center text-xs text-muted">
          NoBroke is an early prototype. Projections are illustrative, use simplified assumptions, and are not investment
          advice.
        </p>
      </footer>
    </div>
  );
}
