/**
 * Colours for SVG and inline styles (Tailwind classes cover the rest).
 *
 * These resolve to the same CSS custom properties as the utility classes, so a
 * chart or a progress fill follows the palette without a second definition.
 */
export const C = {
  brand: "rgb(var(--text))",
  brandDeep: "rgb(var(--accent-hi))",
  positive: "rgb(var(--pos))",
  ink: "rgb(var(--text))",
  muted: "rgb(var(--text-2))",
  faint: "rgb(var(--text-3))",
  line: "rgb(var(--line))",
  track: "rgb(var(--surface-2))",
  gold: "rgb(var(--cau))",
  invested: "rgb(var(--text-2))",
} as const;

/** One theme: light. The boot script in index.html stamps it before first
 *  paint; this keeps it stamped after any future markup changes. The dark
 *  token block was removed with the theme picker; night sections carry the
 *  product's dark accents in the one theme. */
export function initTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = "light";
}
