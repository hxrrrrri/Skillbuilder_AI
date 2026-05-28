import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#141413",
        panel: "#1f1e1d",
        panel2: "#262522",
        border: "#3d3d3a",
        ink: "#faf9f5",
        body: "#c2c0b6",
        muted: "#9c9a92",
        soft: "#dbeafe",
        cream: "#eef7ff",
        accent: "#d97757",
        accent2: "#c96442",
        warn: "#d89a45",
        bad: "#e15f5f",
        good: "#86c994",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(217,119,87,.24), 0 24px 64px -48px rgba(217,119,87,.7)",
        card: "0 16px 48px -36px rgba(0,0,0,.72)",
      },
    },
  },
  plugins: [],
};

export default config;
