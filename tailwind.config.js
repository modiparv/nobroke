/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Restrained "non-color" system: warm cream + black, cobalt does the signalling.
        ink: "#0A0A0A", // near-black — headlines, body, logo, primary CTA
        muted: "#8C8C8C", // mid grey — small/mono labels
        line: "#E6DFD0", // hairline borders on cream
        paper: "#F4F0E8", // warm paper background + subtle insets
        brand: {
          DEFAULT: "#1A1AFF", // electric cobalt — the single accent / signal color
          deep: "#0A0A0A", // black — strong surfaces & emphasis text
          dark: "#1414CC", // darker cobalt — hover for blue surfaces
          mint: "#E6E6FF", // faint cobalt tint
        },
        // asset bands — kept distinct but inside the restrained palette
        equity: "#1A1AFF", // growth → the signal blue
        debt: "#111111", // black
        gold: "#A89A7C", // warm taupe (stays in the paper family)
        hybrid: "#4B4BE6", // blue tint
      },
      fontFamily: {
        sans: ['Archivo', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { xl: "12px", "2xl": "16px" },
    },
  },
  plugins: [],
};
