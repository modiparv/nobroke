/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // New-age copilot palette — electric violet accent, mint "on-track", soft graphite.
        ink: "#15161B",
        muted: "#8A8D98",
        line: "#ECECEF",
        paper: "#FCFCFD",
        brand: {
          DEFAULT: "#6750F2",
          deep: "#4B3DDB",
          dark: "#5A45E6",
          mint: "#ECEAFE",
        },
        positive: "#16C098",
        equity: "#6750F2",
        debt: "#15161B",
        gold: "#E0A23C",
        hybrid: "#9B8CFF",
      },
      fontFamily: {
        // Geist (Vercel) is the closest free analogue to Augustus's ABC Diatype.
        sans: ['Geist', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { xl: "12px", "2xl": "16px" },
    },
  },
  plugins: [],
};
