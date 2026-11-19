import { strict as assert } from "node:assert";
import test from "node:test";
import { onTrackMessage, shortMessage } from "./verdict.ts";

const plain = (s: string) => s.replace(/ /g, " ");

test("a goal funded to the rupee does not claim ₹1 more than needed", () => {
  assert.equal(plain(onTrackMessage({ projectedCorpus: 21201, requiredCorpus: 21200, gap: 1 })), "You'll reach the ₹21,200 you need.");
  assert.equal(plain(onTrackMessage({ projectedCorpus: 1539001, requiredCorpus: 1539000, gap: 1 })), "You'll reach the ₹15.39 L you need.");
});

test("a real surplus is still stated", () => {
  assert.equal(
    plain(onTrackMessage({ projectedCorpus: 120000, requiredCorpus: 100000, gap: 20000 })),
    "You'll reach ₹1.2 L. That's ₹20,000 more than the ₹1 L you need.",
  );
});

test("a goal with no money yet does not repeat the monthly figure as a total", () => {
  assert.equal(
    plain(shortMessage({ projectedCorpus: 0, gap: -78652 }, 0, 3020)),
    "You'll reach ₹0. That's ₹78,652 short. ₹3,020 more a month would close the gap.",
  );
});

test("a goal that already gets money shows the extra and the total", () => {
  assert.equal(
    plain(shortMessage({ projectedCorpus: 500000, gap: -100000 }, 2000, 3020)),
    "You'll reach ₹5 L. That's ₹1 L short. ₹1,020 more a month (₹3,020 in total) would close the gap.",
  );
});
