import { strict as assert } from "node:assert";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { FallbackStorage, PgArtifactStorage } from "./artifacts.ts";
import type { StoragePort } from "./ports.ts";

function fakePool() {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      return { rows: [] };
    },
  };
}

test("PgArtifactStorage gzips the payload, keeps original size, mints a pg:// key", async () => {
  const pool = fakePool();
  const storage = new PgArtifactStorage(pool);
  const payload = Buffer.from("scheme;data;".repeat(1000));

  const key = await storage.put("raw/amfi/2026-07-26/run1", payload, "text/plain");

  assert.equal(key, "pg://raw_payload/raw/amfi/2026-07-26/run1");
  const [call] = pool.calls;
  assert.match(call.text, /insert into raw_payload/);
  assert.equal(call.params[0], key);
  assert.deepEqual(gunzipSync(call.params[1] as Buffer), payload, "payload survives the round trip");
  assert.equal(call.params[3], payload.length, "byte_size is the original size");
});

test("FallbackStorage prefers the primary and remembers a fallback", async () => {
  const used: string[] = [];
  const ok: StoragePort = { put: async (k) => (used.push("primary"), `blob://${k}`) };
  const dead: StoragePort = {
    put: async () => {
      throw new Error("access must be public");
    },
  };
  const backup: StoragePort = { put: async (k) => (used.push("backup"), `pg://${k}`) };

  const healthy = new FallbackStorage(ok, backup);
  assert.equal(await healthy.put("k", Buffer.from("x"), "t"), "blob://k");
  assert.equal(healthy.fellBackWith, null);

  const failed = new FallbackStorage(dead, backup);
  assert.equal(await failed.put("k", Buffer.from("x"), "t"), "pg://k");
  assert.match(failed.fellBackWith!, /access must be public/);
  assert.deepEqual(used, ["primary", "backup"]);
});
