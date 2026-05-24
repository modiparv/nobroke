import { useState } from "react";
import { GOALS } from "../lib/goals";
import { actions, useStore } from "../store";

export default function GoalSelector() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const remaining = GOALS.filter((g) => !s.goals.some((x) => x.id === g.id));

  return (
    <div className="no-scrollbar relative flex items-center gap-2 overflow-x-auto pb-1">
      {s.goals.map((g) => {
        const active = g.id === s.currentGoalId;
        return (
          <button
            key={g.id}
            onClick={() => actions.setCurrentGoal(g.id)}
            className={`inline-flex flex-none items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
              active ? "border-brand-deep bg-brand-deep text-white" : "border-line hover:border-brand"
            }`}
          >
            <span>{g.emoji}</span>
            {g.name}
          </button>
        );
      })}

      <div className="relative flex-none">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-sm font-medium text-muted hover:border-brand hover:text-ink"
        >
          ＋ Add goal
        </button>
        {open && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex max-h-72 w-56 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-lg">
            {remaining.length === 0 && <span className="p-3 text-center text-sm text-muted">All goals added 🎉</span>}
            {remaining.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  actions.addGoal(g.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-paper"
              >
                <span>{g.emoji}</span>
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
