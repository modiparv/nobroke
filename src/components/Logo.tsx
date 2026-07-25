import { actions } from "../store";

export default function Logo() {
  return (
    <button onClick={actions.goLanding} className="flex items-center gap-2" aria-label="Go to NoBroke home">
      <span className="grid h-7 w-7 place-items-center rounded-control bg-accent text-caption font-medium text-white">N</span>
      <span className="text-row font-medium">NoBroke</span>
    </button>
  );
}
