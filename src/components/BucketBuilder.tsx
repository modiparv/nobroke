import { useState } from "react";
import { ASSET_CLASSES, FUND_MAP } from "../lib/funds";
import { allocationTotal, bandWeights, blendedReturn } from "../lib/finance";
import {
  POOL_GROUPS,
  isPoolInstrument,
  sameMix,
  suggestedInstruments,
  withInstrument,
  withWeight,
  withoutInstrument,
} from "../lib/bucket";
import { formatPct } from "../lib/format";
import { actions, useStore } from "../store";
import { sectionLabel } from "../ui";

/**
 * The bucket studio: the right half of the portfolio room. A drafting table —
 * drag instruments from the pool into the bucket, weight them, name the goal
 * it is for — that touches nothing until "Make this the live mix" hands the
 * draft to the engine. The left pane is the live mix; this is the sketchbook.
 */

function Grip() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="currentColor" aria-hidden className="flex-none">
      {[0, 5].map((x) => [0, 5, 10].map((y) => <circle key={`${x}${y}`} cx={x + 1} cy={y + 1} r="1" />))}
    </svg>
  );
}

export default function BucketBuilder() {
  const s = useStore();
  const bucket = s.bucket;
  const [dragOver, setDragOver] = useState(false);

  const total = allocationTotal(bucket);
  const ids = Object.keys(bucket).filter((k) => (bucket[k] ?? 0) > 0);
  const bands = bandWeights(bucket);
  const ret = blendedReturn(bucket);
  const isLive = total > 0 && sameMix(bucket, s.portfolio);

  const add = (id: string) => actions.setBucket(withInstrument(bucket, id));
  const remove = (id: string) => actions.setBucket(withoutInstrument(bucket, id));
  const nudge = (id: string, delta: number) => actions.setBucket(withWeight(bucket, id, (bucket[id] ?? 0) + delta));

  const suggestions = suggestedInstruments(s.riskAppetite).filter((p) => !(p.id in bucket));
  const goalName = s.bucketGoalId ? s.goals.find((g) => g.id === s.bucketGoalId)?.name : undefined;

  const segs = [
    { label: "Stocks", v: bands.equity, color: ASSET_CLASSES.equity.color },
    { label: "Bonds", v: bands.debt, color: ASSET_CLASSES.debt.color },
    { label: "Gold", v: bands.gold, color: ASSET_CLASSES.gold.color },
  ].filter((x) => x.v > 0.01);

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-support text-text">Bucket studio</span>
        <span className="text-caption text-text-2">{ids.length ? `${ids.length} in hand` : "A draft, until you apply it"}</span>
      </div>

      <div className="p-3.5 sm:p-4">
        <p className="text-support text-text-2">
          Your methodology, your bucket. Drag instruments in from the pool, weight them, and when it feels right, make
          it the live mix.
        </p>

        {/* What this bucket is for. Chips wrap; nothing here ever scrolls. */}
        {s.goals.length > 0 && (
          <div className="mt-4">
            <span className={sectionLabel}>Building toward</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[{ id: null as string | null, name: "The whole plan" }, ...s.goals].map((g) => {
                const sel = s.bucketGoalId === g.id;
                return (
                  <button
                    key={g.id ?? "all"}
                    type="button"
                    onClick={() => actions.setBucketGoal(g.id)}
                    className={`rounded-full px-3 py-1 text-support transition ${
                      sel
                        ? "bg-accent-fill font-medium text-on-accent"
                        : "border border-line text-text-2 hover:border-line-2 hover:text-text"
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- The bucket (drop zone) ---- */}
        <div
          aria-label="Your bucket"
          className={`mt-4 rounded-card border p-3.5 transition ${
            dragOver ? "border-text ring-2 ring-text/20" : ids.length === 0 ? "border-dashed border-line-2" : "border-line"
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
          <div className="flex items-baseline justify-between gap-2">
            <span className={sectionLabel}>In the bucket</span>
            {total > 0 && (
              <span className="num text-caption text-text-2">
                Near <span className="font-medium text-text">{formatPct(ret, 1)}</span> a year, historically
              </span>
            )}
          </div>

          {ids.length === 0 ? (
            <div className="mt-3 px-3 py-6 text-center">
              <p className="text-support font-medium text-text">Drag your first instrument here</p>
              <p className="mt-1 text-caption text-text-2">or tap anything in the pool below.</p>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-col gap-1.5">
                {ids.map((id) => {
                  const f = FUND_MAP[id];
                  if (!f) return null;
                  const pct = Math.round(((bucket[id] ?? 0) / total) * 100);
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-control bg-surface-2/40 px-2 py-1.5">
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-full"
                        style={{ background: ASSET_CLASSES[f.assetClass].color }}
                        title={ASSET_CLASSES[f.assetClass].label}
                      />
                      <span className="min-w-0 flex-1 truncate text-support font-medium leading-tight">{f.name}</span>
                      <button
                        onClick={() => nudge(id, -5)}
                        aria-label={`Lower ${f.name} share`}
                        className="grid h-6 w-6 flex-none place-items-center rounded-md border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        −
                      </button>
                      <span className="num w-9 flex-none text-center text-caption font-medium">{pct}%</span>
                      <button
                        onClick={() => nudge(id, 5)}
                        aria-label={`Raise ${f.name} share`}
                        className="grid h-6 w-6 flex-none place-items-center rounded-md border border-line text-muted transition hover:border-ink hover:text-ink"
                      >
                        +
                      </button>
                      <button
                        onClick={() => remove(id)}
                        aria-label={`Remove ${f.name}`}
                        className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* How the bucket splits into the three bands */}
              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-line">
                {segs.map((sg) => (
                  <div
                    key={sg.label}
                    className="h-full transition-[width] duration-500 ease-out"
                    style={{ width: `${(sg.v / total) * 100}%`, background: sg.color }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-index uppercase tracking-wide text-text-2">
                {segs.map((l) => (
                  <span key={l.label} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: l.color }} />
                    {l.label} {Math.round((l.v / total) * 100)}%
                  </span>
                ))}
              </div>

              <button
                type="button"
                disabled={isLive}
                onClick={actions.applyBucketAsMix}
                className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-control bg-accent-fill text-support font-medium text-on-accent transition hover:bg-accent-fill-hi disabled:cursor-not-allowed disabled:bg-line-2 disabled:text-text-2"
              >
                {isLive ? "This is the live mix" : "Make this the live mix"}
              </button>
              <p className="mt-1.5 text-center text-caption text-text-2">
                {isLive
                  ? "The pane on the left is running exactly this bucket."
                  : goalName
                    ? `Replaces the mix on the left. One shared mix powers every goal, ${goalName} in front.`
                    : "Replaces the mix on the left. Every goal grows in the one shared mix."}
              </p>
            </>
          )}
        </div>

        {/* ---- A starting hand, matched to appetite ---- */}
        {suggestions.length > 0 && (
          <div className="mt-4">
            <span className={sectionLabel}>Suggested for your appetite</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p.id)}
                  title={p.note}
                  className="rounded-full border border-line px-2.5 py-1 text-support text-text transition hover:border-ink"
                >
                  + {FUND_MAP[p.id]?.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- The pool ---- */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={sectionLabel}>The pool</span>
            <span className="text-caption text-text-2">Drag in, or tap to add</span>
          </div>
          <div className="mt-2 flex flex-col gap-3">
            {POOL_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-index uppercase tracking-wide text-text-3">{group.label}</p>
                <div className="mt-1 flex flex-col">
                  {group.items.map((item) => {
                    const f = FUND_MAP[item.id];
                    if (!f) return null;
                    const inBucket = item.id in bucket;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
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
                        title={item.note}
                        className="flex cursor-grab select-none items-center gap-2 rounded-control px-2 py-1.5 text-left transition hover:bg-surface-2/60 active:cursor-grabbing"
                      >
                        <span className="text-text-3">
                          <Grip />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-support font-medium text-text">{f.name}</span>
                        <span className="hidden flex-none text-caption text-text-2 sm:inline">{item.kind}</span>
                        <span
                          className={`flex-none rounded-full px-2 py-0.5 text-index font-medium uppercase tracking-wide ${
                            inBucket ? "bg-accent-fill text-on-accent" : "border border-line text-text-2"
                          }`}
                        >
                          {inBucket ? "In" : "Add"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 px-2 text-caption text-text-2">
            Want a specific fund? The search on the left covers every AMFI-listed scheme, A to Z.
          </p>
        </div>
      </div>
    </section>
  );
}
