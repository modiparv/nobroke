import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { amfiAdapter, classifySection, parseAmfi } from "./amfi.ts";
import type { ParsedInstrumentRow, SkippedRow } from "./types.ts";
import { MemoryDb, MemoryStorage } from "../db/memory.ts";
import type { SyncPorts } from "../db/ports.ts";

const fixture = readFileSync(new URL("./fixtures/amfi-navall-sample.txt", import.meta.url));

async function collect(payload: Buffer) {
  const rows: ParsedInstrumentRow[] = [];
  const skips: SkippedRow[] = [];
  for await (const r of parseAmfi(payload)) {
    if (r.kind === "row") rows.push(r);
    else skips.push(r);
  }
  return { rows, skips };
}

function ports(): SyncPorts & { db: MemoryDb; storage: MemoryStorage } {
  return { db: new MemoryDb(), storage: new MemoryStorage(), now: () => new Date("2026-07-25T18:00:00Z") };
}

test("fixture parses: 24 rows, 3 counted skips, nothing silently dropped", async () => {
  const { rows, skips } = await collect(fixture);
  assert.equal(rows.length, 24);
  assert.equal(skips.length, 3);
  assert.deepEqual(
    skips.map((s) => s.reason).sort(),
    ["bad_nav", "malformed", "missing_isin"],
  );
});

test("section headers drive classification; tax regime is not the asset class", async () => {
  const { rows } = await collect(fixture);
  const byClass = (c: string) => rows.filter((r) => r.assetClass === c);
  assert.equal(byClass("equity").length, 10); // 8 flexi/ELSS + 2 index funds
  assert.equal(byClass("debt").length, 7);
  assert.equal(byClass("gold").length, 3);
  assert.equal(byClass("hybrid").length, 4);

  for (const g of byClass("gold")) {
    assert.equal(g.instrumentType, "etf");
    assert.equal(g.taxRegimeKey, "GOLD_ETF");
  }
  // Hybrids tax by equity share, unknowable from a NAV file: OTHER, never guessed.
  for (const h of byClass("hybrid")) assert.equal(h.taxRegimeKey, "OTHER");
  for (const d of byClass("debt")) assert.equal(d.taxRegimeKey, "DEBT_MF");

  const hybridFromEquitySavings = classifySection("Open Ended Schemes(Hybrid Scheme - Equity Savings Fund)");
  assert.equal(hybridFromEquitySavings.assetClass, "hybrid");
});

test("NAV survives as the published decimal string and the date becomes ISO", async () => {
  const { rows } = await collect(fixture);
  const parag = rows.find((r) => r.isin === "INF879O01AA7")!;
  assert.equal(parag.nav, "81.3327");
  assert.equal(parag.asOf, "2026-07-24");
  assert.equal(parag.amfiCode, "122639");
});

test("a dual-ISIN row becomes two instruments; the AMFI code stays on the primary", async () => {
  const { rows } = await collect(fixture);
  const pair = rows.filter((r) => r.amfiCode === "120476" || r.isin === "INF109K01BG1");
  assert.equal(pair.length, 2);
  const [primary, sibling] = pair;
  assert.equal(primary.isin, "INF109K01BF3");
  assert.equal(primary.amfiCode, "120476");
  assert.equal(sibling.isin, "INF109K01BG1");
  assert.equal(sibling.amfiCode, null);
  assert.match(sibling.name, /Reinvestment/);
  assert.equal(primary.nav, sibling.nav);
});

test("persisting the fixture twice creates zero duplicate quotes or instruments", async () => {
  const p = ports();
  const adapter = amfiAdapter(p);

  const first = await adapter.persist(adapter.parse(fixture));
  assert.equal(first.ingested, 24);
  assert.equal(first.skipped, 3);
  assert.equal(p.db.instrumentsByIsin.size, 24);
  assert.equal(p.db.quotes.length, 24);

  const second = await adapter.persist(adapter.parse(fixture));
  assert.equal(second.ingested, 0, "second pass must create nothing");
  assert.equal(p.db.instrumentsByIsin.size, 24);
  assert.equal(p.db.quotes.length, 24);
});

test("amfi_code uniqueness survives the re-run (unique where not null)", async () => {
  const p = ports();
  const adapter = amfiAdapter(p);
  await adapter.persist(adapter.parse(fixture));
  await adapter.persist(adapter.parse(fixture));
  const coded = [...p.db.instrumentsByIsin.values()].filter((i) => i.amfiCode != null);
  assert.equal(coded.length, 23);
  assert.equal(new Set(coded.map((i) => i.amfiCode)).size, 23);
});
