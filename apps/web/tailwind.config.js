/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");
const daisyuiColorObj = require("daisyui/src/theming/index");

module.exports = {
  daisyui: {
    // Muninn "Cobalt" palette (Emkraan web-ui-standard v2/v3).
    // Logo-derived blue #1B6FB8 (token) / #2486B9 (peak) is the sole accent.
    // No violet anywhere. Boots dark by default (see _document.tsx).
    themes: [
      {
        light: {
          primary: "#1B6FB8",
          secondary: "#155A95",
          accent: "#1B6FB8",
          neutral: "#6b7280",
          "neutral-content": "#d1d5db",
          "base-100": "#ffffff",
          "base-200": "#f3f4f6",
          "base-content": "#0a0a0a",
          info: "#1B6FB8",
          success: "#1E9F2C",
          warning: "#E8A317",
          error: "#B41818",
        },
      },
      {
        dark: {
          primary: "#2486B9",
          "primary-content": "#F7F9FB",
          secondary: "#1B6FB8",
          "secondary-content": "#F7F9FB",
          accent: "#2486B9",
          "accent-content": "#F7F9FB",
          // Cobalt: neutral == legible muted text (used app-wide as text-neutral);
          // neutral-content == visible hairline border (used as border-neutral-content).
          // The upstream near-black values (#1C1F25 / #262A31) made both invisible.
          neutral: "#7C879A",
          "neutral-content": "#263049",
          "base-100": "#0B1220",
          "base-200": "#131B2E",
          "base-300": "#182238",
          "base-content": "#F7F9FB",
          info: "#4A9FE0",
          success: "#34C759",
          warning: "#E8A317",
          error: "#EB5860",
        },
      },
    ],
  },
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",

    // For the "layouts" directory
    "./layouts/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [
    require("daisyui"),
    plugin(({ addVariant }) => {
      addVariant("dark", '&[data-theme="dark"]');
    }),
    require("tailwindcss-animate"),
  ],
  theme: {
    extend: {
      colors: {
        border: daisyuiColorObj["neutral-content"],
        input: daisyuiColorObj["base-content"],
        ring: daisyuiColorObj["base-content"],
        background: daisyuiColorObj["base-100"],
        foreground: daisyuiColorObj["base-content"],
        primary: {
          DEFAULT: daisyuiColorObj["primary"],
          foreground: daisyuiColorObj["primary-content"],
        },
        secondary: {
          DEFAULT: daisyuiColorObj["secondary"],
          foreground: daisyuiColorObj["secondary-content"],
        },
        destructive: {
          DEFAULT: daisyuiColorObj["error"],
          foreground: daisyuiColorObj["error-content"],
        },
        muted: {
          DEFAULT: daisyuiColorObj["base-300"],
          foreground: daisyuiColorObj["base-content"],
        },
        accent: {
          DEFAULT: daisyuiColorObj["accent"],
          foreground: daisyuiColorObj["accent-content"],
        },
        popover: {
          DEFAULT: daisyuiColorObj["base-200"],
          foreground: daisyuiColorObj["base-content"],
        },
        card: {
          DEFAULT: daisyuiColorObj["base-100"],
          foreground: daisyuiColorObj["base-content"],
        },
      },
      borderRadius: {
        lg: "var(--rounded-btn)",
        md: "calc(var(--rounded-btn) - 2px)",
        sm: "calc(var(--rounded-btn) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
};
