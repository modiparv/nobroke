import { useState } from "react";
import { ASSET_CLASSES, FUND_MAP } from "../lib/funds";
import { allocationTotal, blendedReturn } from "../lib/finance";
import { POOL_GROUPS, POOL_ITEMS, isPoolInstrument, sameMix, withInstrument, withWeight, withoutInstrument } from "../lib/bucket";
import { formatPct } from "../lib/format";
import { actions, useStore } from "../store";
import { btnPrimary } from "../ui";
import { AddMark, MixBar, MixKey, MixRow } from "./PortfolioBuilder";

/**
 * Build your own mix: the advanced corner of the Portfolio tab, closed
 * until it is asked for (or until a draft is waiting in it). It follows
 * its own one-line instruction from start to end: add funds from every
 * option, set how much goes to each, then apply. Nothing touches the live
 * mix until "Apply this mix", the one main button on this tab.
 */

/** A group's label may carry a note in brackets: "ETFs (need a demat
    account)". The chip shows the short name. The note is said in full
    under the chips when that group is open. */
function splitLabel(label: string): { short: string; note: string | null } {
  const m = label.match(/^(.*?)\s*\((.*)\)$/);
  return m ? { short: m[1], note: `${m[1]} ${m[2]}.` } : { short: label, note: null };
}

const textLink =
  "inline-flex min-h-11 items-center text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2";

/** The fund search sits in the funds pane, above this one on every screen.
    The link scrolls to it and puts the cursor in it. */
function goToSearch() {
  const field = document.getElementById("fund-search");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  field?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  field?.focus({ preventScroll: true });
}

/** What each option is, in a word or two: "Gilt fund", "Equity ETF". */
const KIND: Record<string, string> = Object.fromEntries(POOL_ITEMS.map((i) => [i.id, i.kind]));
/** Each option's place in the list of all options. The draft is shown in
    this order, so a row never moves when its share is stepped. */
const PLACE: Record<string, number> = Object.fromEntries(POOL_ITEMS.map((i, n) => [i.id, n]));

export default function BucketBuilder({ className = "" }: { className?: string }) {
  const s = useStore();
  const bucket = s.bucket;
  const [dragOver, setDragOver] = useState(false);

  const total = allocationTotal(bucket);
  // Every fund in the draft, including one stepped down to 0%: it stays in
  // the list (the option above still says "Added") until it is removed.
  const ids = Object.keys(bucket)
    .filter((k) => FUND_MAP[k])
    .sort((a, b) => (PLACE[a] ?? POOL_ITEMS.length) - (PLACE[b] ?? POOL_ITEMS.length) || a.localeCompare(b));
  const ret = blendedReturn(bucket);
  const isLive = total > 0 && sameMix(bucket, s.portfolio);

  // Open on arrival only when a draft is already waiting.
  const [open, setOpen] = useState(ids.length > 0);
  const [groupLabel, setGroupLabel] = useState(POOL_GROUPS[0].label);
  const group = POOL_GROUPS.find((g) => g.label === groupLabel) ?? POOL_GROUPS[0];
  const groupNote = splitLabel(group.label).note;

  const add = (id: string) => actions.setBucket(withInstrument(bucket, id));
  const remove = (id: string) => actions.setBucket(withoutInstrument(bucket, id));
  const nudge = (id: string, delta: number) => actions.setBucket(withWeight(bucket, id, (bucket[id] ?? 0) + delta));

  const picked = `${ids.length} ${ids.length === 1 ? "fund" : "funds"} in your draft.`;
  const summary =
    ids.length === 0
      ? "Add funds, set how much goes to each, then apply. Nothing changes until you tap Apply."
      : isLive
        ? `${picked} This is your mix now.`
        : `${picked} Nothing changes until you tap Apply.`;

  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface ${className}`}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="own-mix"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[4.25rem] w-full items-center justify-between gap-4 rounded-card px-4 py-3.5 text-left sm:px-5"
        >
          <span className="min-w-0">
            <span className="block text-section font-medium text-text">Build your own mix (advanced)</span>
            <span className="mt-0.5 block text-pretty text-support font-normal tracking-normal text-text-2">{summary}</span>
          </span>
          <span className="flex flex-none items-center gap-1.5 text-support font-medium tracking-normal text-text">
            {open ? "Hide" : "Show"}
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </button>
      </h2>

      {open && (
        <div id="own-mix" className="grid gap-x-6 gap-y-5 border-t border-line p-4 sm:p-5 lg:grid-cols-2">
          {/* ---- All options, one kind at a time ---- */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-row font-medium text-text">All options</h3>
              <span className="text-support text-text-2">Tap to add</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Kind of option">
              {POOL_GROUPS.map((g) => {
                const on = g.label === group.label;
                return (
                  <button
                    key={g.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGroupLabel(g.label)}
                    className={`inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-support transition ${
                      on ? "bg-accent-fill font-medium text-on-accent" : "border border-line-2 text-text hover:border-text"
                    }`}
                  >
                    {splitLabel(g.label).short}
                  </button>
                );
              })}
            </div>
            {groupNote && <p className="mt-3 text-support text-text-2">{groupNote}</p>}
            <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-1">
              {group.items.map((item) => {
                const f = FUND_MAP[item.id];
                if (!f) return null;
                const inBucket = item.id in bucket;
                return (
                  <li key={item.id} className="border-b border-line">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={inBucket}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => (inBucket ? remove(item.id) : add(item.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          (inBucket ? remove : add)(item.id);
                        }
                      }}
                      className="-mx-2 flex h-full min-h-[3.5rem] cursor-pointer select-none items-start gap-2.5 rounded-control px-2 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-surface-2/50"
                    >
                      <span
                        className="mt-[0.4375rem] h-2.5 w-2.5 flex-none rounded-full"
                        style={{ background: ASSET_CLASSES[f.assetClass].color }}
                        title={ASSET_CLASSES[f.assetClass].label}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-row font-medium text-text">{f.name}</span>
                        <span className="block text-support text-text-2">
                          {item.kind}. {item.note}
                        </span>
                      </span>
                      <AddMark on={inBucket} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-pretty text-support text-text-2">Can't find your fund? The search adds a fund straight to your mix.</p>
            <button type="button" onClick={goToSearch} className={textLink}>
              Use the search
            </button>
          </div>

          {/* ---- The draft (a drop zone for a dragged option) ---- */}
          <div
            aria-label="Your draft mix"
            className={`min-w-0 border-t pt-5 transition-colors lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 ${
              dragOver ? "border-text" : "border-line"
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
              if (isPoolInstrument(id)) add(id);
            }}
          >
            <h3 className="text-row font-medium text-text">Your draft mix</h3>

            {ids.length === 0 ? (
              <div className="mt-3 rounded-control border border-dashed border-line-2 px-4 py-6 text-center">
                <p className="text-support font-medium text-text">Your draft is empty.</p>
                <p className="mt-1 text-support text-text-2">Tap a fund to add it.</p>
              </div>
            ) : (
              <>
                <ul className="mt-1 divide-y divide-line">
                  {ids.map((id) => {
                    const f = FUND_MAP[id];
                    return (
                      <MixRow
                        key={id}
                        name={f.name}
                        color={ASSET_CLASSES[f.assetClass].color}
                        kind={ASSET_CLASSES[f.assetClass].label}
                        pct={Math.round(((bucket[id] ?? 0) / total) * 100)}
                        note={KIND[id] ?? ASSET_CLASSES[f.assetClass].label}
                        solo={ids.length <= 1}
                        onStep={(delta) => nudge(id, delta)}
                        onRemove={() => remove(id)}
                      />
                    );
                  })}
                </ul>

                {/* How the draft splits into stocks, bonds and gold. */}
                <MixBar alloc={bucket} className="mt-3 h-2.5" />
                <p className="num mt-2 text-support text-text-2">
                  <MixKey alloc={bucket} />
                </p>
                <p className="num mt-1 text-support text-text-2">
                  With this mix the plan would assume <span className="whitespace-nowrap font-medium text-text">{formatPct(ret, 1)}</span>{" "}
                  growth a year.
                </p>

                {isLive ? (
                  <>
                    <p className="mt-4 text-support font-medium text-text">This is your mix now.</p>
                    <button type="button" onClick={() => actions.setTab("plan")} className={textLink}>
                      See your goals
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={actions.applyBucketAsMix} className={`${btnPrimary} mt-4 w-full`}>
                      Apply this mix
                    </button>
                    <p className="mt-2 text-pretty text-support text-text-2">Replaces your current mix. All goals share one mix.</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
