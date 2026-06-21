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
          DEFAULT: "#157A5B",
          deep: "#0F5C44",
          dark: "#136E51",
          mint: "#E2F1EB",
        },
        positive: "#157A5B",
        equity: "#157A5B",
        debt: "#0C3D2E",
        gold: "#A7D2C2",
        hybrid: "#4E9B81",
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
