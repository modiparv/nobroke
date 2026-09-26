import { useEffect, useState, type ReactNode } from "react";
import { formatINR } from "../lib/format";
import { GAP_LABEL } from "../lib/gap";
import { onTrackCount, outlook, type GoalOutlook } from "../lib/outlook";
import { RUNWAY_COMFORT_MONTHS, RUNWAY_FLOOR_MONTHS, runwayLabel, runwayMonths } from "../lib/runway";
import { actions, holdingsTotal, planShape, useStore } from "../store";
import { GAP_PILL, btnGhost, btnPrimary } from "../ui";
import AddInvestment from "./AddInvestment";
import MoneyInput from "./MoneyInput";

/**
 * The sheets a link opens over the plan: one change each, with its effect
 * on every goal shown live, before anything is saved. Add money (cash or an
 * investment), cash in the bank (with how long it lasts), and the monthly
 * amount (with each goal's new verdict and date). The arithmetic is the
 * plan's own (lib/outlook), so what the sheet shows is what saving does.
 */

const THIS_YEAR = new Date().getFullYear();

function Frame({ title, intro, onClose, children }: { title: string; intro?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-night/50" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-card border border-line bg-surface p-5 sm:max-w-md sm:rounded-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-section font-medium text-display">{title}</h2>
            {intro && <p className="mt-0.5 text-caption text-text-2">{intro}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-1 text-text-2 transition hover:text-text">
            ✕
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

/** When a goal on track is reached before its date: "Done by Mar 2028". */
function reachedLabel(monthsFromNow: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + Math.max(0, Math.ceil(monthsFromNow)));
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function goalLine(o: GoalOutlook): string {
  const year = THIS_YEAR + o.horizonYears;
  if (o.level === "on_track") {
    if (o.reachedMonth !== null) return o.reachedMonth <= 0 ? "Covered already" : `Done by ${reachedLabel(o.reachedMonth)}`;
    return `Reaches ${formatINR(o.projected)} by ${year}`;
  }
  return `${formatINR(Math.abs(o.gap))} short by ${year}`;
}

/** Every goal under the change, with its verdict and date. A verdict that
    moved says what it was, so the effect is plain before saving. */
function GoalLines({ items, was, highlight }: { items: GoalOutlook[]; was: GoalOutlook[]; highlight?: string }) {
  if (items.length === 0) return null;
  const wasById = new Map(was.map((w) => [w.id, w]));
  const now = onTrackCount(items);
  const before = onTrackCount(was);
  return (
    <div>
      <p className="num text-support text-text">
        {now} of {items.length} {items.length === 1 ? "goal" : "goals"} on track
        {now !== before ? <span className="text-text-2">, from {before}</span> : null}
      </p>
      <ul className="mt-2 divide-y divide-line rounded-control border border-line">
        {items.map((o) => {
          const prevLevel = wasById.get(o.id)?.level;
          const wasLabel = prevLevel !== undefined && prevLevel !== o.level ? GAP_LABEL[prevLevel] : null;
          return (
            <li key={o.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${o.id === highlight ? "bg-surface-2" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate text-support font-medium text-text">{o.name}</span>
                <span className="num block text-caption text-text-2">{goalLine(o)}</span>
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5">
                <span className={`rounded-full px-2 py-0.5 text-caption ${GAP_PILL[o.level]}`}>{GAP_LABEL[o.level]}</span>
                {wasLabel && <span className="text-index text-text-2">was {wasLabel.toLowerCase()}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AddMoneySheet() {
  const choice = "flex w-full flex-col items-start rounded-control border border-line px-4 py-3 text-left transition hover:border-line-2 hover:bg-surface-2";
  return (
    <Frame title="Add money" intro="Where is it going?" onClose={actions.closeSheet}>
      <button type="button" onClick={() => actions.openSheet({ kind: "cash" })} className={choice}>
        <span className="text-support font-medium text-text">Add to cash</span>
        <span className="mt-0.5 text-caption text-text-2">Money in the bank. It covers your nearest goals first.</span>
      </button>
      <button type="button" onClick={() => actions.openSheet({ kind: "add_investment" })} className={choice}>
        <span className="text-support font-medium text-text">Add an investment</span>
        <span className="mt-0.5 text-caption text-text-2">Something you already hold: a fund, an FD, EPF, gold.</span>
      </button>
    </Frame>
  );
}

function CashSheet() {
  const s = useStore();
  const [cash, setCash] = useState(Math.max(0, Math.round(s.currentSavings)));
  const now = outlook(planShape(s));
  const next = outlook({ ...planShape(s), capital: cash + holdingsTotal(s) });
  const runwayNow = runwayMonths(s.currentSavings, s.monthlyExpenses);
  const runwayNext = runwayMonths(cash, s.monthlyExpenses);
  const changed = cash !== Math.round(s.currentSavings);

  let advice: string | null = null;
  if (runwayNext !== null) {
    const floor = formatINR(RUNWAY_FLOOR_MONTHS * s.monthlyExpenses);
    const comfort = formatINR(RUNWAY_COMFORT_MONTHS * s.monthlyExpenses);
    if (runwayNext < RUNWAY_FLOOR_MONTHS) advice = `Aim for ${RUNWAY_FLOOR_MONTHS} to ${RUNWAY_COMFORT_MONTHS} months. That is ${floor} to ${comfort}.`;
    else if (runwayNext > RUNWAY_COMFORT_MONTHS) advice = "More than you need in cash. The rest could be invested.";
    else advice = `Within the ${RUNWAY_FLOOR_MONTHS} to ${RUNWAY_COMFORT_MONTHS} months we keep in reach.`;
  }

  return (
    <Frame title="Add to cash" intro="What is in the bank today, after this." onClose={actions.closeSheet}>
      <div>
        <MoneyInput label="Cash in the bank" value={cash} onChange={setCash} step={5000} min={0} max={50000000} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[10000, 50000, 100000].map((add) => (
            <button
              key={add}
              type="button"
              onClick={() => setCash((c) => Math.min(50000000, c + add))}
              className="num rounded-full border border-line px-2.5 py-1 text-caption text-text-2 transition hover:border-line-2 hover:text-text"
            >
              + {formatINR(add)}
            </button>
          ))}
        </div>
      </div>
      {runwayNext !== null && (
        <p className="num text-support text-text">
          Cash lasts <span className="font-medium">{runwayLabel(runwayNext)}</span>
          {runwayNow !== null && runwayLabel(runwayNow) !== runwayLabel(runwayNext) ? (
            <span className="text-text-2">, from {runwayLabel(runwayNow)}</span>
          ) : null}
          . {advice && <span className="text-text-2">{advice}</span>}
        </p>
      )}
      <GoalLines items={next} was={now} />
      <div className="flex gap-2">
        <button type="button" onClick={actions.closeSheet} className={`${btnGhost} flex-1`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => {
            actions.setSavings(cash);
            actions.closeSheet();
          }}
          className={`${btnPrimary} flex-1`}
        >
          Save
        </button>
      </div>
    </Frame>
  );
}

function MonthlySheet({ goalId, prefill }: { goalId?: string; prefill?: number }) {
  const s = useStore();
  const [sip, setSip] = useState(Math.max(0, Math.round(prefill ?? s.monthlySip)));
  const now = outlook(planShape(s));
  const next = outlook({ ...planShape(s, { resplit: true }), monthlySip: sip });
  const goal = goalId ? s.goals.find((g) => g.id === goalId) : undefined;
  const leftover = s.monthlyIncome > 0 ? Math.max(0, s.monthlyIncome - s.monthlyExpenses) : null;
  const changed = sip !== Math.round(s.monthlySip);

  return (
    <Frame
      title={goal ? `Put in more for ${goal.name}` : "Every month"}
      intro={
        s.goalSharesCustom
          ? "Each goal keeps its share of the monthly amount."
          : "Money goes to your nearest goals first, so a goal moves once the goals before it are covered."
      }
      onClose={actions.closeSheet}
    >
      <div>
        <MoneyInput label="Invested every month" value={sip} onChange={setSip} step={500} min={0} max={1000000} />
        {leftover !== null && (
          <p className={`num mt-1.5 text-caption ${sip > leftover ? "text-cau" : "text-text-2"}`}>
            {sip > leftover
              ? `That is more than the ${formatINR(leftover)} left after expenses.`
              : `${formatINR(leftover)} is left after expenses.`}
          </p>
        )}
      </div>
      <GoalLines items={next} was={now} highlight={goalId} />
      <div className="flex gap-2">
        <button type="button" onClick={actions.closeSheet} className={`${btnGhost} flex-1`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => {
            actions.setSip(sip);
            actions.closeSheet();
          }}
          className={`${btnPrimary} flex-1`}
        >
          Save
        </button>
      </div>
    </Frame>
  );
}

export default function Sheets() {
  const s = useStore();
  const sheet = s.sheet;
  if (!sheet) return null;
  switch (sheet.kind) {
    case "add_money":
      return <AddMoneySheet />;
    case "cash":
      return <CashSheet />;
    case "monthly":
      return <MonthlySheet key={`${sheet.goalId ?? ""}:${sheet.prefill ?? ""}`} goalId={sheet.goalId} prefill={sheet.prefill} />;
    case "add_investment":
      return <AddInvestment onClose={actions.closeSheet} />;
    default:
      return null;
  }
}
