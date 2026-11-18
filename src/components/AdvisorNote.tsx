import { useState } from "react";
import { inr } from "../lib/glue";
import { RUNWAY_COMFORT_MONTHS, RUNWAY_FLOOR_MONTHS, runwayMonths } from "../lib/runway";
import { actions, holdingsTotal, useStore } from "../store";
import { btnGhost } from "../ui";

/**
 * One note at a time, each a fact worked out from the person's own numbers:
 * how long the cash lasts, money left over each month that is in no plan,
 * and cash well beyond the months the plan looks for. A note states what is
 * true and offers the sheet where the number can be changed. It never says
 * what to do. Dismissing one shows the next; dismissals last for the
 * session.
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
  const band = `${RUNWAY_FLOOR_MONTHS} to ${RUNWAY_COMFORT_MONTHS} months`;

  if (coverMonths != null && coverMonths < RUNWAY_FLOOR_MONTHS) {
    const whole = Math.floor(coverMonths);
    const cover = coverMonths < 1 ? "under a month" : `only ${whole} ${whole === 1 ? "month" : "months"}`;
    notes.push({
      id: "emergency",
      text: `Your cash covers ${cover} of expenses. The plan looks for ${band} in the bank. For you that is ${inr(RUNWAY_FLOOR_MONTHS * s.monthlyExpenses)} to ${inr(RUNWAY_COMFORT_MONTHS * s.monthlyExpenses)}.`,
      cta: "Add to cash",
      // The cash sheet, with how long the cash lasts shown live.
      onCta: () => actions.openSheet({ kind: "cash" }),
    });
  }
  if (surplus > 0 && s.monthlySip < surplus * 0.5) {
    notes.push({
      id: "idle_surplus",
      text: `${inr(surplus - s.monthlySip)} a month is left after expenses and is not invested.`,
      cta: "Put in more",
      // The monthly sheet, prefilled with the whole surplus and every goal's
      // new verdict shown before saving.
      onCta: () => actions.openSheet({ kind: "monthly", prefill: Math.round(surplus) }),
    });
  }
  if (coverMonths != null && coverMonths > 8 && s.currentSavings > holdingsTotal(s)) {
    notes.push({
      id: "cash_drag",
      text: `Your cash covers ${coverMonths >= 12 ? "more than 12" : Math.floor(coverMonths)} months of expenses. The plan looks for ${band}. Cash buys a little less each year as prices rise.`,
    });
  }

  const note = notes.find((n) => !dismissed.includes(n.id));
  if (!note) return null;

  // A tinted strip, not another white card: it is a remark beside the plan,
  // and it should not compete with the goal it sits above.
  return (
    <div role="note" className="relative rounded-control bg-surface-2 py-3 pl-4 pr-12 sm:flex sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <span className="text-support font-medium text-text-2">Note</span>
        <p className="num mt-0.5 text-body text-text">{note.text}</p>
      </div>
      {note.cta && (
        <button type="button" onClick={note.onCta} className={`${btnGhost} mt-3 flex-none bg-surface sm:mt-0`}>
          {note.cta}
        </button>
      )}
      <button
        type="button"
        onClick={() => setDismissed((d) => [...d, note.id])}
        aria-label="Dismiss note"
        className="absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center rounded-control text-text-2 transition hover:text-text"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
