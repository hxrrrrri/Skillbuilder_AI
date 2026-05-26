import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0a0c10",
        panel: "#0f131a",
        panel2: "#141a23",
        border: "#1f2731",
        ink: "#e6edf3",
        muted: "#8b97a8",
        accent: "#22d3a4",
        accent2: "#22b8d3",
        warn: "#f59e0b",
        bad: "#ef4444",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,211,164,.2), 0 8px 40px -10px rgba(34,211,164,.25)",
      },
    },
  },
  plugins: [],
};

export default config;
