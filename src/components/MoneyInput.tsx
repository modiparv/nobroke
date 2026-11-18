import { useState } from "react";
import { formatINR } from "../lib/format";

/**
 * A money field: type the exact rupee amount (grouped the Indian way) or
 * nudge it with the minus and plus buttons. The label, the rupee sign and
 * the digits share one left edge; the two steppers sit together on the
 * right, each a full 44px target.
 *
 * The parts are exported so a field that is not money (a goal's year) can
 * wear the same shell and line up with the money fields beside it.
 */

export const fieldLabel = "text-support text-text-2";
/** Label beside the field from the sm breakpoint up, above it on a phone:
    a short form reads as a table, with every field starting on one line. */
export const fieldRow = "sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center sm:gap-x-4";
export const fieldShell =
  "flex items-stretch overflow-hidden rounded-control border border-line-2 bg-surface transition focus-within:border-text focus-within:ring-1 focus-within:ring-text";
export const fieldStep =
  "grid w-11 flex-none place-items-center border-l border-line text-text-2 transition hover:bg-surface-2 hover:text-text disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-2";

/** The minus and plus marks on a stepper, drawn so both sit on one axis. */
export function StepGlyph({ plus }: { plus?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M3.5 8h9" />
      {plus && <path d="M8 3.5v9" />}
    </svg>
  );
}

export default function MoneyInput({
  label,
  value,
  onChange,
  step = 1000,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  hint,
  quick,
  disabled,
  compact,
  row,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  quick?: number[];
  disabled?: boolean;
  compact?: boolean;
  /** Label beside the field on wider screens (see fieldRow). */
  row?: boolean;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const set = (v: number) => onChange(clamp(v));
  // While the digits typed so far are below the field's minimum, they are
  // held here and nothing is saved, so "7" on the way to "7,500" is not
  // snapped up to the minimum mid-word. Leaving the field drops them.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value > 0 ? value.toLocaleString("en-IN") : "");
  const name = label ?? "amount";

  return (
    <div className={`min-w-0 ${row ? fieldRow : ""}`}>
      {(label || hint) && (
        <div className={`mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 ${row ? "sm:mb-0" : ""}`}>
          {label && <span className={fieldLabel}>{label}</span>}
          {hint && <span className={fieldLabel}>{hint}</span>}
        </div>
      )}
      <div className={`${fieldShell} ${compact ? "h-11" : "h-12"} ${disabled ? "opacity-50" : ""}`}>
        <label className="flex min-w-0 flex-1 cursor-text items-center gap-1.5 pl-3 pr-2">
          <span className={`flex-none font-medium text-text-2 ${compact ? "text-row" : "text-section"}`} aria-hidden>
            ₹
          </span>
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={shown}
            placeholder="0"
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              const n = Number(digits);
              if (!Number.isFinite(n)) return;
              if (n < min) {
                setDraft(digits ? n.toLocaleString("en-IN") : "");
                return;
              }
              setDraft(null);
              set(n);
            }}
            onBlur={() => setDraft(null)}
            aria-label={label}
            className={`num h-full w-full min-w-0 bg-transparent font-medium text-text outline-none ${compact ? "text-row" : "text-section"}`}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            set(value - step);
          }}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${name}`}
          className={fieldStep}
        >
          <StepGlyph />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            set(value + step);
          }}
          disabled={disabled || value >= max}
          aria-label={`Increase ${name}`}
          className={fieldStep}
        >
          <StepGlyph plus />
        </button>
      </div>
      {quick && quick.length > 0 && (
        <div className={`mt-2 flex flex-wrap gap-2 ${row ? "sm:col-start-2" : ""}`}>
          {quick.map((q) => {
            const on = value === clamp(q);
            return (
              <button
                key={q}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => {
                  setDraft(null);
                  set(q);
                }}
                className={`num inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-support transition ${
                  on ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-text hover:border-text"
                }`}
              >
                {formatINR(q)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
