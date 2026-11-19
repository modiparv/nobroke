import { useState } from "react";
import { formatINR } from "../lib/format";
import { GAP_LABEL } from "../lib/gap";
import { inr } from "../lib/glue";
import { onTrackCount, outlook, type GoalOutlook } from "../lib/outlook";
import { reachedText } from "../lib/reached";
import { RUNWAY_COMFORT_MONTHS, RUNWAY_FLOOR_MONTHS, runwayLabel, runwayMonths } from "../lib/runway";
import { actions, holdingsTotal, planShape, useStore } from "../store";
import { btnGhost, btnPrimary } from "../ui";
import AddInvestment, { SheetFrame as Frame } from "./AddInvestment";
import MoneyInput from "./MoneyInput";
import StatusPill from "./StatusPill";

/**
 * The sheets a link opens over the plan: one change each, with its effect
 * on every goal shown live, before anything is saved. Add money (cash or an
 * investment), cash in the bank (with how long it lasts), and the monthly
 * amount (with each goal's new verdict and date). The arithmetic is the
 * plan's own (lib/outlook), so what the sheet shows is what saving does.
 */

const THIS_YEAR = new Date().getFullYear();

function goalLine(o: GoalOutlook): string {
  const year = THIS_YEAR + o.horizonYears;
  if (o.level === "on_track") {
    if (o.reachedMonth !== null) return reachedText(o.reachedMonth);
    return `Reaches ${inr(o.projected)} by ${year}`;
  }
  return `${inr(Math.abs(o.gap))} short by ${year}`;
}

/** Every goal under the change, with its status (icon and word) and date.
    A status that moved says what it was, so the effect is plain before
    saving. */
function GoalLines({ items, was, highlight }: { items: GoalOutlook[]; was: GoalOutlook[]; highlight?: string }) {
  if (items.length === 0) return null;
  const wasById = new Map(was.map((w) => [w.id, w]));
  const now = onTrackCount(items);
  const before = onTrackCount(was);
  return (
    <div>
      <p className="num text-body text-text">
        <span className="font-medium">
          {now} of {items.length}
        </span>{" "}
        {items.length === 1 ? "goal" : "goals"} on track
        {now !== before ? <span className="text-text-2">, from {before}</span> : null}
      </p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {items.map((o) => {
          const prevLevel = wasById.get(o.id)?.level;
          const wasLabel = prevLevel !== undefined && prevLevel !== o.level ? GAP_LABEL[prevLevel] : null;
          return (
            <li key={o.id} className={`flex items-center justify-between gap-3 py-2.5 ${o.id === highlight ? "-mx-2 rounded-control bg-surface-2 px-2" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-text">{o.name}</span>
                <span className="num block text-support text-text-2">{goalLine(o)}</span>
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5">
                <StatusPill level={o.level} />
                {wasLabel && <span className="text-support text-text-2">was {wasLabel.toLowerCase()}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cancel and Save, the same on every sheet: one blue button, Save. */
function Footer({ canSave, onSave }: { canSave: boolean; onSave: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={actions.closeSheet} className={`${btnGhost} flex-1`}>
        Cancel
      </button>
      <button type="button" disabled={!canSave} onClick={onSave} className={`${btnPrimary} flex-1`}>
        Save
      </button>
    </div>
  );
}

function AddMoneySheet() {
  const choice =
    "flex w-full items-center justify-between gap-3 rounded-control border border-line-2 px-4 py-3 text-left transition hover:border-text hover:bg-surface-2";
  const chevron = (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none text-text-2">
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
  return (
    <Frame title="Add money" intro="Where is it going?" onClose={actions.closeSheet}>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => actions.openSheet({ kind: "cash" })} className={choice}>
          <span className="min-w-0">
            <span className="block text-body font-medium text-text">Add to cash</span>
            <span className="mt-0.5 block text-support text-text-2">Money in the bank. It covers your nearest goals first.</span>
          </span>
          {chevron}
        </button>
        <button type="button" onClick={() => actions.openSheet({ kind: "add_investment" })} className={choice}>
          <span className="min-w-0">
            <span className="block text-body font-medium text-text">Add an investment</span>
            <span className="mt-0.5 block text-support text-text-2">Something you already hold, like a fund, an FD, EPF or gold.</span>
          </span>
          {chevron}
        </button>
      </div>
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

  // Where the new figure sits against the months the plan looks for. A
  // fact about the number, not a thing to do.
  let against: string | null = null;
  if (runwayNext !== null) {
    const band = `${RUNWAY_FLOOR_MONTHS} to ${RUNWAY_COMFORT_MONTHS} months`;
    if (runwayNext < RUNWAY_FLOOR_MONTHS)
      against = `The plan looks for ${band}. That is ${inr(RUNWAY_FLOOR_MONTHS * s.monthlyExpenses)} to ${inr(RUNWAY_COMFORT_MONTHS * s.monthlyExpenses)}.`;
    else if (runwayNext > RUNWAY_COMFORT_MONTHS) against = `That is more than the ${band} the plan looks for.`;
    else against = `That is within the ${band} the plan looks for.`;
  }

  return (
    <Frame title="Add to cash" intro="Set the total in the bank once the new money is in." onClose={actions.closeSheet}>
      <div>
        <MoneyInput label="Cash in the bank" value={cash} onChange={setCash} step={5000} min={0} max={50000000} />
        <div className="mt-2 flex flex-wrap gap-2">
          {[10000, 50000, 100000].map((add) => (
            <button
              key={add}
              type="button"
              onClick={() => setCash((c) => Math.min(50000000, c + add))}
              aria-label={`Add ${formatINR(add)}`}
              className="num inline-flex h-11 items-center whitespace-nowrap rounded-full border border-line-2 px-3.5 text-support text-text transition hover:border-text"
            >
              + {formatINR(add)}
            </button>
          ))}
        </div>
      </div>
      {runwayNext !== null && (
        <p className="num text-support text-text-2">
          <span className="text-body text-text">
            Cash lasts <span className="font-medium">{runwayLabel(runwayNext)}</span>
            {runwayNow !== null && runwayLabel(runwayNow) !== runwayLabel(runwayNext) ? (
              <span className="text-text-2">, from {runwayLabel(runwayNow)}</span>
            ) : null}
            .
          </span>{" "}
          {against}
        </p>
      )}
      <GoalLines items={next} was={now} />
      <Footer
        canSave={changed}
        onSave={() => {
          actions.setSavings(cash);
          actions.closeSheet();
        }}
      />
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
          <p className={`num mt-2 text-support ${sip > leftover ? "font-medium text-cau" : "text-text-2"}`}>
            {sip > leftover ? `That is more than the ${inr(leftover)} left after expenses.` : `${inr(leftover)} is left after expenses.`}
          </p>
        )}
      </div>
      <GoalLines items={next} was={now} highlight={goalId} />
      <Footer
        canSave={changed}
        onSave={() => {
          actions.setSip(sip);
          actions.closeSheet();
        }}
      />
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
