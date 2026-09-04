import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./emails/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        /* shadcn/radix semantic tokens — mapped to CSS vars */
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary:     { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary:   { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted:       { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent:      { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover:     { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card:        { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },

        /* ── CapitalReach design tokens ── */

        /* Paper backgrounds. Var-backed so Tailwind utilities follow the
           theme (data-theme) and style (data-style) registers -- these were
           static hex, which froze every Tailwind-styled page in editorial
           light while the rest of the app re-skinned. Tokens used with alpha
           modifiers (bg-cr-copper/10 etc.) go through RGB triplets so
           <alpha-value> still works; the rest bind the var directly. */
        "cr-paper":  "rgb(var(--cr-paper-rgb) / <alpha-value>)",
        "cr-p2":     "rgb(var(--cr-p2-rgb) / <alpha-value>)",
        "cr-p3":     "var(--cr-paper-3)",
        "cr-p4":     "rgb(var(--cr-p4-rgb) / <alpha-value>)",

        /* Ink text */
        "cr-ink":  "var(--cr-ink)",
        "cr-i2":   "var(--cr-ink-2)",
        "cr-i3":   "var(--cr-ink-3)",
        "cr-i4":   "var(--cr-ink-4)",

        /* Copper accent */
        "cr-copper": "rgb(var(--cr-copper-rgb) / <alpha-value>)",
        "cr-cu-l":   "var(--cr-copper-l)",
        "cr-cu-d":   "rgb(var(--cr-cu-d-rgb) / <alpha-value>)",

        /* Semantic data */
        "cr-up":      "rgb(var(--cr-up-rgb) / <alpha-value>)",
        "cr-down":    "var(--cr-down)",
        "cr-neutral": "var(--cr-neutral)",
      },
      fontFamily: {
        sans:    ["DM Sans", "system-ui", "sans-serif"],
        serif:   ["Playfair Display", "Georgia", "serif"],
        mono:    ["JetBrains Mono", "monospace"],
        arabic:  ["Cairo", "Noto Sans Arabic", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* The house has one card geometry. rounded-xl/2xl were escape hatches
           to 12/16px template corners on the shadcn-era pages; bind them to
           the token so the whole app squares up at once. */
        xl:    "var(--radius)",
        "2xl": "var(--radius)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in":   { from: { opacity: "0", transform: "translateY(8px)" },  to: { opacity: "1", transform: "translateY(0)" } },
        "slide-up":  { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in":  { from: { opacity: "0", transform: "scale(0.95)" },      to: { opacity: "1", transform: "scale(1)" } },
        "pulse-sk":  { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        "slide-in":  { from: { transform: "translateX(110%)", opacity: "0" }, to: { transform: "translateX(0)", opacity: "1" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "fade-in":        "fade-in 0.4s ease-out",
        "slide-up":       "slide-up 0.5s ease-out",
        "scale-in":       "scale-in 0.25s ease-out",
        "pulse-sk":       "pulse-sk 1.8s ease infinite",
        "slide-in":       "slide-in 220ms cubic-bezier(0.16,1,0.3,1) forwards",
      },
      boxShadow: {
        "editorial":  "0 1px 3px rgba(26,22,18,0.06), 0 4px 16px rgba(26,22,18,0.08)",
        "copper-focus": "0 0 0 3px rgba(181,101,29,0.12)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
