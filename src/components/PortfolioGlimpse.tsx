import { useState } from "react";
import { allocationTotal, bandWeights, blendedReturn, computePlan } from "../lib/finance";
import { ASSET_CLASSES } from "../lib/funds";
import { formatINR } from "../lib/format";
import { categoryCode } from "../lib/holdings";
import { equityShare, mixLabel } from "../lib/portfolios";
import { squarify } from "../lib/treemap";
import { actions, goalShareFraction, goalsByPriority, planInputsForGoal, totalCapital, useStore } from "../store";
import { sectionLabel } from "../ui";
import RiskMeter from "./RiskMeter";

/**
 * The plan page's read-only window onto the whole portfolio. Two facts up
 * top (the mix by class, the risk ceiling with expected return), then one
 * heatmap of everything you own with two views: by holding (cash and every
 * instrument, sized by value) and by goal (the same money, split by the
 * goal it serves). No dials, no building — Manage leads to the Portfolio
 * tab, holdings tiles lead to Money.
 */

interface TreemapItem {
  key: string;
  label: string;
  amount: number;
  bg: string;
  ink: string;
  title: string;
  onClick?: () => void;
}

/** Squarified tiles (lib/treemap), so a third or a tenth goal still gets a
 *  near-square tile. The map grows taller with the count, and a tile prints
 *  only what it has room for: label and figure, label alone, or just its
 *  tooltip. */
function Treemap({ items, ariaLabel }: { items: TreemapItem[]; ariaLabel: string }) {
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
        const showFigure = px >= 44 && wPct >= 16;
        return (
          <div
            key={t.key}
            className="absolute p-[1.5px]"
            style={{ left: `${t.x / 2}%`, top: `${t.y}%`, width: `${wPct}%`, height: `${t.h}%` }}
          >
            <Tag
              {...(item.onClick ? { type: "button" as const, onClick: item.onClick } : {})}
              title={item.title}
              className="flex h-full w-full flex-col items-start justify-between overflow-hidden rounded-[5px] p-1.5 text-left"
              style={{ background: item.bg, color: item.ink }}
            >
              {showLabel && <span className="max-w-full truncate text-index font-medium leading-tight">{item.label}</span>}
              {showFigure && <span className="num text-caption font-medium">{formatINR(item.amount)}</span>}
            </Tag>
          </div>
        );
      })}
    </div>
  );
}

/** The asset-class colour code (lib/holdings, tokens in index.css): tiles
 *  are the hue's tint with the hue as ink; dots and the share bar use the
 *  hue itself. Colour states WHAT it is, never how it is doing — manual
 *  entries carry no return data, and pretending otherwise would be theatre. */

export default function PortfolioGlimpse() {
  const s = useStore();
  const [view, setView] = useState<"holdings" | "goals">("holdings");
  const total = allocationTotal(s.portfolio);
  const openPortfolio = () => actions.setTab("portfolio");
  const openMoney = () => actions.setTab("money");

  if (total <= 0) {
    return (
      <section className="min-w-0 rounded-card border border-line bg-surface p-5 text-center">
        <p className="text-row font-medium">Not invested yet</p>
        <p className="mx-auto mt-1 max-w-xs text-support text-text-2">
          Pick a portfolio and your goals start growing toward their dates.
        </p>
        <button
          onClick={openPortfolio}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-control bg-accent-fill px-5 text-support font-medium text-on-accent transition hover:bg-accent-fill-hi"
        >
          Build the portfolio
        </button>
      </section>
    );
  }

  const bands = bandWeights(s.portfolio);
  const scale = 100 / total;
  const segs = [
    { label: "Equity", v: bands.equity * scale, color: ASSET_CLASSES.equity.color },
    { label: "Debt", v: bands.debt * scale, color: ASSET_CLASSES.debt.color },
    { label: "Gold", v: bands.gold * scale, color: ASSET_CLASSES.gold.color },
  ].filter((x) => x.v > 0.5);
  const expected = Math.round(blendedReturn(s.portfolio) * 1000) / 10;

  // View 1 — everything you own, in rupees.
  const holdingItems: TreemapItem[] = [
    ...(s.currentSavings > 0
      ? [
          {
            key: "cash",
            label: "Cash",
            amount: s.currentSavings,
            ...categoryCode("Cash"),
            title: `Cash · ${formatINR(s.currentSavings)} · in the bank`,
            onClick: openMoney,
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
          title: `${h.name} · ${formatINR(h.amount)} · ${h.type}`,
          onClick: openMoney,
        };
      }),
  ];

  // View 2 — the same money, split by the goal it serves.
  const capital = totalCapital(s);
  const goalItems: TreemapItem[] = goalsByPriority(s).map((g) => {
    const amount = capital * goalShareFraction(s, g.id);
    const onTrack = computePlan(planInputsForGoal(s, g)).onTrack;
    return {
      key: g.id,
      label: g.name,
      amount,
      bg: onTrack ? "rgb(var(--pos-bg))" : "rgb(var(--cau-bg))",
      ink: onTrack ? "rgb(var(--pos))" : "rgb(var(--cau))",
      title: `${g.name} · ${formatINR(amount)} set aside · ${onTrack ? "on track" : "needs a change"}`,
      // Selecting a tile opens that goal's workbench beside this pane.
      onClick: () => actions.setCurrentGoal(g.id),
    };
  });

  // Highlights: the four numbers a client checks first.
  const largest = [...holdingItems].sort((a, b) => b.amount - a.amount)[0];
  const onTrackCount = goalItems.filter((i) => i.bg === "rgb(var(--pos-bg))").length;
  const shareOf = (amount: number) => (capital > 0 ? Math.round((amount / capital) * 100) : 0);
  const listed = [...holdingItems].sort((a, b) => b.amount - a.amount);
  const unfunded = goalItems.filter((i) => i.amount <= 0).map((i) => i.label);

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-support text-text">{mixLabel(s.portfolio)} portfolio</span>
          <span className="num text-caption text-text-2">{Math.round(equityShare(s.portfolio) * 100)}% in stocks</span>
        </span>
        <button
          onClick={openPortfolio}
          className="text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
        >
          Manage →
        </button>
      </div>

      <div className="p-4">
        {/* Highlights: value, pace, weight, progress — the client's first four. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="text-eyebrow uppercase text-text-3">Portfolio value</dt>
            <dd className="num mt-0.5 text-row font-medium">{formatINR(capital)}</dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-text-3">Expected pace</dt>
            <dd className="num mt-0.5 text-row font-medium">~{expected}% a year</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-eyebrow uppercase text-text-3">Largest holding</dt>
            <dd className="mt-0.5 truncate text-row font-medium">
              {largest ? `${largest.label} · ${shareOf(largest.amount)}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-text-3">Goals on track</dt>
            <dd className="num mt-0.5 text-row font-medium">
              {onTrackCount} of {goalItems.length}
            </dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-line pt-3.5" />
        {/* The literal meter, read-only: risk is changed on the Portfolio tab. */}
        <RiskMeter readOnly />

        {/* The mix, by asset class */}
        <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden>
          {segs.map((x) => (
            <div key={x.label} style={{ width: `${x.v}%`, background: x.color }} />
          ))}
        </div>
        <p className="num mt-1.5 text-caption text-text-2">
          {segs.map((x, i) => (
            <span key={x.label}>
              {i > 0 && <span className="mx-1 text-text-3">·</span>}
              {x.label} <span className="font-medium text-text">{Math.round(x.v)}%</span>
            </span>
          ))}
        </p>



        {/* The whole portfolio, one map, two views */}
        <div className="mt-4">
          <span className={sectionLabel}>Portfolio heatmap</span>
          <div className="mt-1.5">
            {view === "holdings" ? (
              <Treemap items={holdingItems} ariaLabel="Everything you own, each tile sized by its value" />
            ) : (
              <Treemap items={goalItems} ariaLabel="Your money split by the goal it serves; green is on track, amber needs a change" />
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5">
              {(["holdings", "goals"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`inline-flex h-6 items-center rounded-full px-2.5 text-caption transition ${
                    view === v ? "bg-surface text-text" : "text-text-2 hover:text-text"
                  }`}
                >
                  {v === "holdings" ? "What you hold" : "By goal"}
                </button>
              ))}
            </div>
            <span className="truncate text-caption text-text-2">
              {view === "holdings" ? "Sized by value" : "Green on track · amber needs a change"}
            </span>
          </div>
          {/* A goal with nothing set aside has no tile; it is named, never lost. */}
          {view === "goals" && unfunded.length > 0 && (
            <p className="mt-1.5 text-caption text-text-2">Nothing set aside yet: {unfunded.join(", ")}.</p>
          )}
        </div>

        {/* Every holding with its share of the portfolio. */}
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className={sectionLabel}>Share of portfolio</span>
            <button onClick={openMoney} className="text-caption text-text-2 transition hover:text-text">
              Manage holdings →
            </button>
          </div>
          {/* One bar, the whole portfolio: each segment a holding, carrying
              its class hue at full strength. The rows beneath share the dots. */}
          <div className="mt-2.5 flex h-3.5 gap-[2px] overflow-hidden rounded-[5px]" aria-hidden>
            {listed.map((h) => (
              <div
                key={h.key}
                title={`${h.label} · ${shareOf(h.amount)}%`}
                style={{ width: `${Math.max(shareOf(h.amount), 1.5)}%`, background: h.ink }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {listed.slice(0, 5).map((h) => (
              <li key={h.key} className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: h.ink }} aria-hidden />
                  <span className="truncate text-support text-text">{h.label}</span>
                </span>
                <span className="num flex-none text-support">
                  <span className="font-medium text-text">{shareOf(h.amount)}%</span>
                  <span className="mx-1.5 text-text-3">·</span>
                  <span className="text-text-2">{formatINR(h.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
          {listed.length > 5 && (
            <button onClick={openMoney} className="mt-2 text-caption text-text-2 transition hover:text-text">
              +{listed.length - 5} more in Money →
            </button>
          )}
        </div>

        <p className="mt-3 border-t border-line pt-2.5 text-caption text-text-2">Illustrative, not advice.</p>
      </div>
    </section>
  );
}
