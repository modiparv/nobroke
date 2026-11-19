import { formatINR } from "./format.ts";

/**
 * The example prompts under the copilot bar. They show that the copilot can
 * change the plan, not only answer. Commands are understood on the device
 * and work for everyone. Questions go to the model, which answers only a
 * signed-in person, so the question chip and the "ask anything" hint are
 * shown only when signed in.
 */

/** The amount in the monthly example: a quarter more than the person invests
    now. Rounded up to ₹500, or to ₹5,000 from a lakh up, where amounts are
    written to two decimals ("₹3.15 L") and a finer figure would not survive
    being typed back. With nothing invested yet, a small round sum. */
export function investExampleAmount(monthlySip: number): number {
  if (!(monthlySip > 0)) return 5000;
  const more = monthlySip * 1.25;
  const step = more >= 100_000 ? 5000 : 500;
  return Math.ceil(more / step) * step;
}

/** The monthly-amount example, sized to this plan. A fixed ₹40,000 was
    offered to a student who earns ₹8,000. */
export function investExample(monthlySip: number): string {
  return `I can invest ${formatINR(investExampleAmount(monthlySip))} a month`;
}

const QUESTIONS = ["What's an emergency fund?"];

export function copilotSuggestions(signedIn: boolean, monthlySip = 0): string[] {
  const commands = ["Add a car goal", investExample(monthlySip), "Set home target to ₹60L", "Buy a home in 6 years", "Auto-balance my money"];
  return signedIn ? [...commands, ...QUESTIONS] : commands;
}

export const copilotPlaceholder = (signedIn: boolean) =>
  signedIn ? "Tell me to change a goal, or ask anything…" : "Tell me to change a goal…";
