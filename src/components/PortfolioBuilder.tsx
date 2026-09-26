import { useEffect, useRef, useState } from "react";
import { ASSET_CLASSES, FUND_MAP, registerFund } from "../lib/funds";
import { fundFromLiveScheme, getLiveSchemeDetail, searchLiveSchemes, type LiveSchemeRow } from "../lib/instrumentsApi";
import { MODEL_PORTFOLIOS } from "../lib/portfolios";
import { allocationTotal, bandWeights, blendedReturn } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import { FOCUS, holdingForFund, holdingFocus } from "../lib/links";
import { onTrackCount, outlook } from "../lib/outlook";
import type { Allocation, AssetClassId, RiskProfile } from "../lib/types";
import { useFocus } from "../lib/useFocus";
import { actions, planShape, recommendedPortfolio, useStore } from "../store";
import { appetiteCeiling } from "../lib/risk";
import RiskMeter from "./RiskMeter";
import { sectionLabel } from "../ui";

const CLASS_ORDER: AssetClassId[] = ["equity", "hybrid", "gold", "debt"];

/**
 * An illustrative spread around the blended return, so we never print a point
 * estimate (spec section 5). These multipliers are a presentation band, NOT a
 * modelled confidence interval. A real p10/p90 needs the Monte Carlo work in a
 * later phase. The copy frames every figure as a range or as history.
 */
const BAND_LOW = 0.7;
const BAND_HIGH = 1.15;

function growthBand(ret: number) {
  const low = ret * BAND_LOW;
  const high = ret * BAND_HIGH;
  const lakh = (r: number, years: number) => 100000 * Math.pow(1 + r, years);
  return {
    low,
    high,
    threeYearLow: lakh(low, 3),
    threeYearHigh: lakh(high, 3),
    tenYearLow: lakh(low, 10),
    tenYearHigh: lakh(high, 10),
  };
}

function Marker() {
  return <span className="inline-block h-1.5 w-1.5 flex-none bg-text-3" />;
}

/**
 * The ONE portfolio every goal shares. There's no per-goal basket anymore: the
 * whole monthly amount grows in this single mix, and each goal simply draws
 * its share of that money. We surface an advisor recommendation (a mix
 * matched to the goals' blended horizon) and a near-term mismatch warning.
 */
export default function PortfolioBuilder() {
  const s = useStore();
  const alloc: Allocation = s.portfolio;
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  // Links from the plan land on the mix, or on the funds in it.
  const mixFocus = useFocus(FOCUS.mix);
  const fundsFocus = useFocus(FOCUS.funds);

  // Live universe search (AMFI via /api/instruments), debounced. Failures are
  // silent: the built-in list keeps working without the network.
  const [liveRows, setLiveRows] = useState<LiveSchemeRow[]>([]);
  const [liveBusy, setLiveBusy] = useState(false);
  const [addingCode, setAddingCode] = useState<number | null>(null);
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) {
      setLiveRows([]);
      setLiveBusy(false);
      return;
    }
    const seq = ++searchSeq.current;
    setLiveBusy(true);
    const t = window.setTimeout(() => {
      void searchLiveSchemes(q).then(async (rows) => {
        if (searchSeq.current !== seq) return;
        // Names first, instantly. Returns stream in per row (each detail call
        // is edge-cached), then one re-rank by real 5-year performance.
        const base = rows.slice(0, 8);
        setLiveRows(base);
        setLiveBusy(false);
        const detailed = await Promise.all(
          base.map(async (r) => {
            const d = await getLiveSchemeDetail(r.schemeCode);
            return d ? { ...r, cagr1y: d.cagr1y, cagr3y: d.cagr3y, cagr5y: d.cagr5y, score: d.score } : r;
          }),
        );
        if (searchSeq.current !== seq) return;
        // Rank by the NoBroke Score; funds too young to score fall back to
        // their 5-year return, then to the bottom.
        detailed.sort(
          (a, b) => (b.score?.score ?? (b.cagr5y ?? -999) * 0.01) - (a.score?.score ?? (a.cagr5y ?? -999) * 0.01),
        );
        setLiveRows(detailed);
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [search]);

  const addLive = async (row: LiveSchemeRow) => {
    const id = `live_${row.schemeCode}`;
    // Guard rapid double-clicks and clicks while another add is in flight.
    if (id in alloc || addingCode != null) return;
    setAddingCode(row.schemeCode);
    const detail = await getLiveSchemeDetail(row.schemeCode);
    setAddingCode(null);
    if (!detail) return;
    registerFund(fundFromLiveScheme(detail));
    addFund(id);
  };

  const total = allocationTotal(alloc);
  const bands = bandWeights(alloc);
  const ret = blendedReturn(alloc);
  const band = growthBand(ret);
  // The entire monthly amount funds this single portfolio (all goals share it).
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
  // What each ready-made mix would do to the goals, before it is applied:
  // the same money, the same split, only the mix changed.
  const previewFor = (key: RiskProfile) =>
    s.goals.length ? onTrackCount(outlook({ ...planShape(s), allocation: normalizeTo100(MODEL_PORTFOLIOS[key].allocation) })) : null;

  const holdings = Object.keys(alloc).sort(
    (a, b) => CLASS_ORDER.indexOf(FUND_MAP[a]?.assetClass) - CLASS_ORDER.indexOf(FUND_MAP[b]?.assetClass),
  );
  const equityShare = total > 0 ? bands.equity / total : 0;
  const equityHeavy = total > 0 && equityShare > 0.7 && bands.debt / Math.max(total, 1) < 0.1;

  // ---- Advisor overlay: a mix matched to the goals' blended horizon ----
  const rec = recommendedPortfolio(s.goals, s.riskAppetite);
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
      <RiskMeter />

      {/* Advisor pick — match the single mix to the goals' blended horizon */}
      {s.goals.length > 0 && !matchesRec && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2.5">
          <span className="text-support text-ink">
            A {recLabel.toLowerCase()} mix fits your goals better.
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

      {/* Near-term risk: one compact line. The reasoning sits behind a tap so
          it never crowds the pane. */}
      {nearTermRisk && soonGoal && (
        <div className="mb-3">
          <button
            onClick={() => setRiskOpen((v) => !v)}
            aria-expanded={riskOpen}
            title={`${soonGoal.name} is ${soonGoal.horizonYears} ${soonGoal.horizonYears === 1 ? "year" : "years"} away and this mix leans on stocks.`}
            className="flex w-full items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-left"
          >
            <span className="truncate text-xs text-ink">
              ⚠️ <span className="font-medium">{soonGoal.name}</span> is close. Check this mix.
            </span>
            <span className="flex-none text-caption text-muted">{riskOpen ? "Hide" : "Why"}</span>
          </button>
          {riskOpen && (
            <p className="mt-1.5 px-1 text-xs text-muted">
              {soonGoal.name} is {soonGoal.horizonYears} {soonGoal.horizonYears === 1 ? "year" : "years"} away and this
              mix leans on stocks, which can drop a lot in a short time. For money you need soon, hold safer funds or
              put in a little more each month.
            </p>
          )}
        </div>
      )}

      {/* Single column: the builder lives in the side pane beside the goals,
          so its sections stack. The mix leads. Picking funds follows. */}
      <div className="grid gap-4">
        {/* ---- Fund search: the live AMFI universe only ---- */}
        <div className="order-2 min-w-0">
          <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
            <Marker /> Want a specific fund?
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any mutual fund (type 3 letters)"
            className="mt-2 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none transition focus:border-ink"
          />

          <div className="no-scrollbar mt-3 flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {search.trim().length < 3 && !liveBusy && liveRows.length === 0 && (
              <p className="py-4 text-center text-caption text-muted">
                Every mutual fund in India, from the official AMFI list.
              </p>
            )}
            {search.trim().length >= 3 && !liveBusy && liveRows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">No fund matches “{search}”.</p>
            )}

            {(liveBusy || liveRows.length > 0) && (
              <div>
                {liveBusy && <p className="mt-1 text-caption text-muted">Searching every fund…</p>}
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {liveRows.map((row, i) => {
                    const id = `live_${row.schemeCode}`;
                    const added = id in alloc;
                    const busy = addingCode === row.schemeCode;
                    const isTop = i === 0 && row.score != null && liveRows.length > 1;
                    const scoreTitle = row.score
                      ? `NoBroke Score ${row.score.score}: consistency ${row.score.components.consistency}, downside ${row.score.components.downside}, risk-adjusted return ${row.score.components.riskAdjusted}, track record ${row.score.components.track}. From ${row.score.monthsCovered} months of NAV history.`
                      : undefined;
                    return (
                      <div
                        key={row.schemeCode}
                        onClick={() => (added ? removeFund(id) : void addLive(row))}
                        title={scoreTitle}
                        className={`flex cursor-pointer select-none items-center gap-2 rounded-control border px-2.5 py-2 transition ${
                          added ? "border-accent bg-surface" : "border-transparent bg-surface-2/50 hover:bg-surface-2"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-support font-medium leading-tight">{row.schemeName}</span>
                          {(row.cagr3y != null || row.cagr5y != null || row.score != null) && (
                            <span className="num block truncate text-caption text-muted">
                              {row.score != null && (
                                <span className="mr-1.5 rounded-full bg-accent-tint px-1.5 py-px text-index font-medium uppercase tracking-wide text-accent">
                                  {Math.round(row.score.score)} {row.score.grade}
                                </span>
                              )}
                              {row.cagr3y != null && <>3Y {formatPct(row.cagr3y, 1)}</>}
                              {row.cagr3y != null && row.cagr5y != null && ", "}
                              {row.cagr5y != null && <>5Y {formatPct(row.cagr5y, 1)}</>}
                              {isTop && (
                                <span className="ml-1.5 rounded-full border border-line px-1.5 py-px text-index uppercase tracking-wide text-muted">
                                  Top score here
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                        <span className={`flex-none rounded-full px-2 py-0.5 text-index font-medium uppercase tracking-wide ${added ? "bg-brand text-on-accent" : "border border-line text-muted"}`}>
                          {busy ? "…" : added ? "Added" : "Add"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-caption text-text-2">
                  Ranked by NoBroke Score: consistency, downside behaviour, risk-adjusted return and track record,
                  computed from official NAV history. Hover a fund for its breakdown.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---- Basket (drop zone) ---- */}
        <div
          ref={mixFocus.ref}
          className={`order-1 min-w-0 rounded-card border bg-surface p-3.5 transition ${dragOver ? "border-accent ring-2 ring-accent/40" : "border-line"} ${
            mixFocus.active ? "focus-flash" : ""
          }`}
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
          <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
            <Marker /> Your portfolio
          </span>

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
          {/* One sentence: where each month's money goes. */}
          {total > 0 && (
            <p className="num mt-2 text-caption text-text-2">
              {sip > 0 ? (
                <>
                  Your <span className="font-medium text-text">{formatINR(sip)}</span> a month goes:{" "}
                </>
              ) : (
                "This mix is: "
              )}
              {[
                { label: "stocks", v: bands.equity, color: ASSET_CLASSES.equity.color },
                { label: "bonds", v: bands.debt, color: ASSET_CLASSES.debt.color },
                { label: "gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
              ]
                .filter((l) => Math.round(l.v * scale) > 0)
                .map((l, i, arr) => (
                  <span key={l.label} className="whitespace-nowrap">
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm align-baseline" style={{ background: l.color }} aria-hidden />
                    <span className="font-medium text-text">{Math.round(l.v * scale)}%</span> {l.label}
                    {i < arr.length - 1 ? ", " : ""}
                  </span>
                ))}
            </p>
          )}

          {total === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-5 text-center">
              <p className="text-sm font-medium text-ink">Your mix is empty</p>
              <p className="mt-1 text-caption text-muted">Pick a mix below, or add a fund.</p>
            </div>
          )}

          {/* Ranges, never point estimates (section 5): one plain paragraph. */}
          {total > 0 && (
            <p className="num mt-4 rounded-control bg-surface-2 px-3.5 py-3 text-caption text-text-2">
              In the past this mix grew{" "}
              <span className="font-medium text-text">
                {formatPct(band.low, 0)} to {formatPct(band.high, 0)}
              </span>{" "}
              a year. ₹1 lakh became {formatINR(band.threeYearLow)}–{formatINR(band.threeYearHigh)} in 3 years and{" "}
              {formatINR(band.tenYearLow)}–{formatINR(band.tenYearHigh)} in 10. The future can be different.
            </p>
          )}

          {/* Presets: plain-language quick mixes */}
          <div className="mt-4">
            <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
              <Marker /> Pick a mix
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["steady", "balanced", "bold"] as RiskProfile[]).map((key) => {
                const active = s.portfolioProfile === key;
                const order: RiskProfile[] = ["steady", "balanced", "bold"];
                const beyond = order.indexOf(key) > order.indexOf(appetiteCeiling(s.riskAppetite));
                const preview = previewFor(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className={`rounded-control border px-2 py-2 text-center transition ${
                      active ? "border-ink bg-surface-2 text-text" : "border-line hover:border-ink/40 hover:bg-surface-2/40"
                    }`}
                  >
                    <div className="text-xs font-medium">{MODEL_PORTFOLIOS[key].label}</div>
                    <div className={`mt-0.5 text-index leading-tight ${active ? "text-text-2" : "text-muted"}`}>
                      {MODEL_PORTFOLIOS[key].tagline}
                    </div>
                    {preview !== null && (
                      <div className="num mt-1 text-index leading-tight text-text-2">
                        {preview} of {s.goals.length} on track
                      </div>
                    )}
                    {beyond && (
                      <div className="mt-1 text-index leading-tight text-cau">Riskier than you said you're OK with</div>
                    )}
                  </button>
                );
              })}
            </div>
            {total === 0 && <p className="mt-2 text-center text-caption text-muted">Tap one to fill your mix.</p>}
          </div>

          {equityHeavy && (
            <p className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-center text-xs text-ink">
              Almost all of this is in stocks. Add some bonds to smooth it out.
            </p>
          )}

          {/* What's in your mix: compact dot rows in a fixed-height, scrollable
              basket so adding more funds never makes the pane grow. */}
          {holdings.length > 0 && (
            <div ref={fundsFocus.ref} className={`mt-5 rounded-control ${fundsFocus.active ? "focus-flash" : ""}`}>
              <span className={`inline-flex items-center gap-1.5 ${sectionLabel}`}>
                <Marker /> The {holdings.length} {holdings.length === 1 ? "fund" : "funds"} in your mix
              </span>
              <div className="no-scrollbar mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-0.5">
                {holdings.map((id) => {
                  const f = FUND_MAP[id];
                  if (!f) return null;
                  const ac = ASSET_CLASSES[f.assetClass];
                  const pctOfTotal = total > 0 ? Math.round(((alloc[id] ?? 0) / total) * 100) : 0;
                  const amt = amountFor(id);
                  // A fund the person already holds links to that holding on Money.
                  const owned = holdingForFund(f.name, s.externalHoldings);
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-control bg-surface-2/40 px-2 py-1.5">
                      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: ac.color }} title={ac.label} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-support font-medium leading-tight">{f.name}</span>
                        {owned && (
                          <button
                            type="button"
                            onClick={() => actions.setTab("money", { focus: holdingFocus(owned.id) })}
                            className="num block truncate text-index text-text-2 underline underline-offset-2 transition hover:text-text"
                          >
                            You hold {formatINR(owned.amount)} of this. See it in Money →
                          </button>
                        )}
                      </span>
                      <span className="hidden flex-none text-index tabular-nums text-muted sm:inline">{formatINR(amt)} a month</span>
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
