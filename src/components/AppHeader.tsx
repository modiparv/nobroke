import { actions, useStore } from "../store";
import Logo from "./Logo";

/**
 * App nav: logo, the Plan / Money toggle, and account actions.
 *
 * The bar is translucent: a 40% page-colour fill, no blur (backdrop-filter
 * stays banned), so content ghosts through it faintly as it scrolls.
 */
export default function AppHeader() {
  const s = useStore();

  // Near-opaque bar: content must never ghost through it over the ink band.
  // The marketing page keeps its own translucent header; up here legibility
  // beats atmosphere.
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/95">
      <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />

        {/* Segmented control: a filled track, no border, exact heights. */}
        <nav className="flex items-center gap-0.5 rounded-full bg-surface p-0.5" aria-label="Sections">
          {(["plan", "money"] as const).map((t) => (
            <button
              key={t}
              onClick={() => actions.setTab(t)}
              aria-current={s.tab === t ? "page" : undefined}
              className={`inline-flex h-7 items-center rounded-full px-3 text-support capitalize transition sm:px-3.5 ${
                s.tab === t ? "bg-accent text-on-accent" : "text-text-2 hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <button
          onClick={actions.startOnboarding}
          className="inline-flex h-8 items-center rounded-full border border-line px-3 text-support text-text transition hover:border-line-2 sm:px-3.5"
        >
          New plan
        </button>
      </div>
    </header>
  );
}
