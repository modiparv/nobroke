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
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const set = (v: number) => onChange(clamp(v));

  return (
    <div>
      {(label || hint) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label && <span className="text-[13px] text-muted">{label}</span>}
          {hint && <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{hint}</span>}
        </div>
      )}
      <div
        className={`flex items-stretch overflow-hidden rounded-xl border border-line bg-white transition focus-within:border-brand ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={disabled || value <= min}
          aria-label="Decrease"
          className="grid w-11 flex-none place-items-center text-lg text-muted transition hover:bg-paper hover:text-ink disabled:opacity-30"
        >
          −
        </button>
        <div className="flex flex-1 items-center justify-center gap-1 border-x border-line px-2">
          <span className="text-[15px] font-semibold text-muted">₹</span>
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
            className="w-full bg-transparent py-2.5 text-center text-[17px] font-bold tabular-nums outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={disabled || value >= max}
          aria-label="Increase"
          className="grid w-11 flex-none place-items-center text-lg text-muted transition hover:bg-paper hover:text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>
      {quick && quick.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled}
              onClick={() => set(q)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                value === clamp(q) ? "border-brand bg-brand text-white" : "border-line text-muted hover:border-brand hover:text-ink"
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
