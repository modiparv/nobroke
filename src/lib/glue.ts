import { formatINR } from "./format.ts";

/**
 * Keeps an amount and its unit on one line. formatINR writes "₹9.33 Cr"
 * with an ordinary space, so in a sentence that wraps the "Cr" can land
 * alone at the start of the next line. These swap that one space for a
 * non-breaking one. The digits and the unit are untouched.
 */

const NBSP = " ";

/** Glue every "₹… L" and "₹… Cr" in a sentence. */
export function glueAmounts(text: string): string {
  return text.replace(/(₹[\d,.]+) (L|Cr)(?![A-Za-z])/g, `$1${NBSP}$2`);
}

/** formatINR, for use inside a sentence that may wrap. */
export function inr(value: number): string {
  return glueAmounts(formatINR(value));
}
