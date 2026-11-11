/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}", 
  ],
  theme: {
    extend: {
      // Written as RGB channels so opacity modifiers (bg-cyan/15, border-cyan/25) work.
      // A plain var() colour gives Tailwind nothing to apply the opacity to, so those
      // classes would silently produce no CSS. The channels live in globals.css.
      colors: {
        deep: "rgb(var(--bg-deep-rgb) / <alpha-value>)",
        cyan: "rgb(var(--accent-cyan-rgb) / <alpha-value>)",
        blue: "rgb(var(--accent-blue-rgb) / <alpha-value>)",
        muted: "rgb(var(--text-muted-rgb) / <alpha-value>)",
      },
      backgroundColor: {
        glass: "var(--glass-panel)",
      },
      borderColor: {
        glass: "var(--glass-border)",
      }
    },
  },
  plugins: [],
};