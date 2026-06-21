import { actions } from "../store";
import { btnGhost } from "../ui";
import Logo from "./Logo";

/**
 * The plan lives on a single screen now, so the header is just identity + a way
 * to start over — no Goals/Portfolio tabs to bounce between.
 */
export default function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/80 px-5 py-3.5 backdrop-blur sm:px-10">
      <Logo />
      <button className={btnGhost} onClick={actions.startOnboarding}>
        ＋ New plan
      </button>
    </header>
  );
}
