import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * NoBroke is not a SEBI-registered adviser and charges nothing. These checks
 * fail the build if wording that says otherwise comes back: a price, an
 * adviser claim, or a fund presented as a pick. They read the files a person
 * actually sees (the screens and index.html), ignoring case.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

function screens(): Array<{ file: string; text: string }> {
  const dir = `${root}src/components`;
  const files = (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `src/components/${f}`);
  return [...files, "index.html"].map((file) => ({ file, text: readFileSync(`${root}${file}`, "utf8") }));
}

function assertAbsent(pattern: RegExp, why: string) {
  const hits = screens()
    .filter(({ text }) => pattern.test(text))
    .map(({ file }) => file);
  assert.deepEqual(hits, [], `${why} Found in: ${hits.join(", ")}`);
}

test("no screen shows a price", () => {
  assertAbsent(/₹\s?(299|999|2,999|9,999)\b/i, "Nothing is charged, so no price may be shown.");
  assertAbsent(/\/month|a year \(2 months free\)|early access soon/i, "No paid tier may be advertised.");
});

test("no screen claims a wealth manager", () => {
  assertAbsent(/wealth manager/i, "NoBroke has no wealth manager to offer.");
});

test("no screen ranks or scores funds", () => {
  assertAbsent(/nobroke score|top score|ranked by/i, "A scored or ranked fund list reads as a pick.");
});
