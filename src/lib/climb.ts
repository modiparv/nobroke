/**
 * The climb: how far up Meru the whole plan has come, at today's pace.
 *
 * Coverage is the share of everything the goals will need that today's
 * pace already reaches: Σ min(projected, needed) / Σ needed. It rises the
 * moment someone invests more monthly, which is the behaviour the avatar
 * exists to reward, and it uses the same engine numbers as every card.
 * Stages name the height in plain words.
 */
export interface Stage {
  name: string;
  /** Coverage at which the stage begins, 0..1. */
  min: number;
  line: string;
}

export const STAGES: Stage[] = [
  { name: "Base camp", min: 0, line: "Every climb starts here." },
  { name: "Foothills", min: 0.15, line: "Moving. Keep the monthly steady." },
  { name: "Ridge", min: 0.4, line: "Halfway up. The view improves." },
  { name: "High camp", min: 0.7, line: "The summit is in sight." },
  { name: "Summit", min: 0.95, line: "Every goal covered at today's pace." },
];

export function coverageFrom(goals: Array<{ projected: number; need: number }>): number {
  let covered = 0;
  let need = 0;
  for (const g of goals) {
    if (g.need <= 0) continue;
    need += g.need;
    covered += Math.max(0, Math.min(g.projected, g.need));
  }
  return need > 0 ? covered / need : 0;
}

export function stageFor(coverage: number): { stage: Stage; index: number; next: Stage | null } {
  const c = Math.max(0, Math.min(1, coverage));
  let index = 0;
  for (let i = 0; i < STAGES.length; i++) if (c >= STAGES[i].min) index = i;
  return { stage: STAGES[index], index, next: STAGES[index + 1] ?? null };
}

/** The route's shape by appetite: a steady climber rises early and eases,
 *  a bold one runs flat then steep. Returns y in 0..1 (1 = summit) for a
 *  position t in 0..1 along the path. */
export function routeHeight(t: number, appetite: "steady" | "balanced" | "bold"): number {
  const x = Math.max(0, Math.min(1, t));
  const p = appetite === "steady" ? 0.7 : appetite === "bold" ? 1.6 : 1;
  return Math.pow(x, p);
}
