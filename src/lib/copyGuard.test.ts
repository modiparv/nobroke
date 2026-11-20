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
  // The intake's questions and the goals' descriptions live in lib files, and a person reads every word of them.
  return [...files, "src/lib/onboarding.ts", "src/lib/goals.ts", "index.html"].map((file) => ({ file, text: readFileSync(`${root}${file}`, "utf8") }));
}

function assertAbsent(pattern: RegExp, why: string) {
  const hits = screens()
    .filter(({ text }) => pattern.test(text))
    .map(({ file }) => file);
  assert.deepEqual(hits, [], `${why} Found in: ${hits.join(", ")}`);
}

test("no screen shows a price", () => {
  assertAbsent(/₹\s?(299|999|2,999|9,999)\b/i, "Nothing is charged, so no price may be shown.");
  assertAbsent(/a year \(2 months free\)|early access soon|unlimited goals/i, "No paid tier may be advertised.");
});

test("no screen claims a wealth manager, wealth management or financial planning", () => {
  assertAbsent(/wealth manager/i, "NoBroke has no wealth manager to offer.");
  assertAbsent(/wealth management|financial planning/i, "Those are the names of regulated services. NoBroke is a planning tool.");
});

test("no screen ranks or scores funds", () => {
  assertAbsent(/nobroke score|top score|ranked by/i, "A scored or ranked fund list reads as a pick.");
});

test("no screen says a mix fits the person, and the copilot cannot re-tune the mix", () => {
  assertAbsent(/fits your goals better/i, "A mix shown as fitting this person is a recommendation.");
  // The model has no tool to choose a mix, and the app has no command for it.
  for (const file of ["api/chat.ts", "src/lib/command.ts", "src/lib/groq.ts", "src/store.ts"]) {
    const text = readFileSync(`${root}${file}`, "utf8");
    assert.doesNotMatch(text, /recommend_?portfolio\b/i, `${file} still carries the recommend-portfolio command.`);
  }
});

test("no screen calls what the app shows a recommendation, or says a mix is matched to the person", () => {
  assertAbsent(/every recommendation|recommendations stay|(matched|tuned) to (your|the) (risk|horizon)|good fits for your/i, "The app shows arithmetic and choices, not recommendations.");
});

test("the ready-made mixes are built from kinds of fund, never named schemes", () => {
  const funds = readFileSync(`${root}src/lib/funds.ts`, "utf8");
  const names = [...funds.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 12, "the fund list should be readable here");
  for (const name of names) {
    assert.doesNotMatch(name, /parag|nippon|icici|mirae|quant|hdfc|sbi|axis|kotak|uti|tata|aditya|birla|dsp|franklin|bandhan|motilal|edelweiss|invesco|canara|sundaram/i, `"${name}" names a fund house. A mix must list kinds of fund, not schemes.`);
  }
});

test("no screen presents an assumption as past returns", () => {
  assertAbsent(/in the past this mix|how it grew in the past/i, "The growth range is an assumption, not a record of past returns.");
});

test("no screen and no link preview says NoBroke grows money, or calls an assumption expected", () => {
  // The page title and the text a shared link shows are in index.html.
  assertAbsent(/grow it all|grows? your money/i, "NoBroke shows arithmetic. It does not grow anyone's money.");
  assertAbsent(/expected (growth|return)|your return \(xirr\)/i, "The growth rate is the plan's assumption, not something the person will get or has earned.");
  // The plan data handed to the model must not name the assumption an expected return either.
  for (const file of ["src/store.ts", "api/chat.ts", "scripts/ai-eval.mjs"]) {
    assert.doesNotMatch(readFileSync(`${root}${file}`, "utf8"), /expectedReturnPct/, `${file} still calls the assumed growth an expected return.`);
  }
});

test("no screen uses the word pace for growth", () => {
  assertAbsent(/\bpace\b/i, "The brief replaces pace with growth or rate.");
});
