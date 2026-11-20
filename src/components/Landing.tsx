import { useEffect, useMemo, useRef, useState } from "react";
import { formatINR, formatPct } from "../lib/format";
import { HERO_EXAMPLES, heroExampleFigures, heroLabel, heroLines, type HeroExample } from "../lib/heroExample";
import { actions, getState, useStore } from "../store";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";
import SupportPill from "./SupportPill";

/**
 * Landing: ruled paper from top to bottom. First the promise and one worked
 * example, drawn the way the product draws a plan. Below that, the page the
 * product has always had: what it does, who does what between the person and
 * the engine, how a plan is layered, and one more way in. Every claim is
 * scoped to what the product does today.
 */

const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/parv-modi-3008p/";

/** The goals chart's own colours, in draw order. */
const LINE_COLOURS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

// Main buttons are the one blue (ui.ts btnPrimary), sized here for the page:
// compact in the header, large in the hero.
const mainButton =
  "inline-flex items-center justify-center whitespace-nowrap rounded-control bg-primary font-medium text-on-primary transition hover:bg-primary-hi active:opacity-90";
const quietButton =
  "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-control px-3 text-support font-medium text-text transition hover:bg-surface";

const container = "mx-auto max-w-page px-4 sm:px-6";
// One pair of columns down the whole page: words on the left, the thing
// itself on the right.
const columns = "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16";

// One sentence per row: the page is scanned, not read.
const OFFERINGS = [
  { title: "See everything you own", text: "Cash, mutual funds, FDs, gold, EPF. One clean view of your wealth, today." },
  {
    title: "A plan built from real numbers",
    text: "Income, spending, what you hold, your goals. Every answer shapes the plan, and the plan shows its work.",
  },
  { title: "One portfolio funds every goal", text: "One mix carries the house, the wedding and the retirement together. It is yours to change." },
  { title: "Ask. It runs the numbers.", text: "Change the plan in plain words and every number recomputes on the spot." },
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
  "Shows what each mix does to every goal",
  "Answers from your plan, instantly",
];

/** Line art for the layer cards: quiet hairlines with the blue doing only
 *  the load-bearing stroke, drawn from tokens. The words inside the drawings
 *  are part of the picture, so they are hidden from screen readers. */
const LAYERS = [
  {
    title: "Protect",
    body: "A cushion check first: if cash covers under three months of expenses, the plan says so. Risk is read from your answers, then handed to you.",
    art: (
      <div className="relative" aria-hidden>
        <div className="absolute -bottom-4 left-1/2 h-10 w-40 -translate-x-1/2 rounded-xl border border-line bg-surface" />
        <div className="absolute -bottom-2 left-1/2 h-10 w-44 -translate-x-1/2 rounded-xl border border-line bg-surface" />
        <div className="relative flex h-11 w-48 items-center justify-center gap-2 rounded-xl border border-line-2 bg-surface">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--accent-text))" strokeWidth="1.6">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          </svg>
          <span className="text-support font-medium text-text-2">Safety net</span>
        </div>
      </div>
    ),
  },
  {
    title: "Plan",
    body: "Every goal gets a target in today's money, a date, and the monthly it truly needs. Inflation is priced in.",
    art: (
      <div className="flex flex-col items-center gap-1" aria-hidden>
        <span className="text-support font-medium text-text-2">Goals</span>
        <svg viewBox="0 0 200 78" className="w-44 max-w-full text-text-2">
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
    body: "One mix carries every goal. Projections show the arithmetic, gap included.",
    art: (
      <svg viewBox="0 0 220 120" className="w-52 max-w-full" aria-hidden>
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

// The lower sections' two text styles: a small label in the page's blue ink,
// and the line under it.
const sectionMark = "text-support font-medium text-accent";
const sectionTitle = "text-balance text-2xl font-medium leading-[1.15] tracking-[-0.02em] text-text sm:text-3xl";
const footerLink =
  "inline-flex h-11 items-center text-text-2 underline-offset-4 transition hover:text-text hover:underline";

/**
 * Follows `target`, easing from the numbers on screen to the new ones. It
 * only moves when the target changes, which here means the person picked
 * the other example. People who ask for less motion get the new numbers at
 * once.
 */
function useEased(target: number[], ms = 420): number[] {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    const still =
      from === target ||
      from.length !== target.length ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      current.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = t === 1 ? target : target.map((v, i) => from[i] + (v - from[i]) * eased);
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

/**
 * The worked example. One monthly amount, a line for each goal that ends at
 * the goal's own year, and the sum underneath: what goes in, what growth
 * adds, what it comes to. Every number is computed in lib/heroExample by the
 * engine's own projection.
 */
function Example() {
  const [id, setId] = useState<HeroExample["id"]>(HERO_EXAMPLES[0].id);
  const example = HERO_EXAMPLES.find((e) => e.id === id) ?? HERO_EXAMPLES[0];
  const startYear = useMemo(() => new Date().getFullYear(), []);
  const lines = useMemo(() => heroLines(example.goals, startYear), [example, startYear]);
  const figures = heroExampleFigures(example, startYear);

  // The drawing as one flat list of numbers, so it can ease as a whole.
  const drawn = useEased(useMemo(() => lines.flatMap((l) => l.points.flat()), [lines]));
  const perLine = drawn.length / lines.length;
  const shapes = lines.map((line, i) => {
    const flat = drawn.slice(i * perLine, (i + 1) * perLine);
    const points: string[] = [];
    for (let k = 0; k < flat.length; k += 2) points.push(`${(flat[k] * 100).toFixed(2)},${((1 - flat[k + 1]) * 100).toFixed(2)}`);
    return { ...line, colour: LINE_COLOURS[i % LINE_COLOURS.length], path: points.join(" "), x: flat[flat.length - 2], y: flat[flat.length - 1] };
  });

  return (
    <section aria-label="An example plan">
      <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-x-6">
        <span id="example-label" className="block text-support text-text-2">
          Example
        </span>
        <div role="radiogroup" aria-labelledby="example-label" className="flex flex-col sm:flex-row sm:gap-7">
          {HERO_EXAMPLES.map((e) => (
            <label key={e.id} className="group flex h-11 cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="hero-example"
                className="peer sr-only"
                checked={e.id === id}
                onChange={() => setId(e.id)}
              />
              {/* The mark: an ink dot in a ring when chosen, an empty ring when not. */}
              <span
                aria-hidden
                className="h-5 w-5 flex-none rounded-full border-2 border-text-3 bg-surface shadow-[inset_0_0_0_4px_rgb(var(--surface))] transition-colors group-hover:border-text peer-checked:border-text peer-checked:bg-text peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text"
              />
              <span className="whitespace-nowrap text-body font-medium text-text-2 transition-colors group-hover:text-text peer-checked:text-text">
                {heroLabel(e)}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* The drawing. Lines stretch with the box; circles and labels are
          placed over them in real text sizes, so a 360px phone reads the
          same words at the same size as a desktop. */}
      <div
        role="img"
        aria-label={`One monthly amount, a line for each goal: ${lines.map((l) => `${l.name} by ${l.year}`).join(", ")}.`}
        className="mt-3 border-b border-line-2 pt-12"
      >
        <div className="relative mr-2 h-[11.5rem] sm:h-[14rem]">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {/* Furthest goal first, so the nearer lines sit on top where they share a start. */}
            {[...shapes].reverse().map((s) => (
              <polyline
                key={s.colour}
                points={s.path}
                fill="none"
                stroke={s.colour}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {shapes.map((s) => (
            <span
              key={s.colour}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg"
              style={{ left: `${s.x * 100}%`, top: `${(1 - s.y) * 100}%`, borderColor: s.colour }}
            />
          ))}
          {shapes.map((s) => (
            <div
              key={s.colour}
              className="absolute left-0 whitespace-nowrap text-right"
              style={{ width: `calc(${s.x * 100}% + 0.5rem)`, bottom: `calc(${s.y * 100}% + 0.75rem)` }}
            >
              <div className="text-support font-medium text-text">{s.name}</div>
              <div className="num text-support text-text-2">{s.year}</div>
            </div>
          ))}
        </div>
      </div>
      {/* The picture shows dates, not a promise that the amount is enough. */}
      <p className="mt-2 text-support text-text-2">The lines show when each goal is due, not that this amount is enough for it.</p>

      {/* The sum, set as a sum: two lines and a rule above the total. */}
      <dl className="mt-3">
        <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
          <dt className="text-support text-text-2">Put in over {figures.years} years</dt>
          <dd className="num whitespace-nowrap text-body font-medium text-text">{formatINR(figures.putIn)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-support text-text-2">Growth, assumed at {formatPct(figures.rate)} a year</dt>
          <dd className="num whitespace-nowrap text-body font-medium text-text">{formatINR(figures.growth)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-text pt-3">
          <dt className="text-body font-medium text-text">Total by {figures.endYear}, if nothing is spent</dt>
          <dd className="num whitespace-nowrap text-headline font-medium text-text">{formatINR(figures.total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-support text-text-2">Not adjusted for rising prices.</p>
    </section>
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
  // A plan already saved in this browser is opened, never started over: the
  // intake clears the answers it is about to ask for again.
  const hasPlan = s.goals.length > 0;
  const start = hasPlan ? actions.goPlan : signedIn ? afterAuth : actions.startOnboarding;
  const startLabel = hasPlan ? "Go to my plan" : "Start your plan";

  // One main button in view at a time: the header carries it only while the
  // hero's own button and the closing one are both out of view. The footer
  // counts with the closing button: on a short phone it is taller than the
  // screen, and the header's button must not come back under it.
  const heroButton = useRef<HTMLButtonElement | null>(null);
  const closingButton = useRef<HTMLButtonElement | null>(null);
  const footer = useRef<HTMLElement | null>(null);
  const [ownButtonInView, setOwnButtonInView] = useState(true);
  // The header's button is never taken away from under a keyboard's focus.
  const [headerButtonFocused, setHeaderButtonFocused] = useState(false);
  useEffect(() => {
    const watched = [heroButton.current, closingButton.current, footer.current].filter((el): el is HTMLElement => el !== null);
    if (watched.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      setOwnButtonInView(false);
      return;
    }
    const inView = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target);
          else inView.delete(entry.target);
        }
        setOwnButtonInView(inView.size > 0);
      },
      { rootMargin: "-56px 0px 0px 0px" },
    );
    for (const el of watched) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className={`${container} flex h-14 items-center justify-between`}>
          <Logo />
          <div className="flex items-center gap-1">
            {(!ownButtonInView || headerButtonFocused) && (
              <button
                className={`${mainButton} h-11 px-4 text-support`}
                onClick={start}
                onFocus={() => setHeaderButtonFocused(true)}
                onBlur={() => setHeaderButtonFocused(false)}
              >
                {startLabel}
              </button>
            )}
            {!signedIn && (
              <button className={quietButton} onClick={() => setShowAuth(true)}>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {showAuth && <AuthSheet initialMode="login" onClose={() => setShowAuth(false)} onAuthed={afterAuth} />}

      <main>
        {/* The sheet: warm paper ruled in blue ink, the promise on the left
            and the worked example on the right. */}
        <section className="paper-grid border-b border-line">
          <div className={`${container} grid gap-10 py-10 sm:py-14 lg:items-center lg:py-20 ${columns}`}>
            <div>
              <h1 className="text-balance text-[2.5rem] font-medium leading-[1.05] tracking-[-0.03em] text-text sm:text-[3rem] lg:text-[3.75rem] xl:text-[4.5rem]">
                We won't let you go broke.
              </h1>
              <p className="mt-5 max-w-[30rem] text-balance text-prose text-text-2">
                Money planning for the Bharat that has goals to reach, but no one to plan them with.
              </p>
              <button
                ref={heroButton}
                className={`${mainButton} mt-7 h-[3.25rem] w-full px-8 text-body sm:w-auto`}
                onClick={start}
              >
                {startLabel}
              </button>
            </div>
            <Example />
          </div>
        </section>

        {/* What it does: a ledger, not a brochure. Row by row, hairline by
            hairline, each entry marked with the blue index square. */}
        <section aria-labelledby="what-it-does" className={`${container} py-14 sm:py-20`}>
          <h2 id="what-it-does" className={sectionMark}>
            What it does
          </h2>
          <div className="mt-5 border-t border-line">
            {OFFERINGS.map((o) => (
              <article
                key={o.title}
                className="grid gap-3 border-b border-line py-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10 sm:py-9"
              >
                <h3 className="flex items-baseline gap-3 text-headline font-medium text-text">
                  <span aria-hidden className="relative top-[-2px] inline-block h-2 w-2 flex-none bg-accent" />
                  {o.title}
                </h3>
                <p className="max-w-xl text-prose text-text-2">{o.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Human + AI: a plain two-column ledger. No circles, no theatre. The
            white table lifts off the warm paper on its own. */}
        <section aria-labelledby="human-and-ai" className="border-y border-line">
          <div className={`${container} py-14 sm:py-20`}>
            <div className="text-center">
              <p className={sectionMark}>Human + AI</p>
              <h2 id="human-and-ai" className={`mx-auto mt-3 max-w-2xl ${sectionTitle}`}>
                Your judgment, carried by numbers that never sleep.
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-3xl border border-line bg-surface sm:grid-cols-2">
              <div className="p-6 max-sm:border-b max-sm:border-line sm:border-r sm:border-line sm:p-8">
                <h3 className="text-support font-medium text-text">Human judgment</h3>
                <ul className="mt-3">
                  {HUMAN_ROWS.map((r) => (
                    <li key={r} className="border-b border-line py-3 text-prose text-text-2 last:border-b-0">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-6 sm:p-8">
                <h3 className="text-support font-medium text-text">NoBroke AI</h3>
                <ul className="mt-3">
                  {AI_ROWS.map((r) => (
                    <li key={r} className="border-b border-line py-3 text-prose text-text-2 last:border-b-0">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-5 text-center text-support text-text-2">
              Where the two meet, we call it{" "}
              <span className="ml-0.5 inline-flex items-baseline gap-1.5 whitespace-nowrap font-medium text-text">
                <span aria-hidden className="relative top-[-1px] inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Goal Intelligence
              </span>
              .
            </p>
          </div>
        </section>

        <section aria-labelledby="our-philosophy" className={`${container} py-14 sm:py-20`}>
          <div className="text-center">
            <p className={sectionMark}>Our philosophy</p>
            <h2 id="our-philosophy" className={`mt-3 ${sectionTitle}`}>
              We plan in lifetimes, not market cycles.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {LAYERS.map((l, idx) => (
              <div key={l.title} className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="paper-grid flex h-44 items-center justify-center border-b border-line">{l.art}</div>
                <div className="p-5">
                  <p className="num text-support font-medium text-accent">Layer {idx + 1}</p>
                  <h3 className="mt-2 text-section font-medium text-text">{l.title}</h3>
                  <p className="mt-2 text-body text-text-2">{l.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The one deep moment: brand navy on ruled paper, never black. */}
        <section aria-labelledby="start-with-what-you-have" className="paper-grid-deep">
          <div className={`${container} py-16 text-center sm:py-24`}>
            <h2 id="start-with-what-you-have" className="text-balance text-2xl font-medium tracking-[-0.02em] text-on-band sm:text-3xl">
              Start with what you have.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-balance text-body text-on-band-2">Five short sections. A plan that shows its work.</p>
            <button
              ref={closingButton}
              className={`${mainButton} mt-8 h-[3.25rem] px-8 text-body focus-visible:outline-on-band`}
              onClick={start}
            >
              {hasPlan ? startLabel : "Start now"}
            </button>
          </div>
        </section>
      </main>

      <footer ref={footer}>
        <div className={`${container} py-12`}>
          <div className="grid gap-8 sm:grid-cols-[1fr_auto_auto] sm:gap-20">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-support text-text-2">Wealth, minus the noise. Built in Bharat.</p>
            </div>
            <div>
              <h2 className="text-support font-medium text-text">Product</h2>
              <ul className="mt-1 text-support">
                <li>
                  <button type="button" onClick={start} className={footerLink}>
                    {hasPlan ? "My plan" : "Start"}
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-support font-medium text-text">About</h2>
              <ul className="mt-1 text-support">
                <li className="flex h-11 items-center text-text-2">Parv Modi · Founder</li>
                <li>
                  <a
                    href={FOUNDER_LINKEDIN}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Parv Modi on LinkedIn, opens in a new tab"
                    className={footerLink}
                  >
                    LinkedIn
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-line pt-6">
            <p className="max-w-2xl text-support text-text-2">
              NoBroke is an early prototype. It is not a SEBI-registered investment adviser and does not give
              investment advice. Projections are illustrative and use simplified assumptions.
            </p>
          </div>
        </div>
      </footer>

      <SupportPill />
    </div>
  );
}
