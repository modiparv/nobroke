import { actions } from "../store";

/**
 * The NoBroke mark: a recovery curve. A falling stroke, then a rising stroke
 * that ends visibly higher than the fall began. That relationship is the
 * whole idea and survives every resize; below 20px the strokes thicken so
 * they hold.
 *
 * Colours come from CSS custom properties (--logo-fall / --logo-rise), so
 * both themes render correctly with no JS branch.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const strokeWidth = size < 20 ? 5.5 : 4.5;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="NoBroke" className="shrink-0">
      <path d="M5 10 L13 23" stroke="var(--logo-fall)" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <path d="M13 23 L27 4" stroke="var(--logo-rise)" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Logo({ size = 24, variant = "lockup" }: { size?: number; variant?: "mark" | "lockup" }) {
  return (
    <button
      onClick={actions.goLanding}
      className="flex items-center"
      style={{ gap: size * 0.42 }}
      aria-label="Go to NoBroke home"
    >
      <LogoMark size={size} />
      {variant === "lockup" && (
        <span
          style={{
            fontWeight: 500,
            letterSpacing: "-0.03em",
            color: "var(--ink-800)",
            fontSize: Math.round(size * 0.66),
            lineHeight: 1,
          }}
        >
          NoBroke
        </span>
      )}
    </button>
  );
}
