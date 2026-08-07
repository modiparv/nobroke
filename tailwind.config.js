/** @type {import('tailwindcss').Config} */

// Colours resolve through CSS custom properties so light and dark ship from one
// class name. The vars hold raw "R G B" channels rather than hex, which is what
// lets Tailwind's opacity modifiers (bg-accent/10) keep working.
const channel = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: channel("--bg"),
        surface: channel("--surface"),
        "surface-2": channel("--surface-2"),
        line: channel("--line"),
        "line-2": channel("--line-2"),
        text: channel("--text"),
        "text-2": channel("--text-2"),
        "text-3": channel("--text-3"),
        // The accent splits in dark mode: `accent` is the on-surface accent
        // (links, icons, chart fills), `accent-fill` is for button backgrounds
        // only, so the light label passes contrast. In light both resolve to
        // the same blue.
        accent: channel("--accent-text"),
        "accent-hi": channel("--accent-hi"),
        "accent-fill": channel("--accent-fill"),
        "accent-fill-hi": channel("--accent-fill-hi"),
        "accent-tint": channel("--accent-tint"),
        "on-accent": channel("--on-accent"),
        band: channel("--band"),
        "on-band": channel("--on-band"),
        "on-band-2": channel("--on-band-2"),
        "on-band-3": channel("--on-band-3"),
        pos: channel("--pos"),
        "pos-bg": channel("--pos-bg"),
        cau: channel("--cau"),
        "cau-bg": channel("--cau-bg"),
        neg: channel("--neg"),
        "neg-bg": channel("--neg-bg"),

        // Aliases kept so existing markup swaps palette without a rewrite.
        // `brand` is only ever used as a button/control fill, so it maps to
        // the fill side of the split; the asset-class colours are chart fills,
        // so they map to the on-surface side.
        ink: channel("--text"),
        muted: channel("--text-2"),
        paper: channel("--bg"),
        positive: channel("--pos"),
        brand: {
          DEFAULT: channel("--accent-fill"),
          deep: channel("--accent-fill-hi"),
          dark: channel("--accent-fill-hi"),
          mint: channel("--accent-tint"),
        },
        equity: channel("--accent-text"),
        debt: channel("--text-2"),
        gold: channel("--cau"),
        hybrid: channel("--accent-hi"),
      },
      fontFamily: {
        // Inter reads as finance rather than friendly-app (spec 8b).
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        hero: ["34px", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
        headline: ["22px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        section: ["17px", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        row: ["15px", { lineHeight: "1.35", letterSpacing: "-0.005em" }],
        body: ["14px", { lineHeight: "1.5" }],
        support: ["13px", { lineHeight: "1.45" }],
        caption: ["12px", { lineHeight: "1.4" }],
        eyebrow: ["10px", { lineHeight: "1.2", letterSpacing: "0.13em" }],
        index: ["10px", { lineHeight: "1.2", letterSpacing: "0.06em" }],
      },
      borderRadius: {
        screen: "20px",
        card: "16px",
        control: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      maxWidth: { page: "1280px" },
    },
  },
  plugins: [],
};
