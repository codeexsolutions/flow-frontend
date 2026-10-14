// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
        },
        ink: "rgb(var(--ink) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
        },
        fg: "rgb(var(--fg) / <alpha-value>)",
        // Semânticas via token: precisam escurecer no tema claro para manter contraste
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        // `sans` é a de texto: ela é o padrão herdado por toda a interface.
        sans: ["Inter Variable", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Inter Variable", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderColor: {
        DEFAULT: "rgb(var(--fg) / 0.08)",
      },
      boxShadow: {
        e1: "var(--shadow-1)",
        e2: "var(--shadow-2)",
        e3: "var(--shadow-3)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.25), 0 8px 32px -8px rgb(var(--accent) / 0.45)",
      },
      backdropBlur: {
        xs: "var(--blur-sm)",
        sm: "var(--blur-md)",
        lg: "var(--blur-lg)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up .35s cubic-bezier(.22,1,.36,1) both",
        "scale-in": "scale-in .25s cubic-bezier(.22,1,.36,1) both",
      },
    },
  },
  plugins: [],
};
