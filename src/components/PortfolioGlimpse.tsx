import { allocationTotal, bandWeights, blendedReturn } from "../lib/finance";
import { ASSET_CLASSES, FUND_MAP } from "../lib/funds";
import { mixLabel } from "../lib/portfolios";
import { actions, useStore } from "../store";
import { sectionLabel } from "../ui";
import RiskMeter from "./RiskMeter";

/**
 * The plan page's read-only window onto the portfolio: risk dial, the mix as
 * a class bar, and a heatmap of the funds. No building here — every path to
 * change something leads to the Portfolio tab, so the plan page stays about
 * goals and the portfolio room stays about the mix.
 */

interface Tile {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  weight: number;
}

/** Slice-and-dice treemap: split the items into two weight-balanced halves,
 *  split the rectangle along its longer axis, recurse. Good aspect ratios for
 *  the handful of funds a mix holds, in a few lines of arithmetic. */
function layoutTiles(items: { id: string; weight: number }[], x: number, y: number, w: number, h: number): Tile[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ id: items[0].id, x, y, w, h, weight: items[0].weight }];
  const total = items.reduce((s, i) => s + i.weight, 0);
  let acc = 0;
  let split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].weight;
    split = i + 1;
    if (acc >= total / 2) break;
  }
  const a = items.slice(0, split);
  const b = items.slice(split);
  const fa = a.reduce((s, i) => s + i.weight, 0) / total;
  if (w >= h) {
    return [...layoutTiles(a, x, y, w * fa, h), ...layoutTiles(b, x + w * fa, y, w * (1 - fa), h)];
  }
  return [...layoutTiles(a, x, y, w, h * fa), ...layoutTiles(b, x, y + h * fa, w, h * (1 - fa))];
}

/** 5-yr CAGR → the green-to-red ramp (step index 0..4), or null when the
 *  fund is too young to judge. */
function returnStep(fiveYr: number | undefined): number | null {
  if (fiveYr == null || fiveYr <= 0) return null;
  if (fiveYr >= 16) return 0;
  if (fiveYr >= 12) return 1;
  if (fiveYr >= 8) return 2;
  if (fiveYr >= 4) return 3;
  return 4;
}

const STEP_BG = ["var(--risk-1)", "var(--risk-2)", "var(--risk-3)", "var(--risk-4)", "var(--risk-5)"];
/** Dark ink on the light middle steps, warm white on the deep ends. */
const STEP_INK = ["rgb(var(--on-night))", "rgb(var(--text))", "rgb(var(--text))", "rgb(var(--text))", "rgb(var(--on-night))"];

function MixHeatmap({ alloc, onOpen }: { alloc: Record<string, number>; onOpen: () => void }) {
  const items = Object.entries(alloc)
    .filter(([, w]) => w > 0.5)
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight);
  if (items.length === 0) return null;
  const tiles = layoutTiles(items, 0, 0, 100, 100);
  return (
    <div
      className="relative h-40 w-full overflow-hidden rounded-control"
      role="img"
      aria-label="Portfolio heatmap: each fund sized by its share of the mix, coloured by its five-year return"
    >
      {tiles.map((t) => {
        const fund = FUND_MAP[t.id];
        const step = returnStep(fund?.fiveYr);
        const name = fund?.name ?? t.id;
        return (
          <div
            key={t.id}
            className="absolute p-[1.5px]"
            style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }}
          >
            <button
              type="button"
              onClick={onOpen}
              title={`${name} · ${Math.round(t.weight)}% of the mix${fund?.fiveYr ? ` · ${fund.fiveYr}% over 5y` : ""}`}
              className="flex h-full w-full flex-col items-start justify-between overflow-hidden rounded-[5px] p-1.5 text-left"
              style={
                step == null
                  ? { background: "rgb(var(--surface-2))", color: "rgb(var(--text-2))" }
                  : { background: STEP_BG[step], color: STEP_INK[step] }
              }
            >
              <span className="max-w-full truncate text-index font-medium leading-tight">{name}</span>
              <span className="num text-caption font-medium">{Math.round(t.weight)}%</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function PortfolioGlimpse() {
  const s = useStore();
  const total = allocationTotal(s.portfolio);
  const openPortfolio = () => actions.setTab("portfolio");

  if (total <= 0) {
    return (
      <section className="min-w-0 rounded-card border border-line bg-surface p-5 text-center">
        <p className="text-row font-medium">Not invested yet</p>
        <p className="mx-auto mt-1 max-w-xs text-support text-text-2">
          Pick a mix and your goals start growing toward their dates.
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
  const scale = total > 0 ? 100 / total : 1;
  const segs = [
    { label: "Equity", v: bands.equity * scale, color: ASSET_CLASSES.equity.color },
    { label: "Debt", v: bands.debt * scale, color: ASSET_CLASSES.debt.color },
    { label: "Gold", v: bands.gold * scale, color: ASSET_CLASSES.gold.color },
  ].filter((x) => x.v > 0.5);
  const expected = Math.round(blendedReturn(s.portfolio) * 1000) / 10;

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-support text-text">{mixLabel(s.portfolio)}</span>
        <button
          onClick={openPortfolio}
          className="text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
        >
          Manage →
        </button>
      </div>

      <div className="p-3.5 sm:p-4">
        <RiskMeter />

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

        {/* The funds, as a heatmap */}
        <div className="mt-4">
          <span className={sectionLabel}>The funds</span>
          <div className="mt-1.5">
            <MixHeatmap alloc={s.portfolio} onOpen={openPortfolio} />
          </div>
          <p className="mt-1.5 text-caption text-text-2">Sized by share of the mix · coloured by 5-year return</p>
        </div>

        <p className="mt-3 border-t border-line pt-2.5 text-caption text-text-2">
          Expected return <span className="num font-medium text-text">~{expected}%</span> a year for this mix.
          Illustrative, not advice.
        </p>
      </div>
    </section>
  );
}
