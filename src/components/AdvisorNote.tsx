import { useState } from "react";
import { formatINR } from "../lib/format";
import { RUNWAY_COMFORT_MONTHS, RUNWAY_FLOOR_MONTHS, runwayMonths } from "../lib/runway";
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
  const coverMonths = runwayMonths(s.currentSavings, s.monthlyExpenses);

  if (coverMonths != null && coverMonths < RUNWAY_FLOOR_MONTHS) {
    const whole = Math.floor(coverMonths);
    const cover = coverMonths < 1 ? "under a month" : `only ${whole} ${whole === 1 ? "month" : "months"}`;
    notes.push({
      id: "emergency",
      text: `Your cash covers ${cover} of expenses. Keep ${RUNWAY_FLOOR_MONTHS} to ${RUNWAY_COMFORT_MONTHS} months in the bank before you invest more.`,
      cta: "Add to cash",
      // The cash sheet, with how long the cash lasts shown live.
      onCta: () => actions.openSheet({ kind: "cash" }),
    });
  }
  if (surplus > 0 && s.monthlySip < surplus * 0.5) {
    notes.push({
      id: "idle_surplus",
      text: `${formatINR(surplus - s.monthlySip)} a month is left over and not invested. Even part of it, invested every month, adds up.`,
      cta: "Put in more",
      // The monthly sheet, prefilled with the whole surplus and every goal's
      // new verdict shown before saving.
      onCta: () => actions.openSheet({ kind: "monthly", prefill: Math.round(surplus) }),
    });
  }
  if (coverMonths != null && coverMonths > 8 && s.currentSavings > holdingsTotal(s)) {
    notes.push({
      id: "cash_drag",
      text: "You hold more cash than you need. Cash loses value to inflation every year.",
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
          className="px-1 text-text-2 transition hover:text-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
