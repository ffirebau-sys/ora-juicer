import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ora: {
          50: "#fff8ed",
          100: "#ffedcf",
          200: "#ffd799",
          300: "#ffba5b",
          400: "#ff9f26",
          500: "#ff8100",
          600: "#e85e00",
          700: "#bf4300",
          800: "#993606",
          900: "#7c300b"
        },
        ink: {
          950: "#030609",
          900: "#070d14",
          850: "#0b121d",
          800: "#101927",
          700: "#172336",
          600: "#22324a"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 32px rgba(255, 129, 0, 0.32)",
        "glow-strong": "0 0 52px rgba(255, 129, 0, 0.44)",
        panel: "0 20px 80px rgba(0, 0, 0, 0.38)"
      },
      backgroundImage: {
        "ora-radial": "radial-gradient(circle at center, rgba(255,129,0,0.34), rgba(255,129,0,0.08) 36%, transparent 68%)",
        "panel-gradient": "linear-gradient(145deg, rgba(18,29,45,0.92), rgba(7,13,20,0.94))"
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.48", transform: "scale(0.96)" },
          "50%": { opacity: "0.96", transform: "scale(1.05)" }
        },
        floatCoin: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "pulse-glow": "pulseGlow 3.4s ease-in-out infinite",
        "float-coin": "floatCoin 4s ease-in-out infinite",
        orbit: "orbit 16s linear infinite",
        shimmer: "shimmer 2.8s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
