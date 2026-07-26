import { formatINR } from "../lib/format";

/**
 * A trustworthy money field: you can type the exact ₹ amount (grouped, Indian
 * style) and nudge it with − / + steppers. Replaces the fuzzy range sliders so a
 * number feels precise and editable rather than approximate.
 */
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
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const set = (v: number) => onChange(clamp(v));
  const btn = compact ? "w-9" : "w-11";
  const field = compact ? "py-1.5 text-row" : "py-2.5 text-section";

  return (
    <div>
      {(label || hint) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          {label && <span className="text-support text-muted">{label}</span>}
          {hint && <span className="text-index uppercase tracking-wide text-muted">{hint}</span>}
        </div>
      )}
      <div
        className={`flex items-stretch overflow-hidden rounded-control border border-line bg-surface transition focus-within:border-brand ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={disabled || value <= min}
          aria-label="Decrease"
          className={`grid flex-none place-items-center text-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 ${btn}`}
        >
          −
        </button>
        <div className="flex flex-1 items-center justify-center gap-1 border-x border-line px-2">
          <span className="text-row font-medium text-muted">₹</span>
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={value > 0 ? value.toLocaleString("en-IN") : ""}
            placeholder="0"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ""));
              set(Number.isFinite(n) ? n : 0);
            }}
            aria-label={label}
            className={`w-full bg-transparent text-center font-medium tabular-nums outline-none ${field}`}
          />
        </div>
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={disabled || value >= max}
          aria-label="Increase"
          className={`grid flex-none place-items-center text-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 ${btn}`}
        >
          +
        </button>
      </div>
      {quick && quick.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled}
              onClick={() => set(q)}
              className={`rounded-full border px-2 py-0.5 text-index uppercase tracking-wide transition ${
                value === clamp(q) ? "border-brand bg-brand text-on-accent" : "border-line text-muted hover:border-brand hover:text-ink"
              }`}
            >
              {formatINR(q)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
