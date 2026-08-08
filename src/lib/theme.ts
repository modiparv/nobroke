import { useSyncExternalStore } from "react";

/**
 * Colours for SVG and inline styles (Tailwind classes cover the rest).
 *
 * These resolve to the same CSS custom properties as the utility classes, so a
 * chart or a progress fill follows light and dark without a second palette.
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

/**
 * Theme preference: System / Light / Dark, with System the default. The
 * choice is a device preference, not plan data — it lives in its own
 * localStorage key, never syncs to the account, and survives sign-out.
 *
 * index.html carries a tiny boot script that stamps data-theme from the same
 * key before first paint, so there is no flash; this module owns everything
 * after that.
 */
export type ThemePref = "system" | "light" | "dark";

const THEME_KEY = "nobroke_theme_v1";

function systemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? systemTheme() : pref;
}

function loadPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let pref: ThemePref = loadPref();
const listeners = new Set<() => void>();

function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(pref);
  // Keep the browser chrome on the page colour — sourced from the live token,
  // so index.css stays the single palette authority. Both media-keyed metas
  // are overwritten, which is what lets an explicit choice beat the OS one.
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", `rgb(${bg})`));
  }
}

export function getThemePref(): ThemePref {
  return pref;
}

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
  applyTheme();
  for (const l of listeners) l();
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getThemePref,
    getThemePref,
  );
}

/** Stamp on load and follow the OS while the preference is System.
    Idempotent: StrictMode double-mounts must not stack listeners. */
let inited = false;
export function initTheme() {
  applyTheme();
  if (inited) return;
  inited = true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (pref === "system") applyTheme();
    });
  }
}
