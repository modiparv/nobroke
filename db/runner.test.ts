import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { amfiAdapter, AMFI_URL } from "../adapters/amfi.ts";
import type { SourceAdapter } from "../adapters/types.ts";
import { MemoryDb, MemoryStorage } from "./memory.ts";
import { runSync } from "./runner.ts";
import { isStale, staleCutoff, tradingDaysBetween } from "./staleness.ts";

const fixture = readFileSync(new URL("../adapters/fixtures/amfi-navall-sample.txt", import.meta.url));

function ports(nowIso = "2026-07-25T18:00:00Z") {
  return { db: new MemoryDb(), storage: new MemoryStorage(), now: () => new Date(nowIso) };
}

/** The real adapter with its network fetch replaced by the fixture. */
function fixtureAdapter(p: ReturnType<typeof ports>, fail = 0): SourceAdapter & { attempts: number } {
  const real = amfiAdapter(p);
  const wrapped = {
    ...real,
    attempts: 0,
    async fetch() {
      wrapped.attempts++;
      if (wrapped.attempts <= fail) throw new Error("upstream 503");
      return { payload: fixture, contentType: "text/plain" };
    },
  };
  return wrapped;
}

test("a run writes sync_run and the raw artifact before rows, then finishes success", async () => {
  const p = ports();
  const result = await runSync(fixtureAdapter(p), p, AMFI_URL);

  assert.equal(result.status, "success");
  assert.equal(result.ingested, 24);
  assert.equal(result.skipped, 3);

  const run = p.db.syncRuns[0];
  assert.equal(run.status, "success");
  assert.equal(run.rowsIngested, 24);
  assert.equal(run.rowsSkipped, 3);
  assert.ok(run.finishedAt);

  assert.equal(p.db.rawArtifacts.length, 1);
  const artifact = p.db.rawArtifacts[0];
  assert.equal(artifact.syncRunId, run.id);
  assert.equal(artifact.byteSize, fixture.length);
  assert.ok(p.storage.objects.has(artifact.storageKey), "payload bytes are in storage");
  assert.deepEqual(p.storage.objects.get(artifact.storageKey)!.payload, fixture);
});

test("a failing fetch is retried, then recorded as a failed run with the error", async () => {
  const p = ports();
  const flaky = fixtureAdapter(p, 1);
  const ok = await runSync(flaky, p, AMFI_URL);
  assert.equal(ok.status, "success");
  assert.equal(flaky.attempts, 2, "one retry consumed the failure");

  const p2 = ports();
  const dead = fixtureAdapter(p2, 99);
  const bad = await runSync(dead, p2, AMFI_URL);
  assert.equal(bad.status, "failed");
  assert.match(bad.error!, /503/);
  assert.equal(p2.db.syncRuns[0].status, "failed");
  assert.equal(p2.db.syncRuns[0].errorText, "upstream 503");
  assert.equal(p2.db.quotes.length, 0, "nothing half-written");
});

test("running the same sync twice changes nothing on the second pass", async () => {
  const p = ports();
  await runSync(fixtureAdapter(p), p, AMFI_URL);
  const second = await runSync(fixtureAdapter(p), p, AMFI_URL);

  assert.equal(second.status, "success");
  assert.equal(second.ingested, 0);
  assert.equal(p.db.quotes.length, 24);
  assert.equal(p.db.instrumentsByIsin.size, 24);
  assert.equal(p.db.syncRuns.length, 2, "each run is still its own audit row");
  assert.equal(p.db.rawArtifacts.length, 2, "each run archives its own payload");
});

test("trading-day staleness flips across the boundary, weekends excluded", () => {
  // Fixture NAV date 2026-07-24 is a Friday.
  assert.equal(tradingDaysBetween("2026-07-24", "2026-07-27"), 1); // Monday
  assert.equal(tradingDaysBetween("2026-07-24", "2026-07-28"), 2); // Tuesday
  assert.equal(tradingDaysBetween("2026-07-24", "2026-07-29"), 3); // Wednesday

  assert.equal(isStale("2026-07-24", "2026-07-28"), false, "exactly 2 trading days: still fresh");
  assert.equal(isStale("2026-07-24", "2026-07-29"), true, "3 trading days: stale");

  // staleCutoff agrees with isStale on both sides of the line.
  const cutoff = staleCutoff("2026-07-29");
  assert.ok("2026-07-24" <= cutoff);
  assert.ok(!("2026-07-27" <= cutoff));
});

test("the nightly run marks aged quotes stale", async () => {
  const p = ports("2026-07-25T18:00:00Z");
  await runSync(fixtureAdapter(p), p, AMFI_URL);
  assert.ok(p.db.quotes.every((q) => !q.isStale), "fresh on Saturday after Friday NAV");

  // Same data, checked from Wednesday: Friday's NAV is 3 trading days old.
  const later = { db: p.db, storage: p.storage, now: () => new Date("2026-07-29T18:00:00Z") };
  await runSync(fixtureAdapter(later as ReturnType<typeof ports>), later, AMFI_URL);
  assert.ok(
    p.db.quotes.every((q) => q.isStale),
    "every quote dated 2026-07-24 is stale by 2026-07-29",
  );
});
