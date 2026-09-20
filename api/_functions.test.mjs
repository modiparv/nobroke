import { strict as assert } from "node:assert";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Vercel's Hobby plan deploys at most twelve serverless functions, and the
 * deploy fails silently at "Deploying outputs" when a thirteenth appears.
 * Every non-underscore, non-dot script under api/ is one function (the same
 * rule Vercel applies), so this counts them the way Vercel will.
 */
const API = dirname(fileURLToPath(import.meta.url));
const LIMIT = 12;

function functions(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...functions(path));
    } else if (/\.(js|mjs|cjs|ts|mts|cts)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(path.slice(API.length + 1));
    }
  }
  return out;
}

test(`api/ deploys at most ${LIMIT} serverless functions (the Hobby plan's cap)`, () => {
  const fns = functions(API);
  assert.ok(
    fns.length <= LIMIT,
    `${fns.length} functions would deploy:\n  ${fns.join("\n  ")}\n` +
      `The Hobby plan allows ${LIMIT}. Fold a route into a [segment] file, or prefix a helper or test with _.`,
  );
});
