/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        ink: {
          950: "#08090C",
          900: "#0B0D12",
          800: "#11141B",
          700: "#171B24",
          600: "#1F2430",
        },
        accent: {
          DEFAULT: "#7DD3FC",   // soft cyan
          muted: "#38BDF8",
          deep: "#0EA5E9",
        },
      },
      boxShadow: {
        glass:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(255,255,255,0.06), 0 20px 40px -20px rgba(0,0,0,0.6)",
        glow: "0 0 40px -10px rgba(125,211,252,0.35)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, transparent, rgba(8,9,12,0.9) 80%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
