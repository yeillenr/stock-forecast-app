import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#EDF1EE",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#16231F",
          soft: "#4B5B55",
          faint: "#8A9691",
        },
        line: "#DCE3DF",
        brand: {
          DEFAULT: "#2B6E63",
          dark: "#1D4E46",
          soft: "#DEEAE6",
        },
        status: {
          ok: "#2F8F5B",
          okSoft: "#E1F2E7",
          watch: "#C98A24",
          watchSoft: "#FBEDD6",
          critical: "#B8442F",
          criticalSoft: "#F7E2DD",
          out: "#7A1F1F",
          outSoft: "#F1D9D6",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
