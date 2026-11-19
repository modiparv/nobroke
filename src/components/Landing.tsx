import { useEffect, useMemo, useRef, useState } from "react";
import { formatINR, formatPct } from "../lib/format";
import { HERO_EXAMPLES, heroExampleFigures, heroLabel, heroLines, type HeroExample } from "../lib/heroExample";
import { actions, getState, useStore } from "../store";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";
import SupportPill from "./SupportPill";

/**
 * Landing: one sheet of ruled paper. The promise, one worked example drawn
 * the way the product draws a plan, and three plain facts about who is
 * behind NoBroke, what it is, and where a plan is kept. Under 150 words, so
 * every line has to be true and has to earn its place.
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
  const startLabel = hasPlan || signedIn ? "Go to my plan" : "Start your plan";

  // One main button in view at a time: the header carries it only once the
  // hero's own button has scrolled away under the header.
  const heroButton = useRef<HTMLButtonElement | null>(null);
  const [heroButtonInView, setHeroButtonInView] = useState(true);
  useEffect(() => {
    const el = heroButton.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setHeroButtonInView(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setHeroButtonInView(entry.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className={`${container} flex h-14 items-center justify-between`}>
          <Logo />
          <div className="flex items-center gap-1">
            {!heroButtonInView && (
              <button className={`${mainButton} h-11 px-4 text-support`} onClick={start}>
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
        <section className="paper-grid">
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

        {/* Three plain facts, set as a ledger on the brand navy: the question
            on the left, the answer on the right. The page's one deep band,
            left plain so nothing runs behind the reading text. */}
        <section aria-label="About NoBroke" className="bg-band">
          <div className={`${container} py-6 sm:py-10`}>
            <dl className="divide-y divide-on-band-3/40">
              <div className={`grid gap-1 py-5 lg:items-baseline ${columns}`}>
                <dt className="text-section font-medium text-on-band lg:text-headline">Founder</dt>
                <dd className="flex flex-wrap items-center gap-x-4 text-body text-on-band-2">
                  <span className="text-on-band">Parv Modi</span>
                  <a
                    href={FOUNDER_LINKEDIN}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Parv Modi on LinkedIn, opens in a new tab"
                    className="inline-flex h-11 items-center text-on-band underline decoration-on-band-3 underline-offset-4 transition hover:decoration-on-band focus-visible:outline-on-band"
                  >
                    LinkedIn
                  </a>
                </dd>
              </div>
              <div className={`grid gap-2 py-5 lg:items-baseline ${columns}`}>
                <dt className="text-section font-medium text-on-band lg:text-headline">What it is</dt>
                <dd className="max-w-[38rem] text-body text-on-band-2">
                  An early product that shows the arithmetic of your goals. It is not a SEBI-registered investment
                  adviser and does not give investment advice.
                </dd>
              </div>
              <div className={`grid gap-2 py-5 lg:items-baseline ${columns}`}>
                <dt className="text-section font-medium text-on-band lg:text-headline">Your data</dt>
                <dd className="max-w-[38rem] text-body text-on-band-2">
                  <ul className="space-y-2">
                    <li>Without an account, your plan stays in your browser.</li>
                    <li>With one, it is saved to NoBroke's database and follows you to other devices.</li>
                    <li>
                      Questions you ask NoBroke AI in your own words are sent with your plan, including goal notes and
                      holding names, to Groq, the company that runs the AI model.
                    </li>
                    <li>Passwords are stored hashed, never as typed.</li>
                    <li>NoBroke does not connect to your bank or broker and cannot move your money.</li>
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <footer>
        <div className={`${container} grid gap-6 py-10 ${columns}`}>
          <div>
            <Logo />
            <p className="mt-3 text-support text-text-2">Wealth, minus the noise. Built in Bharat.</p>
          </div>
          <p className="max-w-[38rem] text-support text-text-2">
            NoBroke is an early prototype and is not a SEBI-registered investment adviser. Projections are
            illustrative, use simplified assumptions, and are not investment advice.
          </p>
        </div>
      </footer>

      <SupportPill />
    </div>
  );
}
