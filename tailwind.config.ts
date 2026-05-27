import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0d",
        panel: "#151513",
        panel2: "#211f1c",
        border: "#34312d",
        ink: "#faf9f5",
        body: "#d8d1c8",
        muted: "#a8a096",
        soft: "#f5f0e8",
        cream: "#faf9f5",
        accent: "#cf765c",
        accent2: "#e8a55a",
        warn: "#e8a55a",
        bad: "#e15f5f",
        good: "#7fcf93",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(207,118,92,.28), 0 24px 70px -42px rgba(207,118,92,.75)",
        card: "0 18px 60px -46px rgba(0,0,0,.9)",
      },
    },
  },
  plugins: [],
};

export default config;
