import { useState } from "react";
import { formatINR } from "../lib/format";
import { actions, holdingsTotal, useStore } from "../store";

/**
 * Proactive advisory nudges, one at a time. Each is a judgement a wealth
 * manager would raise unprompted, computed from the person's own numbers:
 * emergency cover first, idle surplus second, cash drag third. Dismissing
 * one reveals the next; dismissals last for the session.
 */

interface Note {
  id: string;
  text: string;
  cta?: string;
  onCta?: () => void;
}

export default function AdvisorNote() {
  const s = useStore();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const notes: Note[] = [];
  const surplus = s.monthlyIncome > 0 ? Math.max(0, s.monthlyIncome - s.monthlyExpenses) : 0;
  const coverMonths = s.monthlyExpenses > 0 ? s.currentSavings / s.monthlyExpenses : null;

  if (coverMonths != null && coverMonths < 3) {
    const cover = coverMonths < 1 ? "under a month" : `about ${Math.floor(coverMonths)} ${Math.floor(coverMonths) === 1 ? "month" : "months"}`;
    notes.push({
      id: "emergency",
      text: `Your cash covers ${cover} of spending. We keep 3 to 6 months within reach before taking any risk.`,
      cta: "Review cash",
      onCta: () => actions.setTab("money"),
    });
  }
  if (surplus > 0 && s.monthlySip < surplus * 0.5) {
    notes.push({
      id: "idle_surplus",
      text: `${formatINR(surplus - s.monthlySip)} of your monthly surplus is sitting idle. Even part of it, invested regularly, compounds meaningfully.`,
      cta: "Adjust monthly",
      onCta: () => actions.setTab("money"),
    });
  }
  if (coverMonths != null && coverMonths > 8 && s.currentSavings > holdingsTotal(s)) {
    notes.push({
      id: "cash_drag",
      text: "You hold more cash than a plan of this shape needs. Idle cash quietly loses ground to inflation every year.",
    });
  }

  const note = notes.find((n) => !dismissed.includes(n.id));
  if (!note) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <span className="text-eyebrow uppercase text-text-3">Advisor note</span>
        <p className="mt-1 text-support text-text">{note.text}</p>
      </div>
      <div className="flex flex-none items-center gap-2">
        {note.cta && (
          <button
            onClick={note.onCta}
            className="rounded-full border border-line px-3 py-1.5 text-support text-text transition hover:border-line-2"
          >
            {note.cta}
          </button>
        )}
        <button
          onClick={() => setDismissed((d) => [...d, note.id])}
          aria-label="Dismiss note"
          className="px-1 text-text-3 transition hover:text-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
