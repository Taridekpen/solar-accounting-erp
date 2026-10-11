import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        primary: {
          DEFAULT: "#2563eb",
          foreground: "#ffffff",
        },
        sidebar: {
          DEFAULT: "#0c1222",
          foreground: "#d5deea",
          muted: "#8b9bb4",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px rgb(15 23 42 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
