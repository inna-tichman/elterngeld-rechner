import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "sans-serif"],
        serif: ["var(--font-dm-serif)", "serif"],
      },
      colors: {
        sage: {
          DEFAULT: "#4a7c6f",
          light: "#e8f0ee",
          mid: "#b8d4cd",
        },
        sand: "#f5f0e8",
        ink: {
          DEFAULT: "#1a1a18",
          mid: "#5a5a54",
          light: "#9a9a90",
        },
        cream: "#fafaf8",
      },
      borderColor: {
        "sage/10": "rgba(74,124,111,0.10)",
        "sage/8": "rgba(74,124,111,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
