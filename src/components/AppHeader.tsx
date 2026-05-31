import { actions, useStore } from "../store";
import { btnGhost } from "../ui";
import Logo from "./Logo";

function Tab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink"
      }`}
    >
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      {label}
    </button>
  );
}

function BottomTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-bold uppercase tracking-wide transition ${
        active ? "text-ink" : "text-muted"
      }`}
    >
      <span aria-hidden className="text-xl leading-none">
        {icon}
      </span>
      <span className="flex items-center gap-1">
        {label}
        {active && <span className="inline-block h-1 w-1 rounded-full bg-brand" aria-hidden />}
      </span>
    </button>
  );
}

export default function AppHeader() {
  const s = useStore();
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/80 px-5 py-3.5 backdrop-blur sm:px-10">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/60 p-1 sm:flex" aria-label="Primary">
          <Tab label="Goals" icon="🎯" active={s.screen === "goals"} onClick={actions.goGoals} />
          <Tab label="Portfolio" icon="💼" active={s.screen === "dashboard"} onClick={actions.goPortfolio} />
        </nav>
        <button className={`${btnGhost} hidden sm:inline-flex`} onClick={actions.startOnboarding}>
          ＋ New plan
        </button>
        {/* Mobile: a single label so the header stays compact (nav lives in the bottom bar) */}
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted sm:hidden">
          {s.screen === "goals" ? "Goals" : "Portfolio"}
        </span>
      </header>

      {/* Persistent bottom nav (mobile) — always one tap away */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-paper/95 backdrop-blur sm:hidden"
        aria-label="Primary"
      >
        <BottomTab label="Goals" icon="🎯" active={s.screen === "goals"} onClick={actions.goGoals} />
        <div className="w-px self-stretch bg-line" aria-hidden />
        <BottomTab label="Portfolio" icon="💼" active={s.screen === "dashboard"} onClick={actions.goPortfolio} />
      </nav>
    </>
  );
}
