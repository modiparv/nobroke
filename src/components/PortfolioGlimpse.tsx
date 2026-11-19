import { useState } from "react";
import { allocationTotal, bandWeights, blendedReturn, computePlan } from "../lib/finance";
import { ASSET_CLASSES } from "../lib/funds";
import { formatINR } from "../lib/format";
import { GAP_LABEL, gapLevel, gapTone, type GapLevel, type GapTone } from "../lib/gap";
import { categoryCode } from "../lib/holdings";
import { FOCUS, holdingFocus } from "../lib/links";
import { equityShare, mixLabel } from "../lib/portfolios";
import { riskBandLabel } from "../lib/risk";
import { squarify } from "../lib/treemap";
import { actions, capitalForGoal, goalsByPriority, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnGhost } from "../ui";
import { StatusIcon } from "./StatusPill";

/**
 * The plan page's read-only window onto the whole portfolio. The mix by
 * class and three facts about it up top, then one map of everything you own with
 * two views: what you hold (cash and every investment, sized by value) and
 * by goal (the same money, split by the goal it serves). The list under
 * the map is its key: the same items with their share and amount in
 * readable text, each a link to the exact thing. No dials, no building.
 */

const label = "text-support font-medium text-text-2";
const textLink = "text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2";
const TONE_TEXT: Record<GapTone, string> = { pos: "text-pos", cau: "text-cau", neg: "text-neg" };

interface MapItem {
  key: string;
  label: string;
  amount: number;
  bg: string;
  ink: string;
  title: string;
  /** Set on a goal: its status, shown as an icon in the tile and as icon
      and word in the list, so it never rests on the tile's colour alone. */
  level?: GapLevel;
  onClick?: () => void;
}

/** Squarified tiles (lib/treemap), so a third or a tenth goal still gets a
 *  near-square tile. The map grows taller with the count, and a tile prints
 *  only what it has room for: label and figure, label alone, or just its
 *  tooltip. Tile labels are chart labels (12px); the list below the map
 *  carries the same words at reading size. */
function Treemap({ items, ariaLabel }: { items: MapItem[]; ariaLabel: string }) {
  const sorted = [...items].filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  if (sorted.length === 0) return null;
  const heightPx = sorted.length <= 2 ? 176 : sorted.length <= 4 ? 216 : 264;
  // The map renders about twice as wide as it is tall, so the layout runs
  // in a 200x100 space and x is halved back to percent: tiles that come out
  // square here come out square on screen.
  const tiles = squarify(sorted, 0, 0, 200, 100);
  const byKey = Object.fromEntries(sorted.map((i) => [i.key, i]));
  return (
    <div className="relative w-full overflow-hidden rounded-control" style={{ height: heightPx }} role="img" aria-label={ariaLabel}>
      {tiles.map((t) => {
        const item = byKey[t.key];
        const Tag = item.onClick ? "button" : "div";
        const px = (t.h / 100) * heightPx;
        const wPct = t.w / 2;
        const showLabel = px >= 18 && wPct >= 9;
        const showFigure = px >= 48 && wPct >= 18;
        return (
          <div
            key={t.key}
            className="absolute p-[1.5px]"
            style={{ left: `${t.x / 2}%`, top: `${t.y}%`, width: `${wPct}%`, height: `${t.h}%` }}
          >
            <Tag
              // The list under the map is the keyboard's way in; the tiles are for a pointer.
              {...(item.onClick ? { type: "button" as const, onClick: item.onClick, tabIndex: -1 } : {})}
              title={item.title}
              className={`flex h-full w-full flex-col items-start justify-between overflow-hidden rounded-[5px] py-1.5 text-left ${wPct < 18 ? "px-1" : "px-1.5"}`}
              style={{ background: item.bg, color: item.ink }}
            >
              {showLabel && (
                <span className="flex max-w-full items-center gap-1 text-index font-medium leading-tight">
                  {item.level && wPct >= 16 && <StatusIcon level={item.level} size={12} />}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
              {showFigure && <span className="num whitespace-nowrap text-support font-medium">{formatINR(item.amount)}</span>}
            </Tag>
          </div>
        );
      })}
    </div>
  );
}

/** The asset-class colour code (lib/holdings, tokens in index.css): tiles
 *  are the hue's tint with the hue as ink; dots use the hue itself. Colour
 *  states WHAT a holding is, never how it is doing: manual entries carry no
 *  return data, and pretending otherwise would be theatre. */

export default function PortfolioGlimpse() {
  const s = useStore();
  const [view, setView] = useState<"holdings" | "goals">("holdings");
  const total = allocationTotal(s.portfolio);
  // Every link lands on the exact thing: the mix on Portfolio, or one
  // holding (or the cash field, or the investments list) on Money.
  const openPortfolio = () => actions.setTab("portfolio", { focus: FOCUS.mix });
  const openMoney = (focus: string = FOCUS.investments) => actions.setTab("money", { focus });

  if (total <= 0) {
    return (
      <section className="min-w-0 rounded-card border border-line bg-surface p-5 text-center">
        <h2 className="text-section font-medium text-text">Not invested yet</h2>
        <p className="mx-auto mt-1 max-w-xs text-support text-text-2">With no mix chosen, the plan assumes your money does not grow.</p>
        <button type="button" onClick={openPortfolio} className={`${btnGhost} mt-4`}>
          Pick a mix
        </button>
      </section>
    );
  }

  const bands = bandWeights(s.portfolio);
  const scale = 100 / total;
  const segs = [
    { label: "stocks", v: bands.equity * scale, color: ASSET_CLASSES.equity.color },
    { label: "bonds", v: bands.debt * scale, color: ASSET_CLASSES.debt.color },
    { label: "gold", v: bands.gold * scale, color: ASSET_CLASSES.gold.color },
  ].filter((x) => x.v > 0.5);
  const expected = Math.round(blendedReturn(s.portfolio) * 1000) / 10;

  // View 1: everything you own, in rupees.
  const holdingItems: MapItem[] = [
    ...(s.currentSavings > 0
      ? [
          {
            key: "cash",
            label: "Cash",
            amount: s.currentSavings,
            ...categoryCode("Cash"),
            title: `Cash: ${formatINR(s.currentSavings)} in the bank`,
            onClick: () => openMoney(FOCUS.cash),
          },
        ]
      : []),
    ...s.externalHoldings
      .filter((h) => h.amount > 0)
      .map((h) => {
        const tone = categoryCode(h.category);
        return {
          key: h.id,
          label: h.name,
          amount: h.amount,
          ...tone,
          title: `${h.name}: ${formatINR(h.amount)} (${h.type})`,
          onClick: () => openMoney(holdingFocus(h.id)),
        };
      }),
  ];

  // View 2: the same money, split by the goal it serves.
  const capital = totalCapital(s);
  const goalItems: MapItem[] = goalsByPriority(s).map((g) => {
    const amount = capitalForGoal(s, g.id);
    const level = gapLevel(computePlan(planInputsForGoal(s, g)));
    const tone = gapTone(level);
    return {
      key: g.id,
      label: g.name,
      amount,
      level,
      bg: `rgb(var(--${tone}-bg))`,
      ink: `rgb(var(--${tone}))`,
      title: `${g.name}: ${formatINR(amount)} set aside, ${GAP_LABEL[level].toLowerCase()}`,
      // Selecting a goal opens its workbench beside this pane.
      onClick: () => actions.setCurrentGoal(g.id),
    };
  });

  const shareOf = (amount: number) => (capital > 0 ? Math.round((amount / capital) * 100) : 0);
  const byValue = [...holdingItems].sort((a, b) => b.amount - a.amount);
  // Holdings: the five largest, the rest a link away. Goals: every one, in
  // priority order, including a goal with nothing set aside (it has no tile,
  // so the list is where it is named).
  const rows = view === "holdings" ? byValue.slice(0, 5) : goalItems;
  const hidden = view === "holdings" ? byValue.length - rows.length : 0;

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      <div className="border-b border-line px-4 pb-3 pt-1.5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-section font-medium text-text">Your mix</h2>
          <button type="button" onClick={openPortfolio} className={`${textLink} inline-flex h-11 flex-none items-center whitespace-nowrap`}>
            Change your mix
          </button>
        </div>
        <p className="num -mt-1.5 text-support text-text-2">
          {mixLabel(s.portfolio)}, {Math.round(equityShare(s.portfolio) * 100)}% in stocks
        </p>
      </div>

      <div className="p-4 sm:p-5">
        {/* The mix, by asset class. The key under the bar is in the bar's
            own order, so it also reads without the colours. */}
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {segs.map((x) => (
            <div key={x.label} style={{ width: `${x.v}%`, background: x.color }} />
          ))}
        </div>
        <ul className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-support text-text-2">
          {segs.map((x) => (
            <li key={x.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: x.color }} />
              <span>
                <span className="font-medium text-text">{Math.round(x.v)}%</span> {x.label}
              </span>
            </li>
          ))}
        </ul>

        {/* Three facts about the mix, one per line. The risk level is a word
            here; the meter itself lives on the Portfolio tab, where it can
            be changed. */}
        <dl className="mt-4 divide-y divide-line border-y border-line">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-support text-text-2">Your risk level</dt>
            <dd className="whitespace-nowrap text-row font-medium text-text">{riskBandLabel(s.riskAppetite)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-support text-text-2">Expected growth</dt>
            <dd className="num whitespace-nowrap text-row font-medium text-text">About {expected}% a year</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-support text-text-2">Cash and investments</dt>
            <dd className="num whitespace-nowrap text-row font-medium text-text">{formatINR(capital)}</dd>
          </div>
        </dl>

        {/* The whole portfolio: one map, two views, and its key as a list. */}
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h3 className={label}>Where your money is</h3>
            <div className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5" role="group" aria-label="Show your money by">
              {(["holdings", "goals"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-support transition ${
                    view === v ? "bg-accent-fill text-on-accent" : "text-text-2 hover:text-text"
                  }`}
                >
                  {v === "holdings" ? "What you hold" : "By goal"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            {view === "holdings" ? (
              <Treemap items={holdingItems} ariaLabel="Everything you own, each tile sized by its value. The list below has the same amounts." />
            ) : (
              <Treemap items={goalItems} ariaLabel="Your money split by the goal it serves. The list below has each goal's status and amount." />
            )}
          </div>

          <ul className="mt-2 divide-y divide-line">
            {rows.map((h) => (
              <li key={h.key}>
                <button
                  type="button"
                  onClick={h.onClick}
                  title={h.title}
                  className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-control px-2 py-2 text-left transition hover:bg-surface-2"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {!h.level && <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: h.ink }} aria-hidden />}
                    <span className="min-w-0">
                      <span className="block truncate text-support text-text">{h.label}</span>
                      {h.level && (
                        <span className={`flex items-center gap-1 text-support font-medium ${TONE_TEXT[gapTone(h.level)]}`}>
                          <StatusIcon level={h.level} size={14} />
                          {GAP_LABEL[h.level]}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="num flex-none whitespace-nowrap text-support">
                    <span className="font-medium text-text">{shareOf(h.amount)}%</span>
                    <span className="ml-2.5 inline-block min-w-[4.25rem] text-right text-text-2">{formatINR(h.amount)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {view === "holdings" && (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
              <button type="button" onClick={() => openMoney()} className={`${textLink} inline-flex h-11 items-center`}>
                Edit your investments
              </button>
              {hidden > 0 && (
                <button type="button" onClick={() => openMoney()} className="inline-flex h-11 items-center text-support text-text-2 underline underline-offset-2 transition hover:text-text">
                  {hidden} more in Money
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
