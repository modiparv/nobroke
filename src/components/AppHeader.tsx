import { actions, useStore } from "../store";
import { btnGhost } from "../ui";
import Logo from "./Logo";

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
        active ? "bg-ink text-white" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

export default function AppHeader() {
  const s = useStore();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/80 px-5 py-3.5 backdrop-blur sm:px-10">
      <Logo />
      <nav className="flex items-center gap-1 rounded-full border border-line p-1" aria-label="Primary">
        <Tab label="Goals" active={s.screen === "goals"} onClick={actions.goGoals} />
        <Tab label="Portfolio" active={s.screen === "dashboard"} onClick={actions.goPortfolio} />
      </nav>
      <button className={`${btnGhost} hidden sm:inline-flex`} onClick={actions.startOnboarding}>
        ＋ New plan
      </button>
    </header>
  );
}
