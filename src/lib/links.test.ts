import { strict as assert } from "node:assert";
import test from "node:test";
import { UNSORTED_TYPE } from "./holdings.ts";
import { FOCUS, holdingFocus, holdingForFund } from "./links.ts";
import type { Holding } from "./types";

const h = (id: string, name: string, type = "Mutual fund (SIP)"): Holding => ({ id, category: "Funds", type, name, amount: 10000 });

test("a fund in the mix is matched to the holding that is the same fund", () => {
  const holdings = [h("a", "Parag Parikh Flexi Cap Direct Growth"), h("b", "HDFC FD", "Fixed Deposit (FD)")];
  assert.equal(holdingForFund("Parag Parikh Flexi Cap", holdings)?.id, "a");
  assert.equal(holdingForFund("parag parikh flexi cap fund", holdings)?.id, "a");
  assert.equal(holdingForFund("ICICI Nifty 50 Index", holdings), null);
});

test("the intake's unsplit total and tiny names never match", () => {
  const holdings = [h("intake", "All investments", UNSORTED_TYPE), h("x", "PPF", "PPF")];
  assert.equal(holdingForFund("All investments", holdings), null);
  assert.equal(holdingForFund("Fund", holdings), null);
  assert.equal(holdingForFund("PPF", holdings)?.id, "x");
});

test("focus ids are stable strings the pages agree on", () => {
  assert.equal(holdingFocus("abc"), "holding:abc");
  const ids = Object.values(FOCUS);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z-]+$/);
});
