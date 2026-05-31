/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Matched to augustus.com (their CSS vars: --color-white #fcfcfc, --color-black #121212, --color-blue #0031f5).
        ink: "#121212",
        muted: "#8C8C8C",
        line: "#E8E8E5",
        paper: "#FCFCFC",
        brand: {
          DEFAULT: "#0031F5",
          deep: "#121212",
          dark: "#002CD9",
          mint: "#E0E5FF",
        },
        equity: "#0031F5",
        debt: "#121212",
        gold: "#A89A7C",
        hybrid: "#3A60F8",
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
