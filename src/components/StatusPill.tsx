import { GAP_LABEL, gapIcon, type GapIcon, type GapLevel } from "../lib/gap";
import { GAP_PILL } from "../ui";

/**
 * A goal's status, always as colour AND icon AND word (brief 2.3), so it
 * still reads in greyscale and for people who cannot tell red from green:
 * a tick for on track, a clock for short, an alert for far short.
 */

const PATHS: Record<GapIcon, JSX.Element> = {
  tick: <path d="M3.5 8.5l3 3 6-6.5" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.2l2 1.3" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.2l6.2 11H1.8z" />
      <path d="M8 6.6v3" />
      <path d="M8 11.6v.1" />
    </>
  ),
};

/** The bare icon, in the current text colour. Decorative: the word beside
    it carries the meaning for screen readers. */
export function StatusIcon({ level, size = 14, className = "" }: { level: GapLevel; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`flex-none ${className}`}
    >
      {PATHS[gapIcon(level)]}
    </svg>
  );
}

/** The pill: icon and word on the level's tint. `label` overrides the word
    when a screen needs a longer one ("Short by ₹2 L"). */
export default function StatusPill({ level, label, className = "" }: { level: GapLevel; label?: string; className?: string }) {
  return (
    <span className={`inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium ${GAP_PILL[level]} ${className}`}>
      <StatusIcon level={level} size={13} />
      {label ?? GAP_LABEL[level]}
    </span>
  );
}
