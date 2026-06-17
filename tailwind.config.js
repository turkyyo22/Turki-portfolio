/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}", 
  ],
  theme: {
    extend: {
      colors: {
        deep: "var(--bg-deep)",
        cyan: "var(--accent-cyan)",
        blue: "var(--accent-blue)",
        muted: "var(--text-muted)",
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