import { useMemo, useState } from "react";
import { HOLDING_TYPES } from "../lib/holdings";
import { actions } from "../store";

/**
 * Add one investment you already hold: its type, its name, what it is
 * worth today. It rolls into your total at once. Used from the Money
 * page's investments list and from the plan's "Add money" sheet.
 */
export default function AddInvestment({ onClose }: { onClose: () => void }) {
  const [typeId, setTypeId] = useState<string>(HOLDING_TYPES[0].id);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number>(0);

  const grouped = useMemo(() => {
    const cats: Record<string, Array<(typeof HOLDING_TYPES)[number]>> = {};
    for (const t of HOLDING_TYPES) {
      (cats[t.category] ||= []).push(t);
    }
    return Object.entries(cats);
  }, []);

  function save() {
    if (!name.trim() || amount <= 0) return;
    const t = HOLDING_TYPES.find((x) => x.id === typeId);
    if (!t) return;
    actions.addHolding({ category: t.category, type: t.label, name: name.trim(), amount: Math.round(amount) });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Add an investment">
      <div className="absolute inset-0 bg-night/50" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium tracking-tight text-display">Add an investment</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted">It rolls into your total at once, and your goals update.</p>

        <label className="mb-3 block">
          <span className="text-caption text-muted">Type</span>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="mt-1 h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          >
            {grouped.map(([cat, types]) => (
              <optgroup key={cat} label={cat}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="mb-3 block">
          <span className="text-caption text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Parag Parikh Flexi Cap, HDFC FD…"
            className="mt-1 h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
        </label>

        <label className="mb-5 block">
          <span className="text-caption text-muted">Amount (₹)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="50000"
            className="mt-1 h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium text-muted hover:border-ink hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || amount <= 0}
            className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-on-accent transition hover:bg-brand-deep disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
