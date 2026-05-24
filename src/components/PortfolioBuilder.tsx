import { useState } from "react";
import { ASSET_CLASSES, CATEGORY_FILTERS, FUNDS, FUND_MAP } from "../lib/funds";
import { MODEL_PORTFOLIOS } from "../lib/portfolios";
import { allocationTotal, bandWeights, blendedReturn, blendedVolatility } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import type { Allocation, AssetClassId, RiskProfile } from "../lib/types";
import { actions, currentGoal, useStore } from "../store";
import Basket from "./Basket";
import { sectionLabel } from "../ui";

function riskLabel(vol: number): string {
  if (vol < 0.06) return "Low";
  if (vol < 0.13) return "Moderate";
  return "High";
}
const RISK_COLOR: Record<string, string> = { Low: "#1D9E75", Moderate: "#B45309", High: "#B91C1C" };
const CLASS_ORDER: AssetClassId[] = ["equity", "hybrid", "gold", "debt"];

export default function PortfolioBuilder() {
  const s = useStore();
  const goal = currentGoal(s);
  const alloc: Allocation = goal?.allocation ?? {};
  const [pop, setPop] = useState(0);
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

  const setAlloc = (a: Allocation, profile: RiskProfile | null) => actions.setAllocation(a, profile);
  const addFund = (id: string) => {
    if (id in alloc) return;
    const w = total < 100 ? Math.min(100 - total, 25) : 10;
    setAlloc({ ...alloc, [id]: w }, null);
    setPop((p) => p + 1);
  };
  const setWeight = (id: string, w: number) => setAlloc({ ...alloc, [id]: w }, null);
  const removeFund = (id: string) => {
    const next = { ...alloc };
    delete next[id];
    setAlloc(next, null);
  };
  const applyPreset = (key: RiskProfile) => {
    setAlloc({ ...MODEL_PORTFOLIOS[key].allocation }, key);
    setPop((p) => p + 1);
  };

  const filtered = FUNDS.filter(
    (f) => (cat === "all" || f.assetClass === cat) && f.name.toLowerCase().includes(search.toLowerCase()),
  );
  const holdings = Object.keys(alloc).sort(
    (a, b) => CLASS_ORDER.indexOf(FUND_MAP[a]?.assetClass) - CLASS_ORDER.indexOf(FUND_MAP[b]?.assetClass),
  );
  const equityHeavy = total > 0 && bands.equity / total > 0.7 && bands.debt / Math.max(total, 1) < 0.1;
  const legend = [
    { label: "Equity", v: bands.equity, color: ASSET_CLASSES.equity.color },
    { label: "Debt", v: bands.debt, color: ASSET_CLASSES.debt.color },
    { label: "Gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium tracking-tight">Build your portfolio</h2>
          <p className="text-[13px] text-muted">Drag funds in — or tap. Watch your basket fill up.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-brand" />
          <span className="text-muted">Live preview · {risk} risk</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ---- Funds library ---- */}
        <div>
          <span className={sectionLabel}>Funds</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search funds"
            className="mt-2 h-9 w-full rounded-[10px] border border-line px-3 text-sm outline-none focus:border-brand-deep"
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
                  className={`cursor-grab select-none rounded-xl border bg-white p-3 transition hover:border-brand-deep active:cursor-grabbing ${
                    added ? "border-brand-deep" : "border-line"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: ac.color + "22", color: ac.color }}>
                      {ac.label}
                    </span>
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: RISK_COLOR[f.risk] + "1A", color: RISK_COLOR[f.risk] }}>
                      {f.risk} risk
                    </span>
                    {added && <span className="ml-auto text-xs font-medium text-brand-deep">Added ✓</span>}
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-medium">{f.name}</div>
                      <div className="text-[11px] text-muted">
                        {f.fiveYr}% 5Y · expense {f.expense}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[18px] font-medium leading-none">{formatPct(f.expReturn, 0)}</div>
                      <div className="text-[10px] text-muted">per year</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Basket panel (drop zone) ---- */}
        <div
          className={`rounded-2xl border bg-white p-4 transition ${dragOver ? "border-brand-deep ring-2 ring-brand" : "border-line"}`}
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
          <div className="grid grid-cols-3 divide-x divide-line">
            <div className="pr-3">
              <div className="text-[22px] font-medium leading-none">{total > 0 ? formatPct(ret, 1) : "—"}</div>
              <div className="text-[11px] text-muted">per year</div>
            </div>
            <div className="px-3">
              <div className="text-[22px] font-medium leading-none text-brand-deep">{total > 0 ? formatINR(tenYr) : "—"}</div>
              <div className="text-[11px] text-muted">₹1L in 10 yrs</div>
            </div>
            <div className="pl-3">
              <div className="text-[22px] font-medium leading-none">{risk}</div>
              <div className="text-[11px] text-muted">risk profile</div>
            </div>
          </div>
          <div className="mt-2 text-right text-xs">
            <span className="font-medium text-brand-deep">{Math.round(total)}% allocated</span>
            {left > 0 && <span className="text-muted"> · {left}% left to add</span>}
          </div>

          {total === 0 ? (
            <p className="mb-1 mt-3 text-center text-sm text-muted">Your basket is empty. Drag a fund in to get started.</p>
          ) : null}
          <Basket bands={bands} pop={pop} />

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                {l.label} {Math.round(l.v)}%
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line" /> {left}% left
            </span>
          </div>

          {equityHeavy && (
            <p className="mt-3 rounded-lg px-3 py-2 text-center text-xs" style={{ background: "#EF9F2718", color: "#B45309" }}>
              Add some debt to balance the equity-heavy mix.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            {(["steady", "balanced", "bold"] as RiskProfile[]).map((key) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition ${
                  goal?.activeProfile === key ? "bg-ink text-white" : "border border-line text-muted hover:border-ink/40"
                }`}
              >
                {MODEL_PORTFOLIOS[key].label}
              </button>
            ))}
          </div>

          {/* Holdings — compact, lives with the basket */}
          <div className="mt-5">
            <span className={sectionLabel}>Holdings</span>
            <div className="mt-2 flex flex-col gap-2">
              {holdings.map((id) => {
                const f = FUND_MAP[id];
                if (!f) return null;
                const ac = ASSET_CLASSES[f.assetClass];
                const pctOfTotal = total > 0 ? Math.round(((alloc[id] ?? 0) / total) * 100) : 0;
                return (
                  <div key={id} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5">
                    <span className="h-7 w-[3px] flex-none rounded-full" style={{ background: ac.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{f.name}</div>
                      <div className="text-[10px] text-muted">{ac.label} · {formatPct(f.expReturn, 0)}/yr</div>
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
                    <span className="w-9 text-right text-[13px] font-medium tabular-nums">{pctOfTotal}%</span>
                    <button onClick={() => removeFund(id)} aria-label="Remove" className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
                      ✕
                    </button>
                  </div>
                );
              })}
              <div className="rounded-xl border border-dashed border-line px-3 py-2.5 text-center text-xs text-muted">
                Drop another fund here · {left}% left
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
