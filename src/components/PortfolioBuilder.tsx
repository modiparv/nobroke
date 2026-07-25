import { useState } from "react";
import { ASSET_CLASSES, CATEGORY_FILTERS, FUNDS, FUND_MAP } from "../lib/funds";
import { MODEL_PORTFOLIOS } from "../lib/portfolios";
import { allocationTotal, bandWeights, blendedReturn } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import type { Allocation, AssetClassId, RiskProfile } from "../lib/types";
import { actions, recommendedPortfolio, useStore } from "../store";
import { sectionLabel } from "../ui";

const CLASS_ORDER: AssetClassId[] = ["equity", "hybrid", "gold", "debt"];

/**
 * An illustrative spread around the blended return, so we never print a point
 * estimate (spec section 5). These multipliers are a presentation band, NOT a
 * modelled confidence interval; a real p10/p90 needs the Monte Carlo work in a
 * later phase, and the copy says "not guaranteed" for that reason.
 */
const BAND_LOW = 0.7;
const BAND_HIGH = 1.15;

function growthBand(ret: number) {
  const low = ret * BAND_LOW;
  const high = ret * BAND_HIGH;
  return {
    low,
    high,
    tenYearLow: 100000 * Math.pow(1 + low, 10),
    tenYearHigh: 100000 * Math.pow(1 + high, 10),
  };
}

function Marker() {
  return <span className="inline-block h-1.5 w-1.5 flex-none bg-text-3" />;
}

/**
 * The ONE portfolio every goal shares. There's no per-goal basket anymore — the
 * whole monthly pool grows in this single mix, and each goal simply draws its
 * share of that money. We surface an advisor recommendation (a mix matched to
 * the goals' blended horizon) and a near-term mismatch warning.
 */
export default function PortfolioBuilder() {
  const s = useStore();
  const alloc: Allocation = s.portfolio;
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<"all" | AssetClassId>("all");
  const [dragOver, setDragOver] = useState(false);

  const total = allocationTotal(alloc);
  const bands = bandWeights(alloc);
  const ret = blendedReturn(alloc);
  const band = growthBand(ret);
  // The entire monthly pool funds this single portfolio (all goals share it).
  const sip = s.monthlySip;
  const amountFor = (id: string) => (total > 0 ? (alloc[id] / total) * sip : 0);

  const setAlloc = (a: Allocation, profile: RiskProfile | null) => actions.setPortfolio(a, profile);
  // Weights are always kept summing to 100 so the basket is strictly 100%.
  const normalizeTo100 = (a: Allocation): Allocation => {
    const entries = Object.entries(a);
    const t = entries.reduce((sum, [, v]) => sum + (v > 0 ? v : 0), 0);
    if (t <= 0) return {};
    return Object.fromEntries(entries.map(([k, v]) => [k, v > 0 ? (v / t) * 100 : 0]));
  };
  const addFund = (id: string) => {
    if (id in alloc) return;
    const ids = Object.keys(alloc);
    if (ids.length === 0) {
      setAlloc({ [id]: 100 }, null);
      return;
    }
    const share = 100 / (ids.length + 1);
    const rest = 100 - share;
    const otherTotal = ids.reduce((sum, k) => sum + (alloc[k] ?? 0), 0);
    const next: Allocation = { [id]: share };
    for (const k of ids) next[k] = otherTotal > 0 ? ((alloc[k] ?? 0) / otherTotal) * rest : rest / ids.length;
    setAlloc(next, null);
  };
  // Dragging a slider sets this fund's %, and the others rebalance to keep 100%.
  const setWeight = (id: string, w: number) => {
    const ids = Object.keys(alloc);
    if (ids.length <= 1) {
      setAlloc({ [id]: 100 }, null);
      return;
    }
    const wv = Math.max(0, Math.min(100, w));
    const others = ids.filter((k) => k !== id);
    const otherTotal = others.reduce((sum, k) => sum + (alloc[k] ?? 0), 0);
    const rest = 100 - wv;
    const next: Allocation = { [id]: wv };
    for (const k of others) next[k] = otherTotal > 0 ? ((alloc[k] ?? 0) / otherTotal) * rest : rest / others.length;
    setAlloc(next, null);
  };
  const removeFund = (id: string) => {
    const next = { ...alloc };
    delete next[id];
    setAlloc(normalizeTo100(next), null);
  };
  const applyPreset = (key: RiskProfile) => setAlloc(normalizeTo100(MODEL_PORTFOLIOS[key].allocation), key);

  const filtered = FUNDS.filter(
    (f) => (cat === "all" || f.assetClass === cat) && f.name.toLowerCase().includes(search.toLowerCase()),
  );
  const holdings = Object.keys(alloc).sort(
    (a, b) => CLASS_ORDER.indexOf(FUND_MAP[a]?.assetClass) - CLASS_ORDER.indexOf(FUND_MAP[b]?.assetClass),
  );
  const equityShare = total > 0 ? bands.equity / total : 0;
  const equityHeavy = total > 0 && equityShare > 0.7 && bands.debt / Math.max(total, 1) < 0.1;

  // ---- Advisor overlay: a mix matched to the goals' blended horizon ----
  const rec = recommendedPortfolio(s.goals);
  const recLabel = MODEL_PORTFOLIOS[rec.profile].label;
  const matchesRec = s.portfolioProfile === rec.profile;
  const soonGoal = s.goals.length ? [...s.goals].sort((a, b) => a.horizonYears - b.horizonYears)[0] : undefined;
  const nearTermRisk = !!soonGoal && soonGoal.horizonYears <= 3 && equityShare > 0.55;

  // Stacked allocation bar — scale segments so an over-100 mix still fills the bar.
  const scale = total > 100 ? 100 / total : 1;
  const segs = [
    { label: "Equity", v: bands.equity, color: ASSET_CLASSES.equity.color },
    { label: "Debt", v: bands.debt, color: ASSET_CLASSES.debt.color },
    { label: "Gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
  ].filter((x) => x.v > 0.01);

  return (
    <div>

      {/* Advisor pick — match the single mix to the goals' blended horizon */}
      {s.goals.length > 0 && !matchesRec && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <span className="text-support text-ink">
            A {recLabel.toLowerCase()} mix suits your timeline better.
          </span>
          {!matchesRec && (
            <button
              onClick={actions.recommendPortfolio}
              className="rounded-full border border-line px-3 py-1.5 text-support text-ink transition hover:border-ink"
            >
              Use this
            </button>
          )}
        </div>
      )}

      {nearTermRisk && soonGoal && (
        <p className="mb-4 rounded-lg border border-ink/15 bg-surface-2 px-3 py-2 text-xs text-ink">
          ⚠️ <span className="font-medium">{soonGoal.name}</span> is only {soonGoal.horizonYears}{" "}
          {soonGoal.horizonYears === 1 ? "year" : "years"} away. This mix leans heavily on stocks, which can dip suddenly.
          Pick a calmer ready-made mix, or put a bit more money into this goal so a bad month can't derail it.
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* ---- Funds library (drag source) ---- */}
        <div>
          <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
            <Marker /> Pick your own
          </span>
          <p className="mb-2 mt-1 text-caption text-muted">Optional. Most people just tap a ready-made mix on the right.</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search funds"
            className="mt-2 h-9 w-full rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-ink"
          />
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  cat === c.id ? "bg-surface-2 text-text" : "border border-line text-muted hover:border-ink/40"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="no-scrollbar mt-3 flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {filtered.map((f) => {
              const ac = ASSET_CLASSES[f.assetClass];
              const added = f.id in alloc;
              return (
                <div
                  key={f.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", f.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => (added ? removeFund(f.id) : addFund(f.id))}
                  className={`flex cursor-grab select-none items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 transition hover:border-brand active:cursor-grabbing ${
                    added ? "border-brand" : "border-line"
                  }`}
                >
                  <span className="h-6 w-1 flex-none rounded-full" style={{ background: ac.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-support font-medium leading-tight">{f.name}</div>
                    <div className="truncate text-caption text-muted">{ac.label}</div>
                  </div>
                  <span className={`flex-none rounded-full px-2 py-0.5 text-index font-medium uppercase tracking-wide ${added ? "bg-brand text-on-accent" : "border border-line text-muted"}`}>
                    {added ? "Added" : "Add"}
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted">No funds match “{search}”.</p>}
          </div>
        </div>

        {/* ---- Basket (drop zone) ---- */}
        <div
          className={`rounded-2xl border bg-surface p-4 transition ${dragOver ? "border-brand ring-2 ring-brand/40" : "border-line"}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const id = e.dataTransfer.getData("text/plain");
            if (FUND_MAP[id]) addFund(id);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Your mix
            </span>
            <span className="text-caption uppercase tracking-wide">
              <span className="font-medium text-ink">{formatINR(sip)}/mo</span>
            </span>
          </div>

          {/* Minimalist stacked allocation bar */}
          <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-line">
            {segs.map((sg) => (
              <div
                key={sg.label}
                className="h-full transition-[width] duration-500 ease-out"
                style={{ width: `${sg.v * scale}%`, background: sg.color }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-index uppercase tracking-wide">
            {[
              { label: "Stocks", v: bands.equity, color: ASSET_CLASSES.equity.color },
              { label: "Bonds", v: bands.debt, color: ASSET_CLASSES.debt.color },
              { label: "Gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
            ].map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                {l.label} {Math.round(l.v)}%
              </span>
            ))}
          </div>

          {total === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-5 text-center">
              <p className="text-sm font-medium text-ink">Your mix is empty</p>
              <p className="mt-1 text-caption text-muted">Tap a fund on the left to add it, or pick a ready-made mix below to fill it for you.</p>
            </div>
          )}

          {/* Ranges, never point estimates (section 5). */}
          {total > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <p className="text-support text-ink">
                Historically <span className="num">{formatPct(band.low, 0)}</span> to{" "}
                <span className="num">{formatPct(band.high, 0)}</span> a year. Not guaranteed.
              </p>
              <p className="mt-1 text-support text-muted">
                ₹1 lakh today could be <span className="num">{formatINR(band.tenYearLow)}</span> to{" "}
                <span className="num">{formatINR(band.tenYearHigh)}</span> in 10 years.
              </p>
            </div>
          )}

          {/* Presets — plain-language quick mixes */}
          <div className="mt-4">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Ready-made mixes (easiest)
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["steady", "balanced", "bold"] as RiskProfile[]).map((key) => {
                const active = s.portfolioProfile === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`rounded-xl border px-2 py-2 text-center transition ${
                      active ? "border-ink bg-surface-2 text-text" : "border-line hover:border-ink/40"
                    }`}
                  >
                    <div className="text-xs font-medium">{MODEL_PORTFOLIOS[key].label}</div>
                    <div className={`mt-0.5 text-index leading-tight ${active ? "text-on-accent/70" : "text-muted"}`}>
                      {MODEL_PORTFOLIOS[key].tagline}
                    </div>
                  </button>
                );
              })}
            </div>
            {total === 0 && (
              <p className="mt-2 text-center text-caption text-muted">New to investing? Just tap one and we'll fill your mix for you.</p>
            )}
          </div>

          {equityHeavy && (
            <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-center text-xs text-ink">
              Add some bonds to steady out this stock-heavy mix.
            </p>
          )}

          {/* What's in your mix: compact dot rows in a fixed-height, scrollable
              basket so adding more funds never makes the pane grow. */}
          {holdings.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
                  <Marker /> What's in your mix
                </span>
                <span className="text-index uppercase tracking-wide text-muted">
                  {holdings.length} {holdings.length === 1 ? "fund" : "funds"}
                </span>
              </div>
              <div className="no-scrollbar mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-0.5">
                {holdings.map((id) => {
                  const f = FUND_MAP[id];
                  if (!f) return null;
                  const ac = ASSET_CLASSES[f.assetClass];
                  const pctOfTotal = total > 0 ? Math.round(((alloc[id] ?? 0) / total) * 100) : 0;
                  const amt = amountFor(id);
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5">
                      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: ac.color }} title={ac.label} />
                      <span className="min-w-0 flex-1 truncate text-support font-medium leading-tight">{f.name}</span>
                      <span className="hidden flex-none text-index tabular-nums text-muted sm:inline">{formatINR(amt)}/mo</span>
                      <button
                        onClick={() => setWeight(id, (alloc[id] ?? 0) - 5)}
                        aria-label={`Lower ${f.name} share`}
                        className="grid h-6 w-6 flex-none place-items-center rounded-md border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        −
                      </button>
                      <span className="w-9 flex-none text-center text-caption font-medium tabular-nums">{pctOfTotal}%</span>
                      <button
                        onClick={() => setWeight(id, (alloc[id] ?? 0) + 5)}
                        aria-label={`Raise ${f.name} share`}
                        className="grid h-6 w-6 flex-none place-items-center rounded-md border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFund(id)}
                        aria-label={`Remove ${f.name}`}
                        className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
