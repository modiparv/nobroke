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
          DEFAULT: "#3D46B2",
          deep: "#2E3690",
          dark: "#353EA0",
          mint: "#E9EAF6",
        },
        positive: "#12946B",
        equity: "#3D46B2",
        debt: "#3A4256",
        gold: "#B58A3C",
        hybrid: "#7B83CE",
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
