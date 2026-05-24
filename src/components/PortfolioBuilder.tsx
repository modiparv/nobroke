import { useState } from "react";
import { ASSET_CLASSES, CATEGORY_FILTERS, FUNDS, FUND_MAP } from "../lib/funds";
import { MODEL_PORTFOLIOS } from "../lib/portfolios";
import { allocationTotal, bandWeights, blendedReturn, blendedVolatility, computePlan } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import type { Allocation, AssetClassId, RiskProfile } from "../lib/types";
import { actions, currentGoal, goalMonthly, goalsByPriority, toPlanInputs, useStore } from "../store";
import Chart from "./Chart";
import { sectionLabel } from "../ui";

function riskLabel(vol: number): string {
  if (vol < 0.06) return "Low";
  if (vol < 0.13) return "Moderate";
  return "High";
}
const CLASS_ORDER: AssetClassId[] = ["equity", "hybrid", "gold", "debt"];

function Marker() {
  return <span className="inline-block h-1.5 w-1.5 flex-none bg-brand" />;
}

export default function PortfolioBuilder() {
  const s = useStore();
  const goal = currentGoal(s);
  const alloc: Allocation = goal?.allocation ?? {};
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<"all" | AssetClassId>("all");
  const [dragOver, setDragOver] = useState(false);

  const total = allocationTotal(alloc);
  const bands = bandWeights(alloc);
  const ret = blendedReturn(alloc);
  const vol = blendedVolatility(alloc);
  const risk = total > 0 ? riskLabel(vol) : "—";
  const tenYr = 100000 * Math.pow(1 + ret, 10);
  const result = computePlan(toPlanInputs(s));
  // The builder splits THIS goal's monthly money (its share of the pool) across instruments.
  const sip = goal ? goalMonthly(s, goal.id) : 0;
  const amountFor = (id: string) => (total > 0 ? (alloc[id] / total) * sip : 0);

  const setAlloc = (a: Allocation, profile: RiskProfile | null) => actions.setAllocation(a, profile);
  // Weights are always kept summing to 100 so the basket is strictly 100% — the
  // % is a true share of the monthly amount, and the ₹ values follow the SIP.
  const normalizeTo100 = (a: Allocation): Allocation => {
    const entries = Object.entries(a);
    const t = entries.reduce((s, [, v]) => s + (v > 0 ? v : 0), 0);
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
  const equityHeavy = total > 0 && bands.equity / total > 0.7 && bands.debt / Math.max(total, 1) < 0.1;

  // Stacked allocation bar — scale segments so an over-100 mix still fills the bar.
  const scale = total > 100 ? 100 / total : 1;
  const segs = [
    { label: "Equity", v: bands.equity, color: ASSET_CLASSES.equity.color },
    { label: "Debt", v: bands.debt, color: ASSET_CLASSES.debt.color },
    { label: "Gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
  ].filter((x) => x.v > 0.01);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight">Build your portfolio</h2>
          <p className="text-[13px] text-muted">
            Splitting <span className="font-semibold text-ink">{goal?.name}</span>'s{" "}
            <span className="font-semibold text-ink">{formatINR(sip)}/mo</span> across investments. Tap a fund to add it, then drag to set the mix.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-brand" />
          <span className="text-muted">Live · {risk} risk</span>
        </div>
      </div>

      {/* Money across goals — the goal split (tap to edit a goal's instrument mix) */}
      {s.goals.length > 1 && (
        <div className="mb-5 rounded-2xl border border-line bg-paper p-3">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Money across goals
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">tap to edit a goal's mix</span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {goalsByPriority(s).map((g) => {
              const amt = goalMonthly(s, g.id);
              const share = s.monthlySip > 0 ? (amt / s.monthlySip) * 100 : 0;
              const isCur = g.id === goal?.id;
              return (
                <button
                  key={g.id}
                  onClick={() => actions.setCurrentGoal(g.id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${isCur ? "border border-ink bg-white" : "border border-transparent hover:bg-white"}`}
                >
                  <span className="w-4 flex-none text-center">{g.emoji}</span>
                  <span className="w-20 flex-none truncate text-[12px] font-semibold sm:w-28">{g.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${share}%`, background: isCur ? "#1A1AFF" : "#0A0A0A" }} />
                  </span>
                  <span className="w-20 flex-none text-right text-[12px] font-bold tabular-nums">
                    {formatINR(amt)}
                    <span className="text-[9px] font-normal text-muted">/mo</span>
                  </span>
                  <span className="w-8 flex-none text-right font-mono text-[10px] text-muted">{Math.round(share)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* ---- Funds library (drag source) ---- */}
        <div>
          <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
            <Marker /> Funds
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search funds"
            className="mt-2 h-9 w-full rounded-[10px] border border-line bg-white px-3 text-sm outline-none focus:border-ink"
          />
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  cat === c.id ? "bg-ink text-white" : "border border-line text-muted hover:border-ink/40"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2">
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
                  className={`flex cursor-grab select-none items-center gap-2.5 rounded-[10px] border bg-white p-2.5 transition hover:border-ink active:cursor-grabbing ${
                    added ? "border-ink" : "border-line"
                  }`}
                >
                  <span className="h-8 w-1 flex-none rounded-full" style={{ background: ac.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-tight">{f.name}</div>
                    <div className="truncate font-mono text-[9.5px] uppercase tracking-wide text-muted">
                      {ac.label} · {f.risk} risk · {f.fiveYr}% 5Y
                    </div>
                  </div>
                  <div className="flex-none text-right">
                    <div className="text-[14px] font-bold leading-none">{formatPct(f.expReturn, 0)}</div>
                    <div className="font-mono text-[9px] uppercase text-muted">p.a.</div>
                  </div>
                  <span className={`flex-none rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${added ? "bg-brand text-white" : "border border-line text-muted"}`}>
                    {added ? "Added" : "Add"}
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted">No funds match “{search}”.</p>}
          </div>
        </div>

        {/* ---- Basket (drop zone) + projection ---- */}
        <div
          className={`rounded-2xl border bg-white p-4 transition ${dragOver ? "border-brand ring-2 ring-brand/40" : "border-line"}`}
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
              <Marker /> Your basket
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wide">
              <span className="font-semibold text-ink">{formatINR(sip)}/mo</span>
              <span className="text-muted"> · {Math.round(total)}% allocated</span>
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
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide">
            {[
              { label: "Equity", v: bands.equity, color: ASSET_CLASSES.equity.color },
              { label: "Debt", v: bands.debt, color: ASSET_CLASSES.debt.color },
              { label: "Gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
            ].map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                {l.label} {Math.round(l.v)}%
              </span>
            ))}
          </div>

          {total === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-paper px-4 py-5 text-center">
              <p className="text-sm font-semibold text-ink">Your basket is empty</p>
              <p className="mt-1 text-[12px] text-muted">Tap a fund on the left to add it — or pick a Quick mix below to fill it for you.</p>
            </div>
          )}

          {/* Stat strip */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-paper py-3">
            <div className="px-3">
              <div className="text-[20px] font-bold leading-none">{total > 0 ? formatPct(ret, 1) : "—"}</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted">per year</div>
            </div>
            <div className="px-3">
              <div className="text-[20px] font-bold leading-none text-brand">{total > 0 ? formatINR(tenYr) : "—"}</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted">₹1L in 10 yrs</div>
            </div>
            <div className="px-3">
              <div className="text-[20px] font-bold leading-none">{risk}</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted">risk profile</div>
            </div>
          </div>

          {/* Projection graph — lives with the rebalancing controls */}
          <div className="mt-4">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Projection
            </span>
            <Chart r={result} />
          </div>

          {/* Presets — plain-language quick mixes */}
          <div className="mt-4">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Quick mixes
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["steady", "balanced", "bold"] as RiskProfile[]).map((key) => {
                const active = goal?.activeProfile === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`rounded-xl border px-2 py-2 text-center transition ${
                      active ? "border-ink bg-ink text-white" : "border-line hover:border-ink/40"
                    }`}
                  >
                    <div className="text-xs font-bold">{MODEL_PORTFOLIOS[key].label}</div>
                    <div className={`mt-0.5 text-[10px] leading-tight ${active ? "text-white/70" : "text-muted"}`}>
                      {MODEL_PORTFOLIOS[key].tagline}
                    </div>
                  </button>
                );
              })}
            </div>
            {total === 0 && (
              <p className="mt-2 text-center text-[11px] text-muted">New to investing? Tap a mix to auto-fill your basket.</p>
            )}
          </div>

          {equityHeavy && (
            <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-center text-xs text-ink">
              Add some debt to balance the equity-heavy mix.
            </p>
          )}

          {/* Holdings — the contents of your basket */}
          {holdings.length > 0 && (
            <div className="mt-5">
              <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
                <Marker /> Holdings
              </span>
              <div className="mt-2 flex flex-col gap-2">
                {holdings.map((id) => {
                  const f = FUND_MAP[id];
                  if (!f) return null;
                  const ac = ASSET_CLASSES[f.assetClass];
                  const pctOfTotal = total > 0 ? Math.round(((alloc[id] ?? 0) / total) * 100) : 0;
                  const amt = amountFor(id);
                  return (
                    <div key={id} className="rounded-[10px] border border-line p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-7 w-[3px] flex-none rounded-full" style={{ background: ac.color }} />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold leading-tight">{f.name}</div>
                            <div className="font-mono text-[9px] uppercase tracking-wide text-muted">
                              {ac.label} · {formatPct(f.expReturn, 0)}/yr
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          <div className="text-right">
                            <div className="text-[13px] font-bold leading-none tabular-nums">
                              {formatINR(amt)}
                              <span className="text-[10px] font-normal text-muted">/mo</span>
                            </div>
                            <div className="font-mono text-[10px] text-muted">{pctOfTotal}%</div>
                          </div>
                          <button onClick={() => removeFund(id)} aria-label="Remove" className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
                            ✕
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={alloc[id] ?? 0}
                        onChange={(e) => setWeight(id, Number(e.target.value))}
                        className="mt-2 w-full"
                        aria-label={`${f.name} weight`}
                      />
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
