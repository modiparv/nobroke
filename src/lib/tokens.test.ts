import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The brief's contrast rule, checked against the real tokens in
 * src/index.css: text at least 4.5:1 on the ground it sits on; chart lines,
 * dots and other marks that carry meaning at least 3:1. A colour change that
 * breaks the rule fails here before anyone has to squint at a screenshot.
 */

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

/** A token's colour as [r, g, b], from either "R G B" channels or a hex value. */
function token(name: string): [number, number, number] {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(m, `token --${name} is missing from index.css`);
  const v = m[1].trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const ch = v.split(/\s+/).map(Number);
  assert.ok(ch.length === 3 && ch.every((n) => Number.isFinite(n)), `token --${name} is neither channels nor hex: ${v}`);
  return ch as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT: Array<[string, string]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text-display", "bg"],
  ["text-2", "bg"],
  ["text-2", "surface"],
  ["text-2", "surface-2"],
  ["text-3", "bg"],
  ["text-3", "surface"],
  ["text-3", "surface-2"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hi"],
  ["on-accent", "accent-fill"],
  ["pos", "pos-bg"],
  ["cau", "cau-bg"],
  ["neg", "neg-bg"],
  ["pos", "surface"],
  ["cau", "surface"],
  ["neg", "surface"],
  ["on-night", "night"],
  ["on-night-2", "night"],
  ["on-night-3", "night"],
  ["on-band", "band"],
  ["on-band-2", "band"],
];

const MARKS: Array<[string, string]> = [
  ["cau-mark", "surface"],
  ["pos", "surface"],
  ["neg", "surface"],
  ["chart-1", "bg"],
  ["chart-2", "bg"],
  ["chart-3", "bg"],
  ["chartn-1", "night"],
  ["chartn-2", "night"],
  ["chartn-3", "night"],
  ["primary", "bg"],
  ["primary", "night"],
  ["risk-1", "surface"],
  ["risk-2", "surface"],
  ["risk-3", "surface"],
  ["risk-4", "surface"],
  ["risk-5", "surface"],
];

test("text tokens meet 4.5:1 on their grounds", () => {
  for (const [fg, bg] of TEXT) {
    const c = contrast(fg, bg);
    assert.ok(c >= 4.5, `--${fg} on --${bg} is ${c.toFixed(2)}:1, under 4.5:1`);
  }
});

test("marks that carry meaning meet 3:1 on their grounds", () => {
  for (const [fg, bg] of MARKS) {
    const c = contrast(fg, bg);
    assert.ok(c >= 3, `--${fg} on --${bg} is ${c.toFixed(2)}:1, under 3:1`);
  }
});
