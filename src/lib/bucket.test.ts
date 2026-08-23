import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  POOL_GROUPS,
  POOL_ITEMS,
  isPoolInstrument,
  sameMix,
  suggestedInstruments,
  withInstrument,
  withWeight,
  withoutInstrument,
} from "./bucket.ts";
import { FUND_MAP } from "./funds.ts";
import { allocationTotal, bandWeights, blendedReturn } from "./finance.ts";
import type { Allocation } from "./types.ts";

const sum = (a: Allocation) => allocationTotal(a);

test("every pool instrument resolves to a registered fund row", () => {
  const seen = new Set<string>();
  for (const item of POOL_ITEMS) {
    assert.ok(!seen.has(item.id), `duplicate pool id ${item.id}`);
    seen.add(item.id);
    const f = FUND_MAP[item.id];
    assert.ok(f, `unregistered pool id ${item.id}`);
    assert.ok(f.expReturn > 0 && f.expReturn < 0.25, `${item.id} expReturn out of band`);
    assert.ok(f.volatility >= 0 && f.volatility < 0.5, `${item.id} volatility out of band`);
    assert.ok(["equity", "debt", "gold", "hybrid"].includes(f.assetClass), `${item.id} unknown class`);
    assert.ok(item.kind.length > 0 && item.note.length > 0);
    assert.ok(isPoolInstrument(item.id));
  }
  assert.ok(!isPoolInstrument("live_999999"));
});

test("the pool spans every side of a real bucket", () => {
  const labels = POOL_GROUPS.map((g) => g.label);
  for (const want of ["Fund picks", "ETFs", "Gold & silver", "Bonds & debt", "Real estate & cash"]) {
    assert.ok(labels.includes(want), `missing group ${want}`);
  }
  const classes = new Set(POOL_ITEMS.map((i) => FUND_MAP[i.id].assetClass));
  for (const c of ["equity", "debt", "gold", "hybrid"]) assert.ok(classes.has(c as never), `no ${c} instrument`);
});

test("adding instruments keeps the bucket at exactly 100", () => {
  let b: Allocation = {};
  b = withInstrument(b, "inst_nifty_etf");
  assert.equal(b.inst_nifty_etf, 100);
  b = withInstrument(b, "nippon_gold");
  assert.ok(Math.abs(sum(b) - 100) < 1e-9);
  assert.ok(Math.abs((b.inst_nifty_etf ?? 0) - 50) < 1e-9);
  b = withInstrument(b, "sbi_gilt");
  b = withInstrument(b, "inst_sgb");
  assert.ok(Math.abs(sum(b) - 100) < 1e-9);
  // Re-adding an existing instrument changes nothing.
  assert.deepEqual(withInstrument(b, "sbi_gilt"), b);
});

test("setting a weight rebalances the others back to 100", () => {
  let b: Allocation = withInstrument(withInstrument(withInstrument({}, "inst_nifty_etf"), "sbi_gilt"), "nippon_gold");
  b = withWeight(b, "inst_nifty_etf", 60);
  assert.ok(Math.abs(sum(b) - 100) < 1e-9);
  assert.ok(Math.abs((b.inst_nifty_etf ?? 0) - 60) < 1e-9);
  // Clamped at the edges; unknown ids are a no-op.
  assert.ok(Math.abs(sum(withWeight(b, "sbi_gilt", 250)) - 100) < 1e-9);
  assert.ok(Math.abs(sum(withWeight(b, "sbi_gilt", -10)) - 100) < 1e-9);
  assert.deepEqual(withWeight(b, "not_in_bucket", 40), b);
  // A lone instrument always holds the whole bucket.
  assert.deepEqual(withWeight({ inst_sgb: 40 }, "inst_sgb", 10), { inst_sgb: 100 });
});

test("removing an instrument renormalizes the rest", () => {
  const b = withInstrument(withInstrument({}, "inst_nifty_etf"), "sbi_gilt");
  const after = withoutInstrument(b, "inst_nifty_etf");
  assert.deepEqual(Object.keys(after), ["sbi_gilt"]);
  assert.ok(Math.abs((after.sbi_gilt ?? 0) - 100) < 1e-9);
  assert.deepEqual(withoutInstrument({ inst_sgb: 100 }, "inst_sgb"), {});
});

test("a curated bucket runs through the engine math unchanged", () => {
  const b = withInstrument(withInstrument(withInstrument({}, "inst_midcap_etf"), "inst_tmf_2030"), "inst_silver_etf");
  const bands = bandWeights(b);
  assert.ok(bands.equity > 0 && bands.debt > 0 && bands.gold > 0);
  assert.ok(Math.abs(bands.equity + bands.debt + bands.gold - 100) < 1e-6);
  const ret = blendedReturn(b);
  assert.ok(ret > 0.03 && ret < 0.2);
});

test("suggestions match appetite, stay inside the pool, and stay diverse", () => {
  for (const appetite of [10, 50, 90]) {
    const picks = suggestedInstruments(appetite);
    assert.equal(picks.length, 4);
    for (const p of picks) assert.ok(isPoolInstrument(p.id));
    const classes = new Set(picks.map((p) => FUND_MAP[p.id].assetClass));
    assert.ok(classes.size >= 2, `appetite ${appetite} suggestions not diverse`);
  }
  // Calm appetites see no small caps; bold ones do.
  assert.ok(!suggestedInstruments(10).some((p) => p.id === "nippon_small"));
  assert.ok(suggestedInstruments(90).some((p) => p.id === "nippon_small"));
});

test("sameMix tolerates rounding but not different holdings", () => {
  const a: Allocation = { inst_nifty_etf: 50, sbi_gilt: 50 };
  assert.ok(sameMix(a, { inst_nifty_etf: 50.2, sbi_gilt: 49.8 }));
  assert.ok(!sameMix(a, { inst_nifty_etf: 60, sbi_gilt: 40 }));
  assert.ok(!sameMix(a, { inst_nifty_etf: 50, nippon_gold: 50 }));
  assert.ok(!sameMix(a, { inst_nifty_etf: 100 }));
  assert.ok(sameMix({}, {}));
});
