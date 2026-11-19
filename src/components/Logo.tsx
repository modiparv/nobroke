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

/**
 * The logo as the way home. The button is 44px tall and at least 44px wide
 * to tap, while the mark keeps its size: the extra height and width are
 * padding taken back with equal negative margins, so the logo sits exactly
 * where a bare 24px mark would and no header or footer around it moves.
 */
export default function Logo({ size = 24, variant = "lockup" }: { size?: number; variant?: "mark" | "lockup" }) {
  return (
    <button
      type="button"
      onClick={actions.goLanding}
      className="-mx-2.5 -my-2.5 flex min-h-11 min-w-11 items-center rounded-control px-2.5 focus-visible:-outline-offset-2"
      style={{ gap: size * 0.42 }}
      aria-label="Go to NoBroke home"
    >
      <LogoMark size={size} />
      {variant === "lockup" && (
        <span
          style={{
            fontWeight: 500,
            letterSpacing: "-0.03em",
            color: "var(--logo-fall)",
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
