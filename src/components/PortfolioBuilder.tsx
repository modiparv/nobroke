import { useState } from "react";
import { ASSET_CLASSES, CATEGORY_FILTERS, FUNDS, FUND_MAP } from "../lib/funds";
import { MODEL_PORTFOLIOS } from "../lib/portfolios";
import { allocationTotal, bandWeights, blendedReturn, blendedVolatility, computePlan } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import type { Allocation, AssetClassId, RiskProfile } from "../lib/types";
import { actions, currentGoal, toPlanInputs, useStore } from "../store";
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
  const left = Math.max(0, Math.round(100 - total));
  const bands = bandWeights(alloc);
  const ret = blendedReturn(alloc);
  const vol = blendedVolatility(alloc);
  const risk = total > 0 ? riskLabel(vol) : "—";
  const tenYr = 100000 * Math.pow(1 + ret, 10);
  const result = computePlan(toPlanInputs(s));

  const setAlloc = (a: Allocation, profile: RiskProfile | null) => actions.setAllocation(a, profile);
  const addFund = (id: string) => {
    if (id in alloc) return;
    const w = total < 100 ? Math.min(100 - total, 25) : 10;
    setAlloc({ ...alloc, [id]: w }, null);
  };
  const setWeight = (id: string, w: number) => setAlloc({ ...alloc, [id]: w }, null);
  const removeFund = (id: string) => {
    const next = { ...alloc };
    delete next[id];
    setAlloc(next, null);
  };
  const applyPreset = (key: RiskProfile) => setAlloc({ ...MODEL_PORTFOLIOS[key].allocation }, key);

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
          <p className="text-[13px] text-muted">Drag a fund into your basket — or tap. The projection moves with you.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-brand" />
          <span className="text-muted">Live · {risk} risk</span>
        </div>
      </div>

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
                  <span className={`grid h-5 w-5 flex-none place-items-center rounded-md text-xs font-bold ${added ? "bg-brand text-white" : "border border-line text-muted"}`}>
                    {added ? "✓" : "+"}
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
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Your basket
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wide">
              <span className="font-semibold text-ink">{Math.round(total)}%</span>
              <span className="text-muted"> allocated{left > 0 ? ` · ${left}% left` : ""}</span>
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
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line" /> {left}% left
            </span>
          </div>

          {total === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-line bg-paper py-4 text-center text-sm text-muted">
              Drag a fund here to start building — or tap one on the left.
            </p>
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

          {/* Presets */}
          <div className="mt-4 flex gap-2">
            {(["steady", "balanced", "bold"] as RiskProfile[]).map((key) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                  goal?.activeProfile === key ? "bg-ink text-white" : "border border-line text-muted hover:border-ink/40"
                }`}
              >
                {MODEL_PORTFOLIOS[key].label}
              </button>
            ))}
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
                  return (
                    <div key={id} className="flex items-center gap-2.5 rounded-[10px] border border-line p-2.5">
                      <span className="h-7 w-[3px] flex-none rounded-full" style={{ background: ac.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{f.name}</div>
                        <div className="font-mono text-[9px] uppercase tracking-wide text-muted">
                          {ac.label} · {formatPct(f.expReturn, 0)}/yr
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={alloc[id] ?? 0}
                        onChange={(e) => setWeight(id, Number(e.target.value))}
                        className="w-20 sm:w-24"
                        aria-label={`${f.name} weight`}
                      />
                      <span className="w-9 text-right text-[13px] font-semibold tabular-nums">{pctOfTotal}%</span>
                      <button onClick={() => removeFund(id)} aria-label="Remove" className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
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
