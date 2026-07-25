import { useState } from "react";
import { actions, useStore } from "../store";
import Logo from "./Logo";
import InfoModal, { type InfoPanel } from "./InfoModal";

/**
 * Slim translucent top bar: brand + light nav (About / Pricing / Contact) and the
 * subscription + new-plan actions. The nav items open a lightweight info modal.
 */
export default function AppHeader() {
  const s = useStore();
  const [panel, setPanel] = useState<InfoPanel | null>(null);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-brand/10 bg-white/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-8">
          <Logo />

          <nav className="flex items-center gap-0.5 rounded-full border border-line bg-white/60 p-0.5" aria-label="Sections">
            {(["plan", "money"] as const).map((t) => (
              <button
                key={t}
                onClick={() => actions.setTab(t)}
                aria-current={s.tab === t ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-[13px] capitalize transition ${
                  s.tab === t ? "bg-ink text-white" : "text-muted hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Primary">
            <button onClick={() => setPanel("about")} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-brand/5 hover:text-ink">
              About us
            </button>
            <button onClick={() => setPanel("pricing")} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-brand/5 hover:text-ink">
              Pricing
            </button>
            <button onClick={() => setPanel("contact")} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-brand/5 hover:text-ink">
              Contact
            </button>
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPanel("pricing")}
              className="rounded-full border border-brand/30 bg-brand/5 px-3 py-1.5 text-[12px] font-semibold text-brand transition hover:bg-brand/10"
            >
              ✨ Go Plus
            </button>
            <button
              onClick={actions.startOnboarding}
              className="rounded-full border border-line bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:border-ink"
            >
              ＋ New plan
            </button>
          </div>
        </div>
      </header>

      {panel && <InfoModal panel={panel} onPanel={setPanel} onClose={() => setPanel(null)} />}
    </>
  );
}
