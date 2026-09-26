import { useState } from "react";
import { HOLDING_TYPE_BY_LABEL, UNSORTED_TYPE } from "../lib/holdings";
import { formatINR } from "../lib/format";
import { FOCUS, holdingFocus } from "../lib/links";
import type { Holding } from "../lib/types";
import { useFocus } from "../lib/useFocus";
import { actions, useStore } from "../store";
import { sectionLabel } from "../ui";
import AddInvestment from "./AddInvestment";

/** One holding, a link from the Portfolio page can land on it. */
function HoldingRow({ h }: { h: Holding }) {
  const t = HOLDING_TYPE_BY_LABEL[h.type];
  const focus = useFocus(holdingFocus(h.id));
  return (
    <div
      ref={focus.ref}
      className={`flex items-center gap-2 rounded-lg border border-line bg-surface p-2 ${focus.active ? "focus-flash" : ""}`}
    >
      <span className="w-5 flex-none text-center" aria-hidden>
        {t?.emoji ?? "•"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-support font-medium">{h.name}</div>
        <div className="text-caption text-muted">
          {h.type === UNSORTED_TYPE ? "Not sorted yet. Add each investment below to split it." : h.type}
        </div>
      </div>
      <span className="text-support font-medium tabular-nums">{formatINR(h.amount)}</span>
      <button
        onClick={() => actions.removeHolding(h.id)}
        aria-label={`Remove ${h.name}`}
        className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

export default function Holdings() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const focus = useFocus(FOCUS.investments);
  const sum = s.externalHoldings.reduce((acc, h) => acc + (h.amount > 0 ? h.amount : 0), 0);

  return (
    <div ref={focus.ref} className={`rounded-card ${focus.active ? "focus-flash" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={sectionLabel}>Your investments</span>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-caption font-medium text-muted transition hover:border-accent hover:text-ink"
        >
          ＋ Add investment
        </button>
      </div>

      {s.externalHoldings.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {s.externalHoldings.map((h) => (
            <HoldingRow key={h.id} h={h} />
          ))}
          <div className="mt-1 text-caption text-muted">
            Invested <span className="num font-medium text-ink">{formatINR(sum)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-caption text-muted">Stocks, MFs, FDs, NPS, PPF and more.</p>
      )}

      {open && <AddInvestment onClose={() => setOpen(false)} />}
    </div>
  );
}
