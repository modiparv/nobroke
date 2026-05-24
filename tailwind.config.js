/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2A2208",
        muted: "#8A7B53",
        line: "#ECE0C4",
        paper: "#FFF8EA",
        // Golden Investments palette
        brand: {
          DEFAULT: "#FFCC00",
          deep: "#6B5300",
          dark: "#4A3900",
          mint: "#FFE6B3",
        },
        gold200: "#FFE6B3",
        gold50: "#FFF2E6",
        // asset-class colors (kept distinct for the basket)
        equity: "#7F77DD",
        debt: "#1D9E75",
        gold: "#EF9F27",
        hybrid: "#2CC295",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { xl: "12px", "2xl": "16px" },
    },
  },
  plugins: [],
};
