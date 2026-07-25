/**
 * Snapshot store tests (spec §3.1).
 *
 * The store exists to stop two specific lies: a gap in the series reading as a
 * wipeout, and history being quietly rewritten after the fact. Each test pins
 * one of those, plus the never-look-forward rule the whole point-in-time idea
 * rests on.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createSnapshotStore } from "./snapshots.ts";
import type { PositionValuation, ValuationSnapshot } from "../domain/types.ts";

function position(over: Partial<PositionValuation> = {}): PositionValuation {
  return {
    positionId: "pos:1",
    instrumentId: "INST1",
    accountId: "acc1",
    memberId: "m1",
    units: 100,
    price: 10,
    value: 1000,
    investedCost: 800,
    unrealisedGain: 200,
    method: "UNITS_X_NAV",
    priceAsOf: "2024-06-14",
    priceSource: "AMFI",
    stalePrice: false,
    illiquid: false,
    assetClass: "EQUITY",
    instrumentType: "MF",
    taxRegimeKey: "EQUITY_MF",
    ...over,
  };
}

function snap(asOf: string, totalAssets: number, over: Partial<ValuationSnapshot> = {}): ValuationSnapshot {
  return {
    householdId: "hh1",
    asOf,
    currency: "INR",
    positions: [position({ value: totalAssets })],
    totalAssets,
    totalInvestedCost: totalAssets,
    totalUnrealisedGain: 0,
    hasStalePrices: false,
    hasUnvaluedPositions: false,
    ...over,
  };
}

test("get returns the snapshot written for that exact date", () => {
  const store = createSnapshotStore([snap("2024-06-10", 100_000)]);
  assert.equal(store.get("hh1", "2024-06-10")?.totalAssets, 100_000);
});

test("a date with no snapshot carries the most recent EARLIER one forward", () => {
  // A gap must not read as zero net worth: nothing was computed on the 11th,
  // the household did not become worthless on the 11th.
  const store = createSnapshotStore([snap("2024-06-10", 100_000), snap("2024-06-14", 105_000)]);

  const resolved = store.resolve("hh1", "2024-06-12");
  assert.ok(resolved);
  assert.equal(resolved.snapshot.totalAssets, 100_000);
  assert.equal(resolved.carriedForward, true);
  assert.equal(resolved.ageDays, 2);
  // The carried snapshot keeps its OWN date, so the caller can see the numbers
  // are from the 10th rather than being told they are the 12th's.
  assert.equal(resolved.snapshot.asOf, "2024-06-10");
});

test("get never looks forward to a later snapshot", () => {
  const store = createSnapshotStore([snap("2024-06-14", 105_000)]);
  assert.equal(store.get("hh1", "2024-06-10"), undefined, "Friday's numbers cannot value the preceding Monday");
});

test("get returns undefined before the household's first snapshot", () => {
  const store = createSnapshotStore([snap("2024-06-10", 100_000)]);
  assert.equal(store.get("hh1", "2024-06-09"), undefined);
  assert.equal(store.resolve("hh1", "2024-06-09"), undefined);
});

test("an exact-date hit is not reported as carried forward", () => {
  const store = createSnapshotStore([snap("2024-06-10", 100_000), snap("2024-06-14", 105_000)]);
  const resolved = store.resolve("hh1", "2024-06-14");
  assert.equal(resolved?.carriedForward, false);
  assert.equal(resolved?.ageDays, 0);
});

test("a snapshot is immutable: a different snapshot for the same date is rejected", () => {
  const store = createSnapshotStore([snap("2024-06-10", 100_000)]);
  const outcome = store.put(snap("2024-06-10", 999_999));

  assert.equal(outcome.status, "CONFLICT");
  assert.equal(outcome.stored, false);
  assert.equal(outcome.existing?.totalAssets, 100_000);
  assert.ok(outcome.warnings.some((w) => w.code === "SNAPSHOT_IMMUTABLE" && w.severity === "BLOCKING"));
  assert.equal(store.get("hh1", "2024-06-10")?.totalAssets, 100_000, "history must be untouched");
  assert.equal(store.all("hh1").length, 1, "the rejected snapshot must not be appended either");
  assert.ok(store.warnings().some((w) => w.code === "SNAPSHOT_IMMUTABLE"));
});

test("re-putting an identical snapshot is an idempotent no-op, not a conflict", () => {
  // Replaying an ingest must be safe, otherwise every retry looks like corruption.
  const store = createSnapshotStore([snap("2024-06-10", 100_000)]);
  const outcome = store.put(snap("2024-06-10", 100_000));

  assert.equal(outcome.status, "UNCHANGED");
  assert.equal(outcome.stored, false);
  assert.equal(store.all("hh1").length, 1);
  assert.ok(!outcome.warnings.some((w) => w.severity === "BLOCKING"));
});

test("a stored snapshot is frozen and decoupled from the caller's object", () => {
  const store = createSnapshotStore();
  const original = snap("2024-06-10", 100_000);
  store.put(original);

  original.totalAssets = 1;
  original.positions[0].value = 1;

  const stored = store.get("hh1", "2024-06-10")!;
  assert.equal(stored.totalAssets, 100_000, "mutating the input after put must not rewrite history");
  assert.equal(stored.positions[0].value, 100_000);
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.positions));
  assert.ok(Object.isFrozen(stored.positions[0]));
});

test("a snapshot with an unusable date is rejected rather than stored under a broken key", () => {
  const store = createSnapshotStore();
  const outcome = store.put(snap("2024-6-1", 100_000));

  assert.equal(outcome.status, "INVALID");
  assert.equal(outcome.stored, false);
  assert.equal(store.all("hh1").length, 0);
  assert.ok(outcome.warnings.some((w) => w.code === "SNAPSHOT_INVALID" && w.severity === "BLOCKING"));
});

test("seed conflicts are surfaced through warnings, never silently resolved", () => {
  const store = createSnapshotStore([snap("2024-06-10", 100_000), snap("2024-06-10", 200_000)]);
  assert.equal(store.all("hh1").length, 1);
  assert.equal(store.get("hh1", "2024-06-10")?.totalAssets, 100_000, "first write wins");
  assert.ok(store.warnings().some((w) => w.code === "SNAPSHOT_IMMUTABLE"));
});

test("out-of-order writes still produce an ascending series and a correct latest()", () => {
  const store = createSnapshotStore();
  store.put(snap("2024-06-14", 105_000));
  store.put(snap("2024-06-10", 100_000));
  store.put(snap("2024-06-12", 102_000));

  assert.deepEqual(store.all("hh1").map((s) => s.asOf), ["2024-06-10", "2024-06-12", "2024-06-14"]);
  assert.equal(store.latest("hh1")?.asOf, "2024-06-14");
  assert.equal(store.get("hh1", "2024-06-13")?.asOf, "2024-06-12");
});

test("range is inclusive at both ends and ascending", () => {
  const store = createSnapshotStore([
    snap("2024-06-10", 1), snap("2024-06-12", 2), snap("2024-06-14", 3), snap("2024-06-18", 4),
  ]);
  assert.deepEqual(
    store.range("hh1", "2024-06-12", "2024-06-14").map((s) => s.asOf),
    ["2024-06-12", "2024-06-14"],
  );
  assert.deepEqual(store.range("hh1", "2024-06-14", "2024-06-12"), [], "a backwards range returns nothing");
});

test("households are isolated from one another", () => {
  const store = createSnapshotStore([
    snap("2024-06-10", 100_000),
    snap("2024-06-10", 500_000, { householdId: "hh2" }),
  ]);
  assert.equal(store.get("hh1", "2024-06-10")?.totalAssets, 100_000);
  assert.equal(store.get("hh2", "2024-06-10")?.totalAssets, 500_000);
  assert.equal(store.get("hh3", "2024-06-10"), undefined);
  assert.deepEqual(store.households().sort(), ["hh1", "hh2"]);
});

test("latest() is undefined for a household with no snapshots", () => {
  const store = createSnapshotStore();
  assert.equal(store.latest("hh1"), undefined);
  assert.deepEqual(store.all("hh1"), []);
});

test("all() hands back a copy, so a caller cannot splice the series", () => {
  const store = createSnapshotStore([snap("2024-06-10", 100_000)]);
  store.all("hh1").pop();
  assert.equal(store.all("hh1").length, 1);
});
