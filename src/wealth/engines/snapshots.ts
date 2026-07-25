/**
 * Daily valuation snapshot store (spec §3.1: "persist a daily snapshot").
 *
 * Why a store at all, when the valuation engine can recompute any date on
 * demand: because it cannot. A recomputation done today uses today's price
 * book, today's instrument master and today's transaction set, and all three
 * change under us. AMFI republishes a corrected NAV days later, a CAS ingested
 * next month back-fills a folio we had never seen, a scheme merges and its old
 * ISIN stops resolving. Recomputing last Tuesday would therefore quietly
 * rewrite last Tuesday. The snapshot is what we believed on that date, and a
 * point-in-time truth has to stay put to be worth anything (spec §0, §7).
 *
 * Two rules follow, and both are enforced here rather than left to the caller:
 *
 *  1. CARRY FORWARD, NEVER LOOK FORWARD. A missing date reads the most recent
 *     EARLIER snapshot, exactly as prices do (§6.18). A gap in the series means
 *     "nothing new was computed", not "the household is worth zero", and a
 *     zero would show up as a total wipeout on a chart. Nothing later than the
 *     asked-for date is ever returned: valuing last Tuesday with Thursday's
 *     numbers is time travel, and it is how backtests lie.
 *
 *  2. IMMUTABLE ONCE WRITTEN. A second, different snapshot for a date that
 *     already has one is REJECTED, not merged and not overwritten. Rewriting
 *     history in place is indistinguishable from having been wrong all along.
 *     A correction is published as a new snapshot on a later date. An IDENTICAL
 *     re-put is accepted as a no-op so that replaying an ingest is safe.
 *
 * This is an in-memory adapter. It is deliberately the only stateful thing in
 * the module and it holds no clock and does no I/O, so swapping it for a
 * database-backed implementation means implementing `SnapshotStore` and
 * nothing else.
 */

import type { DateISO, HouseholdId, ValuationSnapshot } from "../domain/types.ts";
import { daysBetween, isValidDate } from "../domain/dates.ts";
import { blocking, info, type EngineWarning } from "../domain/result.ts";

/** Outcome of a `put`. `UNCHANGED` is an idempotent replay, `CONFLICT` is a
 *  rejected attempt to rewrite history. */
export type PutStatus = "STORED" | "UNCHANGED" | "CONFLICT" | "INVALID";

export interface PutOutcome {
  status: PutStatus;
  /** True only when this call added a snapshot the store did not already hold. */
  stored: boolean;
  /** The snapshot already held for that (householdId, asOf), on UNCHANGED/CONFLICT. */
  existing?: ValuationSnapshot;
  warnings: EngineWarning[];
}

/** A snapshot resolved for a date, with the provenance of HOW it was resolved. */
export interface ResolvedSnapshot {
  snapshot: ValuationSnapshot;
  /** True when no snapshot existed on the asked-for date and an earlier one was used. */
  carriedForward: boolean;
  /** Calendar days between the snapshot's own date and the date asked for. */
  ageDays: number;
}

export interface SnapshotStore {
  /** Append a snapshot. Never overwrites an existing (householdId, asOf). */
  put(snapshot: ValuationSnapshot): PutOutcome;
  /**
   * The snapshot in force on `asOf`: that date's own, or the most recent
   * earlier one carried forward. Undefined before the household's first
   * snapshot. The returned snapshot keeps its OWN `asOf`, so a caller can
   * always see which date the numbers are really from.
   */
  get(householdId: HouseholdId, asOf: DateISO): ValuationSnapshot | undefined;
  /** As `get`, but says whether the value was carried forward and by how long. */
  resolve(householdId: HouseholdId, asOf: DateISO): ResolvedSnapshot | undefined;
  /** Most recent snapshot held, regardless of date. */
  latest(householdId: HouseholdId): ValuationSnapshot | undefined;
  /** Snapshots with `from <= asOf <= to`, ascending. Both ends inclusive. */
  range(householdId: HouseholdId, from: DateISO, to: DateISO): ValuationSnapshot[];
  /** Every snapshot held for the household, ascending by date. */
  all(householdId: HouseholdId): ValuationSnapshot[];
  households(): HouseholdId[];
  /** Every problem the store has recorded, seeding included. Never thrown away. */
  warnings(): EngineWarning[];
}

/** Recursively freeze so a stored snapshot cannot be edited through a reference. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/**
 * Structural identity, used to tell an idempotent replay from a real conflict.
 * Key order matters, so a snapshot rebuilt with its fields in a different order
 * counts as a conflict. That errs toward refusing the write, which is the safe
 * direction for an immutable record.
 */
function sameSnapshot(a: ValuationSnapshot, b: ValuationSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Build an in-memory snapshot store, optionally seeded.
 *
 * Seed rows go through the same `put` path as everything else, so a seed array
 * containing two different snapshots for one date is reported through
 * `warnings()` rather than silently collapsing to whichever came last.
 */
export function createSnapshotStore(initial: ValuationSnapshot[] = []): SnapshotStore {
  /** Per household, ascending by `asOf`. Daily cadence keeps this small. */
  const byHousehold = new Map<HouseholdId, ValuationSnapshot[]>();
  const storeWarnings: EngineWarning[] = [];

  function series(householdId: HouseholdId): ValuationSnapshot[] {
    return byHousehold.get(householdId) ?? [];
  }

  /** Index of the last snapshot at or before `asOf`, or -1. Binary search. */
  function indexAtOrBefore(list: ValuationSnapshot[], asOf: DateISO): number {
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].asOf <= asOf) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  function put(snapshot: ValuationSnapshot): PutOutcome {
    const warnings: EngineWarning[] = [];

    if (!snapshot || !snapshot.householdId || !isValidDate(snapshot.asOf)) {
      warnings.push(
        blocking(
          "SNAPSHOT_INVALID",
          `Snapshot for household ${snapshot?.householdId ?? "(none)"} has an unusable date ` +
            `${JSON.stringify(snapshot?.asOf)}. Dates are YYYY-MM-DD; anything else breaks the ` +
            `ordering the whole series depends on, so the snapshot was not stored.`,
          snapshot?.householdId,
        ),
      );
      storeWarnings.push(...warnings);
      return { status: "INVALID", stored: false, warnings };
    }

    const list = byHousehold.get(snapshot.householdId) ?? [];
    if (!byHousehold.has(snapshot.householdId)) byHousehold.set(snapshot.householdId, list);

    const at = indexAtOrBefore(list, snapshot.asOf);
    const existing = at >= 0 && list[at].asOf === snapshot.asOf ? list[at] : undefined;

    if (existing) {
      if (sameSnapshot(existing, snapshot)) {
        // Replaying the same ingest must not be an error, or every retry becomes one.
        const w = info(
          "SNAPSHOT_REPLAY",
          `Snapshot for ${snapshot.householdId} on ${snapshot.asOf} was written again with identical ` +
            `contents; kept the original.`,
          snapshot.householdId,
        );
        warnings.push(w);
        storeWarnings.push(w);
        return { status: "UNCHANGED", stored: false, existing, warnings };
      }
      const w = blocking(
        "SNAPSHOT_IMMUTABLE",
        `A different snapshot already exists for ${snapshot.householdId} on ${snapshot.asOf} ` +
          `(total assets ${existing.totalAssets} held, ${snapshot.totalAssets} offered). Snapshots are ` +
          `point-in-time truth and are never rewritten: publish the correction as a later snapshot instead.`,
        snapshot.householdId,
      );
      warnings.push(w);
      storeWarnings.push(w);
      return { status: "CONFLICT", stored: false, existing, warnings };
    }

    // Store a frozen private copy: the caller keeps its own object and cannot
    // mutate history through the reference it handed us.
    const copy = deepFreeze(structuredClone(snapshot));
    list.splice(at + 1, 0, copy);
    return { status: "STORED", stored: true, warnings };
  }

  function resolve(householdId: HouseholdId, asOf: DateISO): ResolvedSnapshot | undefined {
    if (!isValidDate(asOf)) return undefined;
    const list = series(householdId);
    const at = indexAtOrBefore(list, asOf);
    if (at < 0) return undefined; // nothing was ever computed on or before this date
    const snapshot = list[at];
    return {
      snapshot,
      carriedForward: snapshot.asOf !== asOf,
      ageDays: daysBetween(snapshot.asOf, asOf),
    };
  }

  for (const snapshot of initial) put(snapshot);

  return {
    put,
    get: (householdId, asOf) => resolve(householdId, asOf)?.snapshot,
    resolve,
    latest: (householdId) => {
      const list = series(householdId);
      return list.length ? list[list.length - 1] : undefined;
    },
    range: (householdId, from, to) => {
      if (!isValidDate(from) || !isValidDate(to) || to < from) return [];
      return series(householdId).filter((s) => s.asOf >= from && s.asOf <= to);
    },
    all: (householdId) => [...series(householdId)],
    households: () => [...byHousehold.keys()],
    warnings: () => [...storeWarnings],
  };
}
