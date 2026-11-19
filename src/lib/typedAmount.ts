/**
 * What a keystroke in a money field means. A field can have a minimum (a
 * goal costs at least ₹1,000), and the digits typed on the way to a real
 * amount pass through numbers below it: "7" and "75" on the way to
 * "7,500". Saving each of those would snap the field up to the minimum
 * mid-word and make the amount impossible to type. So digits below the
 * minimum are held as text and nothing is saved until they reach it.
 */
export type TypedAmount =
  /** At or above the minimum: save this amount (capped at the maximum). */
  | { save: number }
  /** Below the minimum: show this text and leave the saved amount alone. */
  | { hold: string };

export function typedAmount(text: string, min: number, max: number): TypedAmount {
  const digits = text.replace(/[^\d]/g, "");
  const n = Number(digits);
  // More digits than a number can carry is simply "too much": the maximum.
  if (!Number.isFinite(n)) return { save: max };
  if (n < min) return { hold: digits ? n.toLocaleString("en-IN") : "" };
  return { save: Math.min(max, Math.round(n)) };
}
