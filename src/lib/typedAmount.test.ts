import { strict as assert } from "node:assert";
import test from "node:test";
import { typedAmount } from "./typedAmount.ts";

test("digits below the minimum are held as text, not saved", () => {
  // A goal's cost has a ₹1,000 minimum: typing 7,500 passes through 7, 75 and 750.
  assert.deepEqual(typedAmount("7", 1000, 50000000), { hold: "7" });
  assert.deepEqual(typedAmount("75", 1000, 50000000), { hold: "75" });
  assert.deepEqual(typedAmount("750", 1000, 50000000), { hold: "750" });
  assert.deepEqual(typedAmount("7500", 1000, 50000000), { save: 7500 });
});

test("an emptied field with a minimum shows nothing and saves nothing", () => {
  assert.deepEqual(typedAmount("", 1000, 50000000), { hold: "" });
  assert.deepEqual(typedAmount("₹", 1000, 50000000), { hold: "" });
});

test("a field with no minimum saves every keystroke, as it always has", () => {
  assert.deepEqual(typedAmount("", 0, 1000000), { save: 0 });
  assert.deepEqual(typedAmount("5", 0, 1000000), { save: 5 });
  assert.deepEqual(typedAmount("37,000", 0, 1000000), { save: 37000 });
});

test("grouping commas and the rupee sign are ignored, and the maximum caps the amount", () => {
  assert.deepEqual(typedAmount("₹50,00,000", 1000, 50000000), { save: 5000000 });
  assert.deepEqual(typedAmount("50,00,00,0000", 1000, 50000000), { save: 50000000 });
  assert.deepEqual(typedAmount("9".repeat(400), 0, 1000000), { save: 1000000 });
});

test("held digits are grouped the Indian way and drop leading zeros", () => {
  assert.deepEqual(typedAmount("0075", 1000, 50000000), { hold: "75" });
  assert.deepEqual(typedAmount("12345", 500000, 50000000), { hold: "12,345" });
  assert.deepEqual(typedAmount("123456", 500000, 50000000), { hold: "1,23,456" });
});
