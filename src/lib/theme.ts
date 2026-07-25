/**
 * Colours for SVG and inline styles (Tailwind classes cover the rest).
 *
 * These resolve to the same CSS custom properties as the utility classes, so a
 * chart or a progress fill follows light and dark without a second palette.
 */
export const C = {
  brand: "rgb(var(--accent))",
  brandDeep: "rgb(var(--accent-hi))",
  positive: "rgb(var(--pos))",
  ink: "rgb(var(--text))",
  muted: "rgb(var(--text-2))",
  faint: "rgb(var(--text-3))",
  line: "rgb(var(--line))",
  track: "rgb(var(--surface-2))",
  gold: "rgb(var(--cau))",
  invested: "rgb(var(--line-2))",
} as const;
