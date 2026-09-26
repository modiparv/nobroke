import { useCallback, useEffect, useRef } from "react";
import { actions, useStore } from "../store";

/**
 * A section a link can land on. Give it the section's focus id (lib/links)
 * and put `ref` on the element and `focus-flash` in its class list while
 * `active` is true. When a link asks for this section, the page scrolls
 * to it (after the tab's own scroll-to-top has run) and the flash plays
 * once, then the request is cleared so it never replays on a re-render.
 */
export function useFocus(id: string): { ref: (el: HTMLElement | null) => void; active: boolean } {
  const s = useStore();
  const active = s.focus?.id === id;
  const stamp = active ? s.focus?.stamp : undefined;
  const elRef = useRef<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
  }, []);

  useEffect(() => {
    if (!active) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const scroll = window.setTimeout(() => {
      elRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    }, 80);
    const clear = window.setTimeout(() => actions.clearFocus(), 2000);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [active, stamp]);

  return { ref, active };
}
