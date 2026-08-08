import { useMemo, useState } from "react";
import { HOLDING_TYPES, HOLDING_TYPE_BY_LABEL } from "../lib/holdings";
import { formatINR } from "../lib/format";
import { actions, useStore } from "../store";
import { sectionLabel } from "../ui";

export default function Holdings() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState<string>(HOLDING_TYPES[0].id);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number>(0);

  const sum = s.externalHoldings.reduce((acc, h) => acc + (h.amount > 0 ? h.amount : 0), 0);
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
    setName("");
    setAmount(0);
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={sectionLabel}>Existing investments</span>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-caption font-medium text-muted transition hover:border-accent hover:text-ink"
        >
          ＋ Add investment
        </button>
      </div>

      {s.externalHoldings.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {s.externalHoldings.map((h) => {
            const t = HOLDING_TYPE_BY_LABEL[h.type];
            return (
              <div key={h.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
                <span className="w-5 flex-none text-center" aria-hidden>
                  {t?.emoji ?? "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-support font-medium">{h.name}</div>
                  <div className="text-index uppercase tracking-wide text-muted">{h.type}</div>
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
          })}
          <div className="mt-1 text-index uppercase tracking-wide text-muted">
            Invested <span className="font-medium text-ink">{formatINR(sum)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-caption text-muted">
          Stocks, MFs, FDs, NPS, PPF and more.
        </p>
      )}

      {/* Add-investment modal */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Add an investment">
          <div className="absolute inset-0 bg-night/50" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-medium tracking-tight text-display">Add an investment</h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-muted">
              It rolls into your total automatically.
            </p>

            <label className="mb-3 block">
              <span className="text-index uppercase tracking-wide text-muted">Type</span>
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
              <span className="text-index uppercase tracking-wide text-muted">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Parag Parikh Flexi Cap, HDFC FD…"
                className="mt-1 h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
              />
            </label>

            <label className="mb-5 block">
              <span className="text-index uppercase tracking-wide text-muted">Amount (₹)</span>
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
                onClick={() => setOpen(false)}
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
      )}
    </div>
  );
}
