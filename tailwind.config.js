/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#04130F",
        muted: "#5B6B66",
        line: "#E3E8E6",
        paper: "#F1F7F6",
        brand: {
          DEFAULT: "#2CC295",
          deep: "#03654C",
          dark: "#032221",
          mint: "#7BE0BE",
        },
        equity: "#7F77DD",
        debt: "#1D9E75",
        gold: "#EF9F27",
        hybrid: "#2CC295",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
  plugins: [],
};
