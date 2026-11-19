import { useEffect, useRef, useState, type ReactNode } from "react";
import { ASSET_CLASSES, FUND_MAP, registerFund } from "../lib/funds";
import { fundFromLiveScheme, getLiveSchemeDetail, searchLiveSchemes, type LiveSchemeRow } from "../lib/instrumentsApi";
import { MODEL_PORTFOLIOS } from "../lib/portfolios";
import { allocationTotal, bandWeights, blendedReturn } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import { inr } from "../lib/glue";
import { FOCUS, holdingForFund, holdingFocus } from "../lib/links";
import { onTrackCount, outlook } from "../lib/outlook";
import type { Allocation, AssetClassId, RiskProfile } from "../lib/types";
import { useFocus } from "../lib/useFocus";
import { actions, planShape, useStore } from "../store";
import { appetiteCeiling } from "../lib/risk";
import RiskMeter from "./RiskMeter";
import { card } from "../ui";

const CLASS_ORDER: AssetClassId[] = ["equity", "hybrid", "gold", "debt"];
/** What kind of money a fund is, in the words the mix's key uses. Written
    under each fund's name, so the dot's colour is never the only thing
    that says it. */
const CLASS_WORD: Record<AssetClassId, string> = {
  equity: "Stocks",
  hybrid: "Stocks and bonds",
  gold: "Gold",
  debt: "Bonds",
};
const PRESETS: RiskProfile[] = ["steady", "balanced", "bold"];

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

const paneTitle = "text-section font-medium text-text";

/* ------------------------------------------------------------------ */
/* The pieces every mix on this page is drawn with: the live mix, the  */
/* three ready-made ones and the draft in "Build your own" share one   */
/* bar, one key and one row, so they can be compared at a glance.      */
/* ------------------------------------------------------------------ */

interface Part {
  id: "equity" | "debt" | "gold";
  word: string;
  /** Percent of the whole mix, 0..100. */
  pct: number;
  color: string;
}

/** A mix as its three parts, each a percent of the whole. */
function partsOf(alloc: Allocation): Part[] {
  const total = allocationTotal(alloc);
  if (total <= 0) return [];
  const b = bandWeights(alloc);
  const parts: Part[] = [
    { id: "equity", word: "stocks", pct: (b.equity / total) * 100, color: ASSET_CLASSES.equity.color },
    { id: "debt", word: "bonds", pct: (b.debt / total) * 100, color: ASSET_CLASSES.debt.color },
    { id: "gold", word: "gold", pct: (b.gold / total) * 100, color: ASSET_CLASSES.gold.color },
  ];
  return parts.filter((p) => p.pct > 0.01);
}

/** The mix as one bar: stocks, then bonds, then gold. Decorative: the key
    beside it says the same thing in words, in the same order. */
export function MixBar({ alloc, className = "" }: { alloc: Allocation; className?: string }) {
  return (
    <span className={`flex gap-[2px] overflow-hidden rounded-full ${className}`} aria-hidden>
      {partsOf(alloc).map((p) => (
        <span
          key={p.id}
          className="h-full transition-[flex-grow] duration-300 ease-out motion-reduce:transition-none"
          style={{ flex: `${p.pct} 1 0%`, background: p.color }}
        />
      ))}
    </span>
  );
}

/** The bar's key, as words: "53% stocks, 27% bonds, 20% gold". Each part
    stays on one line, so a percent is never split from its word, and a
    line may only break between two parts. `swatches` adds the bar's
    colours, for the one place that introduces them. */
export function MixKey({ alloc, swatches = false }: { alloc: Allocation; swatches?: boolean }) {
  const parts = partsOf(alloc).filter((p) => Math.round(p.pct) > 0);
  return (
    <>
      {parts.map((p, i) => (
        <span key={p.id}>
          <span className="whitespace-nowrap">
            {swatches && <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />}
            <span className="font-medium text-text">{Math.round(p.pct)}%</span> {p.word}
            {i < parts.length - 1 ? "," : ""}
          </span>
          {i < parts.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function StepMark({ plus }: { plus?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M3.5 8h9" />
      {plus && <path d="M8 3.5v9" />}
    </svg>
  );
}

const stepButton =
  "grid w-11 flex-none place-items-center text-text-2 transition hover:bg-surface-2 hover:text-text focus-visible:-outline-offset-2 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-2";

/**
 * One fund in a mix: its name in full, what kind of money it is, what it
 * gets, and its share with a minus and a plus that are each a full 44px to
 * tap. On a phone the name has the first lines to itself and the share
 * sits under it. From the sm breakpoint up it is one row.
 */
export function MixRow({
  name,
  color,
  kind,
  sub,
  pct,
  note,
  solo,
  onStep,
  onRemove,
  children,
}: {
  name: string;
  /** The asset class: its colour, and its name for the dot's tooltip. */
  color: string;
  kind: string;
  /** A quiet line under the name: what kind of money it is ("Stocks"). */
  sub?: string;
  pct: number;
  /** One quiet fact beside the share: what the fund gets ("₹9,250 a
      month"), or what kind of thing it is ("Gilt fund"). */
  note?: string;
  /** The only fund in the mix: it is 100% and cannot be stepped. */
  solo?: boolean;
  onStep: (delta: number) => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-[0.4375rem] h-2.5 w-2.5 flex-none rounded-full" style={{ background: color }} title={kind} />
        <div className="min-w-0">
          <p className="break-words text-row font-medium text-text">{name}</p>
          {sub && <p className="text-support text-text-2">{sub}</p>}
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="grid h-11 w-11 flex-none place-items-center rounded-control text-text-2 transition hover:bg-surface-2 hover:text-text sm:order-last"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 pl-5 sm:basis-auto sm:pl-0">
        {note && <span className="num whitespace-nowrap text-support text-text-2">{note}</span>}
        <div className="ml-auto inline-flex h-[2.875rem] flex-none items-stretch overflow-hidden rounded-control border border-line-2 bg-surface">
          <button
            type="button"
            onClick={() => onStep(-5)}
            disabled={solo || pct <= 0}
            aria-label={`Lower ${name} share`}
            className={`${stepButton} border-r border-line`}
          >
            <StepMark />
          </button>
          <span className="num grid w-[3.25rem] place-items-center text-row font-medium text-text">{pct}%</span>
          <button
            type="button"
            onClick={() => onStep(5)}
            disabled={solo || pct >= 100}
            aria-label={`Raise ${name} share`}
            className={`${stepButton} border-l border-line`}
          >
            <StepMark plus />
          </button>
        </div>
      </div>
    </li>
  );
}

/** "Add" until the thing is in the mix, then an ink "Added": the app's
    mark for a selected state, readable without colour. */
export function AddMark({ on, busy }: { on: boolean; busy?: boolean }) {
  return (
    <span
      className={`flex-none whitespace-nowrap rounded-full px-3 py-1 text-caption font-medium ${
        on ? "bg-accent-fill text-on-accent" : "border border-line-2 text-text"
      }`}
    >
      {busy ? "Adding" : on ? "Added" : "Add"}
    </span>
  );
}

/**
 * The ONE portfolio every goal shares. There's no per-goal basket anymore: the
 * whole monthly amount grows in this single mix, and each goal simply draws
 * its share of that money. The person chooses the mix; this screen shows the
 * three ready-made ones as equals and states facts about each.
 *
 * It renders the Portfolio tab's blocks straight into the tab's grid: the
 * mix itself across the top, then on a wide screen what the mix holds on
 * the left and the ways to change it on the right. On a phone they stack in
 * the order a person meets them: the mix, the risk level, the ready-made
 * mixes, then the funds with the search that adds one more.
 */
export default function PortfolioBuilder() {
  const s = useStore();
  const alloc: Allocation = s.portfolio;
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Links from the plan land on the place the mix is changed, or on the funds in it.
  const mixFocus = useFocus(FOCUS.mix);
  const fundsFocus = useFocus(FOCUS.funds);

  // Live universe search (AMFI via /api/instruments), debounced. Failures are
  // silent: the built-in list keeps working without the network.
  const [liveRows, setLiveRows] = useState<LiveSchemeRow[]>([]);
  const [liveBusy, setLiveBusy] = useState(false);
  const [addingCode, setAddingCode] = useState<number | null>(null);
  const searchSeq = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
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
        // Names first, instantly, in the order the search returned them.
        // Past returns then fill in per row (each detail call is edge-cached).
        // Nothing is ranked or scored here: a ranked list reads as a pick.
        const base = rows.slice(0, 8);
        setLiveRows(base);
        setLiveBusy(false);
        const detailed = await Promise.all(
          base.map(async (r) => {
            const d = await getLiveSchemeDetail(r.schemeCode);
            return d ? { ...r, cagr1y: d.cagr1y, cagr3y: d.cagr3y, cagr5y: d.cagr5y } : r;
          }),
        );
        if (searchSeq.current !== seq) return;
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
  // Stepping a fund sets its %, and the others rebalance to keep 100%.
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
  const presetAlloc = (key: RiskProfile) => normalizeTo100(MODEL_PORTFOLIOS[key].allocation);
  const applyPreset = (key: RiskProfile) => setAlloc(presetAlloc(key), key);
  // What each ready-made mix would do to the goals, before it is applied:
  // the same money, the same split, only the mix changed.
  const previewFor = (key: RiskProfile) =>
    s.goals.length ? onTrackCount(outlook({ ...planShape(s), allocation: presetAlloc(key) })) : null;

  // By kind of money, then by name: an order that does not depend on which
  // fund was stepped last, so a row never moves from under the finger.
  const holdings = Object.keys(alloc)
    .filter((id) => FUND_MAP[id])
    .sort(
      (a, b) =>
        CLASS_ORDER.indexOf(FUND_MAP[a].assetClass) - CLASS_ORDER.indexOf(FUND_MAP[b].assetClass) ||
        FUND_MAP[a].name.localeCompare(FUND_MAP[b].name),
    );
  const equityShare = total > 0 ? bands.equity / total : 0;
  const equityHeavy = total > 0 && equityShare > 0.7 && bands.debt / Math.max(total, 1) < 0.1;

  const soonGoal = s.goals.length ? [...s.goals].sort((a, b) => a.horizonYears - b.horizonYears)[0] : undefined;
  const nearTermRisk = !!soonGoal && soonGoal.horizonYears <= 3 && equityShare > 0.55;

  const typed = search.trim();
  const range = (low: number, high: number) => (
    <span className="whitespace-nowrap">
      {formatINR(low)} to {formatINR(high)}
    </span>
  );

  return (
    <>
      {/* ---- The mix itself: the page opens on it, on the bare page. ---- */}
      <section className="order-first min-w-0 lg:col-span-2">
        <h2 className="text-headline font-medium text-text">Your mix</h2>
        {total > 0 ? (
          <>
            <MixBar alloc={alloc} className="mt-3 h-4 lg:h-5" />
            <div className="mt-3 grid gap-x-6 gap-y-2 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              {/* One sentence: where each month's money goes. */}
              <p className="num text-body text-text-2">
                {sip > 0 ? (
                  <>
                    Your <span className="whitespace-nowrap font-medium text-text">{formatINR(sip)}</span> a month goes:{" "}
                  </>
                ) : (
                  "This mix is: "
                )}
                <MixKey alloc={alloc} swatches />
              </p>
              {/* Ranges, never point estimates (section 5): one plain paragraph. */}
              <p className="num text-pretty text-support text-text-2">
                This plan assumes this mix grows{" "}
                <span className="whitespace-nowrap font-medium text-text">
                  {formatPct(band.low, 0)} to {formatPct(band.high, 0)}
                </span>{" "}
                a year. At that pace ₹1 lakh becomes {range(band.threeYearLow, band.threeYearHigh)} in 3 years and{" "}
                {range(band.tenYearLow, band.tenYearHigh)} in 10. These are assumptions, not past returns and not a forecast.
              </p>
            </div>
            {/* A plain fact about this mix, shown only when it applies: a goal
                is close and the mix leans on stocks, or nearly all of it is
                in stocks. The first already says what the second would. */}
            {(nearTermRisk || equityHeavy) && (
              <div className="mt-3 rounded-control bg-surface-2 px-3.5 py-3 text-support text-text">
                {nearTermRisk && soonGoal ? (
                  <p>
                    <span className="font-medium">
                      {soonGoal.name} is {soonGoal.horizonYears} {soonGoal.horizonYears === 1 ? "year" : "years"} away.
                    </span>{" "}
                    {Math.round(equityShare * 100)}% of this mix is in stocks, which can drop a lot in a short time. Money
                    needed soon is usually kept in bonds or cash.
                  </p>
                ) : (
                  <p>Almost all of this mix is in stocks. Stocks can fall a lot in a short time.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-body text-text-2">Your mix is empty. Pick a mix, or search for a fund to add.</p>
        )}
      </section>

      {/* ---- What the mix holds (a drop zone for a dragged option), and
          in the same pane the search that adds one more fund to it: a fund
          added from the search shows up in the list right above it. ---- */}
      <section
        ref={fundsFocus.ref}
        className={`order-4 min-w-0 self-start rounded-card border bg-surface transition-colors lg:order-none ${
          dragOver ? "border-text ring-2 ring-text/20" : "border-line"
        } ${fundsFocus.active ? "focus-flash" : ""}`}
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
        <div className="px-4 pb-2 pt-4 sm:px-5 sm:pb-3 sm:pt-5">
          <h2 className={paneTitle}>
            {holdings.length > 0
              ? `The ${holdings.length} ${holdings.length === 1 ? "fund" : "funds"} in your mix`
              : "The funds in your mix"}
          </h2>
          {holdings.length > 0 ? (
            <>
              {holdings.length > 1 && (
                <p className="mt-1 text-pretty text-support text-text-2">
                  Minus and plus move a fund's share by 5%. The other funds adjust so the mix stays at 100%.
                </p>
              )}
              <ul className="mt-2 divide-y divide-line">
                {holdings.map((id) => {
                  const f = FUND_MAP[id];
                  const pctOfTotal = total > 0 ? Math.round(((alloc[id] ?? 0) / total) * 100) : 0;
                  // A fund the person already holds links to that holding on Money.
                  const owned = holdingForFund(f.name, s.externalHoldings);
                  return (
                    <MixRow
                      key={id}
                      name={f.name}
                      color={ASSET_CLASSES[f.assetClass].color}
                      kind={ASSET_CLASSES[f.assetClass].label}
                      sub={CLASS_WORD[f.assetClass]}
                      pct={pctOfTotal}
                      note={sip > 0 ? `${formatINR(amountFor(id))} a month` : undefined}
                      solo={holdings.length <= 1}
                      onStep={(delta) => setWeight(id, (alloc[id] ?? 0) + delta)}
                      onRemove={() => removeFund(id)}
                    >
                      {owned && (
                        <button
                          type="button"
                          onClick={() => actions.setTab("money", { focus: holdingFocus(owned.id) })}
                          className="group num inline-flex min-h-11 flex-wrap content-center items-center gap-x-1.5 text-left text-support"
                        >
                          {/* The fact, then the link. A line may break between
                              the two, never inside one. */}
                          <span className="whitespace-nowrap text-text-2">You hold {inr(owned.amount)} of this.</span>
                          <span className="whitespace-nowrap font-medium text-text underline underline-offset-2 transition group-hover:text-text-2">
                            See it in Money
                          </span>
                        </button>
                      )}
                    </MixRow>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-1 pb-2 text-support text-text-2">No funds yet.</p>
          )}
        </div>

        {/* ---- Fund search: the live AMFI universe only ---- */}
        <div className="border-t border-line px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <h3 className="text-row font-medium text-text">Want a specific fund?</h3>
          <label htmlFor="fund-search" className="mt-0.5 block text-support text-text-2">
            Search any mutual fund (type 3 letters)
          </label>
          {/* The browser's own small clear mark is switched off: the one
              here is a full 44px to tap. */}
          <div className="relative mt-2">
            <input
              id="fund-search"
              ref={searchInput}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Fund name"
              className={`h-12 w-full rounded-control border border-line-2 bg-surface pl-3 text-body text-text outline-none transition focus:border-text focus:ring-1 focus:ring-text [&::-webkit-search-cancel-button]:appearance-none ${
                search ? "pr-12" : "pr-3"
              }`}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInput.current?.focus();
                }}
                aria-label="Clear the search"
                className="absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center rounded-control text-text-2 transition hover:text-text focus-visible:-outline-offset-2"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>

          <div aria-live="polite">
            {typed.length < 3 && !liveBusy && liveRows.length === 0 && (
              <p className="mt-2 text-pretty text-support text-text-2">Every mutual fund in India, from the official AMFI list.</p>
            )}
            {typed.length >= 3 && !liveBusy && liveRows.length === 0 && (
              <p className="mt-2 text-support text-text-2">No fund matches “{typed}”.</p>
            )}
            {liveBusy && <p className="mt-2 text-support text-text-2">Searching every fund…</p>}
          </div>

          {liveRows.length > 0 && (
            <>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {liveRows.map((row) => {
                  const id = `live_${row.schemeCode}`;
                  const added = id in alloc;
                  const busy = addingCode === row.schemeCode;
                  return (
                    <li key={row.schemeCode}>
                      <button
                        type="button"
                        aria-pressed={added}
                        onClick={() => (added ? removeFund(id) : void addLive(row))}
                        className="-mx-2 flex min-h-[3.25rem] w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 py-2 text-left transition-colors [@media(hover:hover)]:hover:bg-surface-2/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-support font-medium text-text">{row.schemeName}</span>
                          {(row.cagr3y != null || row.cagr5y != null) && (
                            <span className="num block text-support text-text-2">
                              {row.cagr3y != null && <span className="whitespace-nowrap">Past 3 years: {formatPct(row.cagr3y, 1)} a year.</span>}{" "}
                              {row.cagr5y != null && <span className="whitespace-nowrap">Past 5 years: {formatPct(row.cagr5y, 1)} a year.</span>}
                            </span>
                          )}
                        </span>
                        <AddMark on={added} busy={busy} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-pretty text-support text-text-2">
                Past returns are yearly, from official NAV history. They do not tell you what a fund will do next. This
                list is not ranked.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ---- The ways to change it ---- */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        <RiskMeter className="order-2" />

        {/* The three ready-made mixes, as equals: the same facts about each,
            in the same order, and nothing that points at one of them. */}
        <section ref={mixFocus.ref} className={`${card} order-3 min-w-0 ${mixFocus.active ? "focus-flash" : ""}`}>
          <h2 className={paneTitle}>Pick a mix</h2>
          <p className="mt-1 text-pretty text-support text-text-2">Three ready-made mixes. Tap one and it replaces the funds in your mix.</p>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-control border border-line" role="group" aria-label="Ready-made mixes">
            {PRESETS.map((key) => {
              const active = s.portfolioProfile === key;
              const beyond = PRESETS.indexOf(key) > PRESETS.indexOf(appetiteCeiling(s.riskAppetite));
              const preview = previewFor(key);
              const preset = presetAlloc(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyPreset(key)}
                  className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors focus-visible:-outline-offset-2 ${
                    active ? "bg-surface-2 shadow-[inset_3px_0_0_rgb(var(--text))]" : "[@media(hover:hover)]:hover:bg-surface-2/50"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full ${
                      active ? "bg-accent-fill text-on-accent" : "border-[1.5px] border-text-3 bg-surface"
                    }`}
                  >
                    {active && (
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3.5 8.5l3 3 6-6.5" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-row font-medium text-text">{MODEL_PORTFOLIOS[key].label}</span>
                      <span className="text-support text-text-2">{MODEL_PORTFOLIOS[key].tagline}</span>
                    </span>
                    <MixBar alloc={preset} className="mt-2 h-2" />
                    <span className="num mt-1.5 block text-support text-text-2">
                      <MixKey alloc={preset} />
                    </span>
                    {preview !== null && (
                      <span className="num mt-1 block text-pretty text-support text-text">
                        {preview} of {s.goals.length} {s.goals.length === 1 ? "goal" : "goals"} on track with this mix
                      </span>
                    )}
                    {beyond && <span className="mt-1 block text-pretty text-support text-text-2">Riskier than you said you're OK with</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
