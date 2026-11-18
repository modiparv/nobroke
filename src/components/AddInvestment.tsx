import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HOLDING_TYPES } from "../lib/holdings";
import { actions } from "../store";
import { btnGhost, btnPrimary } from "../ui";
import MoneyInput, { fieldLabel } from "./MoneyInput";

/**
 * The frame every sheet shares: a sheet that rises from the bottom edge on
 * a phone and a centred dialog on wider screens, with a title, an optional
 * line under it and a close button. Escape and a tap outside both close
 * it. It is drawn straight into the page body, so it sits above the header
 * and the copilot bar wherever it was opened from. It lives in this file
 * because this sheet is the one that is also opened on its own (from the
 * Money page), so the others import it from here.
 */
export function SheetFrame({ title, intro, onClose, children }: { title: string; intro?: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keyboard focus starts inside the sheet and goes back to where it was.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });
    return () => before?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-night/50" onClick={onClose} />
      {/* Opening is the answer to a tap, so the sheet eases in (and does not when motion is reduced). */}
      <div
        ref={panel}
        tabIndex={-1}
        className="fade-up relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-screen border border-line bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 outline-none sm:max-w-md sm:rounded-card sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-2">
            <h2 className="text-headline font-medium text-text">{title}</h2>
            {intro && <p className="mt-1 text-support text-text-2">{intro}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2.5 grid h-11 w-11 flex-none place-items-center rounded-control text-text-2 transition hover:bg-surface-2 hover:text-text"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A typed field in a sheet: 16px text (so an iPhone does not zoom in), 48px tall. */
const input =
  "mt-1.5 h-12 w-full rounded-control border border-line-2 bg-surface px-3 text-body text-text outline-none transition focus:border-text focus:ring-1 focus:ring-text";

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

  const ready = name.trim().length > 0 && amount > 0;

  function save() {
    if (!ready) return;
    const t = HOLDING_TYPES.find((x) => x.id === typeId);
    if (!t) return;
    actions.addHolding({ category: t.category, type: t.label, name: name.trim(), amount: Math.round(amount) });
    onClose();
  }

  return (
    <SheetFrame title="Add an investment" intro="Something you already hold. It is added to your total and your goals update." onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className={fieldLabel}>Type</span>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={input}>
            {grouped.map(([cat, types]) => (
              <optgroup key={cat} label={cat}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={fieldLabel}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Flexi cap fund, bank FD, EPF" className={input} />
        </label>

        <MoneyInput label="What it is worth today" value={amount} onChange={setAmount} step={1000} min={0} max={10000000000} />

        <div className="mt-1 flex gap-2">
          <button type="button" onClick={onClose} className={`${btnGhost} flex-1`}>
            Cancel
          </button>
          <button type="submit" disabled={!ready} className={`${btnPrimary} flex-1`}>
            Save
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}
