import { actions, useStore } from "../store";
import Logo from "./Logo";

/**
 * App nav: logo, the Plan / Money toggle, and account actions.
 *
 * Full bleed with a single bottom rule, 56px tall. Marketing links (about,
 * pricing, contact) belong on the marketing site, not in the product (spec 8b).
 */
export default function AppHeader() {
  const s = useStore();

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-line bg-surface">
      <div className="mx-auto flex h-full max-w-page items-center justify-between gap-4 px-6">
        <Logo />

        <nav className="flex items-center gap-0.5 rounded-full border border-line p-0.5" aria-label="Sections">
          {(["plan", "money"] as const).map((t) => (
            <button
              key={t}
              onClick={() => actions.setTab(t)}
              aria-current={s.tab === t ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-support capitalize transition ${
                s.tab === t ? "bg-accent-tint text-accent" : "text-text-2 hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <button
          onClick={actions.startOnboarding}
          className="rounded-full border border-line px-3.5 py-1.5 text-support text-text transition hover:border-line-2"
        >
          New plan
        </button>
      </div>
    </header>
  );
}
