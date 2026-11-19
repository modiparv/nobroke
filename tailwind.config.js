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
        sidebar: channel("--sidebar"),
        "surface-2": channel("--surface-2"),
        line: channel("--line"),
        "line-2": channel("--line-2"),
        text: channel("--text"),
        // Display copy (headlines, section copy, prose) sits DIMMER than
        // values: the number is always the brightest thing on screen.
        display: channel("--text-display"),
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
        // The one colour of a main button (brief 2.2). Ink fills are for
        // selected states only.
        primary: channel("--primary"),
        "primary-hi": channel("--primary-hi"),
        "on-primary": channel("--on-primary"),
        // Amber for dots and lines; `cau` is the darker amber for text.
        "cau-mark": channel("--cau-mark"),
        band: channel("--band"),
        night: channel("--night"),
        "on-night": channel("--on-night"),
        "on-night-2": channel("--on-night-2"),
        "on-night-3": channel("--on-night-3"),
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
        // Manrope: geometric, quiet, reads as modern finance.
        sans: ["Manrope", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        // Question screens only: a serif heading makes the intake read as a
        // conversation rather than data entry. Never for numbers.
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "Times", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Every size is in rem, so the phone's own text-size setting scales
        // the app (brief 2.1). Reading text is 16px, support text 14px; only
        // captions, axis ticks and index marks sit below 14px.
        hero: ["1.75rem", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        headline: ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        section: ["1.0625rem", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        row: ["1rem", { lineHeight: "1.4", letterSpacing: "-0.005em" }],
        body: ["1rem", { lineHeight: "1.5" }],
        // Marketing reading size: the landing's paragraphs sit one notch above
        // the product's dense body so a 48px headline is not stacked over
        // 13.5px copy. Never used inside the app.
        prose: ["1.0625rem", { lineHeight: "1.6" }],
        support: ["0.875rem", { lineHeight: "1.45" }],
        caption: ["0.8125rem", { lineHeight: "1.4" }],
        // Section labels: sentence case, no letter-spacing.
        eyebrow: ["0.75rem", { lineHeight: "1.3" }],
        index: ["0.75rem", { lineHeight: "1.3" }],
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
