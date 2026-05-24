import { computePlan } from "../lib/finance";
import { formatINR, formatYears } from "../lib/format";
import { actions, currentGoal, goalMonthly, goalsByPriority, planInputsForGoal, useStore } from "../store";
import { card } from "../ui";

const BASE_YEAR = new Date().getFullYear();

export default function GoalPlanner() {
  const s = useStore();
  if (s.goals.length === 0) return null;
  const ordered = goalsByPriority(s);
  const current = currentGoal(s);
  const unconfirmed = s.goals.filter((g) => !g.tenureConfirmed).length;

  return (
    <section className={card}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Goals &amp; money split</h2>
        <button
          onClick={actions.recommendGoalSplit}
          className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-ink"
        >
          ✨ Recommend split
        </button>
      </div>
      <p className="text-[13px] text-muted">
        Splitting <span className="font-semibold text-ink">{formatINR(s.monthlySip)}/mo</span> across {s.goals.length}{" "}
        {s.goals.length === 1 ? "goal" : "goals"}. Priority is set by how soon you need the money — reorder anytime.
      </p>

      {unconfirmed > 0 && (
        <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink">
          Confirm the target year for {unconfirmed} {unconfirmed === 1 ? "goal" : "goals"} so we can build the full plan.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {ordered.map((g, i) => {
          const r = computePlan(planInputsForGoal(s, g));
          const amount = goalMonthly(s, g.id);
          const sharePct = s.monthlySip > 0 ? Math.round((amount / s.monthlySip) * 100) : 0;
          const progress = Math.max(0, Math.min(1, r.progress));
          const isCurrent = current?.id === g.id;
          const year = BASE_YEAR + g.horizonYears;
          return (
            <div
              key={g.id}
              className={`rounded-xl border p-3 transition ${isCurrent ? "border-ink" : "border-line"}`}
            >
              <div className="flex items-center gap-3">
                {/* Priority + reorder */}
                <div className="flex flex-none flex-col items-center">
                  <button
                    onClick={() => actions.moveGoalPriority(g.id, -1)}
                    disabled={i === 0}
                    aria-label="Raise priority"
                    className="grid h-4 w-5 place-items-center text-[10px] text-muted hover:text-ink disabled:opacity-25"
                  >
                    ▲
                  </button>
                  <span className="font-mono text-[11px] font-bold text-ink">{i + 1}</span>
                  <button
                    onClick={() => actions.moveGoalPriority(g.id, 1)}
                    disabled={i === ordered.length - 1}
                    aria-label="Lower priority"
                    className="grid h-4 w-5 place-items-center text-[10px] text-muted hover:text-ink disabled:opacity-25"
                  >
                    ▼
                  </button>
                </div>

                {/* Name + tenure */}
                <button onClick={() => actions.setCurrentGoal(g.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span>{g.emoji}</span>
                    <span className="truncate text-sm font-semibold">{g.name}</span>
                    {!g.tenureConfirmed && (
                      <span className="rounded-full bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-brand">
                        confirm year
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted">in {formatYears(g.horizonYears)}</div>
                </button>

                {/* Target-year stepper */}
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    onClick={() => actions.setGoalTenure(g.id, g.horizonYears - 1)}
                    disabled={g.horizonYears <= 1}
                    aria-label="Earlier year"
                    className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted hover:border-ink hover:text-ink disabled:opacity-30"
                  >
                    −
                  </button>
                  <div className="w-12 text-center">
                    <div className="font-mono text-[9px] uppercase tracking-wide text-muted">by</div>
                    <div className="text-sm font-bold tabular-nums leading-none">{year}</div>
                  </div>
                  <button
                    onClick={() => actions.setGoalTenure(g.id, g.horizonYears + 1)}
                    aria-label="Later year"
                    className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted hover:border-ink hover:text-ink"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Money split */}
              <div className="mt-2.5 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, s.monthlySip)}
                  step={500}
                  value={Math.round(amount)}
                  onChange={(e) => actions.setGoalAmount(g.id, Number(e.target.value))}
                  aria-label={`${g.name} monthly amount`}
                  className="flex-1"
                  disabled={s.monthlySip <= 0}
                />
                <div className="w-24 flex-none text-right">
                  <div className="text-sm font-bold tabular-nums leading-none">
                    {formatINR(amount)}
                    <span className="text-[10px] font-normal text-muted">/mo</span>
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-wide text-muted">{sharePct}% of money</div>
                </div>
              </div>

              {/* On-track progress bar */}
              <div className="mt-2.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${progress * 100}%`, background: r.onTrack ? "#1A1AFF" : "#0A0A0A" }}
                  />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-wide">
                  <span className={r.onTrack ? "text-brand" : "text-muted"}>
                    {r.onTrack ? "On track" : `Short by ${formatINR(Math.abs(r.gap))}`}
                  </span>
                  <span className="text-muted">{Math.round(progress * 100)}% of {formatINR(r.requiredCorpus)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
