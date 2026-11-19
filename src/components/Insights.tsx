import type { PlanInputs, PlanResult } from "../lib/types";
import { allocationTotal, growthWeight, normalizedWeights, requiredSip } from "../lib/finance";
import { FUND_MAP } from "../lib/funds";
import { formatPct } from "../lib/format";
import { GAP_LABEL, gapLevel, gapTone, type GapLevel, type GapTone } from "../lib/gap";
import { inr } from "../lib/glue";
import { neededMonthly } from "../lib/options";
import { reachedMonth } from "../lib/reached";
import { onTrackMessage, shortMessage } from "../lib/verdict";
import { StatusIcon } from "./StatusPill";

/**
 * The reasons behind a goal's verdict, as a short list of facts from the
 * person's own numbers. The first line is the verdict and carries the
 * goal's status (icon, word and colour). A caution is a fact worth a second
 * look. The rest is context. Nothing here tells the person what to buy,
 * hold or sell.
 */
interface Reason {
  kind: "verdict" | "caution" | "context";
  /** Set on the verdict: the goal's level picks the icon and the colour. */
  level?: GapLevel;
  title: string;
  message: string;
}

function generate(inputs: PlanInputs, r: PlanResult): Reason[] {
  const out: Reason[] = [];
  const weights = normalizedWeights(inputs.allocation);
  if (weights.length === 0) {
    return [{ kind: "context", title: "No mix yet", message: "Pick a mix on the Portfolio tab to see how this goal grows." }];
  }

  const years = `${inputs.horizonYears} ${inputs.horizonYears === 1 ? "year" : "years"}`;
  const level = gapLevel(r);
  if (r.onTrack) {
    out.push({
      kind: "verdict",
      level,
      title: "You're on track",
      message: onTrackMessage(r),
    });
    if (r.goalReachedMonth !== null && r.goalReachedMonth < r.months) {
      out.push({
        kind: "context",
        title: "Ahead of schedule",
        message:
          r.goalReachedMonth <= 0
            ? "The money you hold today already covers this goal."
            : `At this rate you get there by ${reachedMonth(r.goalReachedMonth)}, before the date you set.`,
      });
    }
  } else {
    // The title matches the size of the gap: "A little short" for a gap of
    // more than half the goal would mislead.
    out.push({
      kind: "verdict",
      level,
      title: GAP_LABEL[level],
      message: shortMessage(r, inputs.monthlySip, neededMonthly(r)),
    });
  }

  const eq = growthWeight(inputs.allocation);
  if (inputs.horizonYears <= 3 && eq > 0.4) {
    out.push({
      kind: "caution",
      title: "A lot in stocks for a goal this close",
      message: `${formatPct(eq, 0)} of this money is in stocks and you need it in ${years}. One bad year could cut it.`,
    });
  } else if (inputs.horizonYears >= 10 && eq < 0.4) {
    out.push({
      kind: "context",
      title: "Little in stocks for a far goal",
      message: `You have ${years}, and ${formatPct(eq, 0)} of this money is in stocks. Over that long, stocks have tended to grow more, with bigger ups and downs.`,
    });
  }

  const top = [...weights].sort((a, b) => b.weight - a.weight)[0];
  if (top && top.weight > 0.7) {
    out.push({
      kind: "context",
      title: "Mostly in one fund",
      message: `${formatPct(top.weight, 0)} is in ${FUND_MAP[top.id]?.name ?? "one fund"}. One fund carries more risk than a spread of funds.`,
    });
  }

  const total = allocationTotal(inputs.allocation);
  if (Math.abs(total - 100) > 0.5) {
    out.push({
      kind: "context",
      title: `Your mix adds up to ${Math.round(total)}%`,
      message: "The plan treats what you chose as shares of 100%.",
    });
  }

  // The cost of waiting: same target, same date, one year less of investing.
  if (inputs.horizonYears > 1) {
    const later = neededMonthly({ requiredSip: requiredSip(r.requiredCorpus, inputs.currentSavings, r.blendedReturn, inputs.horizonYears - 1) });
    out.push({
      kind: "context",
      title: "The cost of waiting",
      message: `Wait a year and you'll need ${inr(later)} a month instead of ${inr(neededMonthly(r))}. Starting now is cheaper.`,
    });
  }

  out.push({
    kind: "context",
    title: "Prices go up",
    message: `${inr(inputs.targetToday)} today is about ${inr(r.requiredCorpus)} in ${years}, so we plan for ${inr(r.requiredCorpus)}.`,
  });

  return out.slice(0, 4);
}

const TONE_TEXT: Record<GapTone, string> = { pos: "text-pos", cau: "text-cau", neg: "text-neg" };

/** The mark in front of a reason. The verdict wears the goal's own status
    icon. A caution gets an amber "look here". Context gets a quiet dot, so
    every title starts on the same edge. */
function Mark({ reason }: { reason: Reason }) {
  if (reason.kind === "verdict" && reason.level) {
    return <StatusIcon level={reason.level} size={18} className={TONE_TEXT[gapTone(reason.level)]} />;
  }
  if (reason.kind === "caution") {
    return (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" role="img" aria-label="Worth a second look" className="flex-none text-cau">
        <circle cx="8" cy="8" r="5.75" />
        <path d="M8 5v3.4" />
        <path d="M8 10.9v.1" />
      </svg>
    );
  }
  return <span aria-hidden className="ml-[7px] mt-[7px] block h-1 w-1 flex-none rounded-full bg-text-3" />;
}

/** Folded, the verdict and any caution show; the rest waits behind "More". */
export default function Insights({ r, inputs, expanded = true }: { r: PlanResult; inputs: PlanInputs; expanded?: boolean }) {
  const all = generate(inputs, r);
  const list = expanded ? all : all.filter((x, i) => i === 0 || x.kind === "caution");
  return (
    <ul className="divide-y divide-line border-y border-line">
      {list.map((x) => (
        <li key={x.title} className="grid grid-cols-[1.125rem_minmax(0,1fr)] gap-x-3 py-3">
          <span className="pt-[3px]">
            <Mark reason={x} />
          </span>
          <div className="min-w-0">
            <p className="text-body font-medium text-text">{x.title}</p>
            <p className="num mt-0.5 max-w-[68ch] text-pretty text-support text-text-2">{x.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
