import { actions } from "../store";

export default function Logo() {
  return (
    <button onClick={actions.goLanding} className="flex items-center gap-2" aria-label="Go to NoBroke home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-deep text-sm font-semibold text-white">N</span>
      <span className="text-lg font-semibold tracking-tight">NoBroke</span>
    </button>
  );
}
