/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "IBM Plex Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        space: "rgb(var(--space) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          muted: "rgb(var(--fg-muted) / <alpha-value>)",
          faint: "rgb(var(--fg-faint) / <alpha-value>)",
        },
        star: "rgb(var(--star) / <alpha-value>)",
      },
      fontSize: {
        "12": ["12px", { lineHeight: "1.5" }],
        "14": ["14px", { lineHeight: "1.55" }],
        "16": ["16px", { lineHeight: "1.6" }],
        "21": ["21px", { lineHeight: "1.35" }],
        "28": ["28px", { lineHeight: "1.2" }],
        "38": ["38px", { lineHeight: "1.15" }],
        "50": ["50px", { lineHeight: "1.1" }],
        "67": ["67px", { lineHeight: "1.05" }],
      },
      letterSpacing: {
        hero: "-0.01em",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
    },
  },
  plugins: [],
};
