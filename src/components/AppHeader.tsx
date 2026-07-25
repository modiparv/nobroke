import { actions, useStore } from "../store";
import Logo from "./Logo";

/**
 * App nav: logo, the Plan / Money toggle, and account actions.
 *
 * The bar itself is transparent, so it reads as the page rather than as a
 * separate white pane. It carries the page background rather than being truly
 * see-through, because it is sticky and the spec forbids backdrop-filter, so a
 * literally transparent bar would let content scroll through the labels.
 */
export default function AppHeader() {
  const s = useStore();

  return (
    <header className="sticky top-0 z-30 bg-bg">
      <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />

        <nav className="flex items-center gap-0.5 rounded-full border border-line p-0.5" aria-label="Sections">
          {(["plan", "money"] as const).map((t) => (
            <button
              key={t}
              onClick={() => actions.setTab(t)}
              aria-current={s.tab === t ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-support capitalize transition sm:px-3.5 ${
                s.tab === t ? "bg-accent text-on-accent" : "text-text-2 hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <button
          onClick={actions.startOnboarding}
          className="rounded-full border border-line px-3 py-1.5 text-support text-text transition hover:border-line-2 sm:px-3.5"
        >
          New plan
        </button>
      </div>
    </header>
  );
}
