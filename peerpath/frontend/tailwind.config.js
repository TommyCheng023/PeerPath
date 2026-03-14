/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#00274C",
        maize: "#FFCB05",
        parchment: "#F0ECE0",
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        serif: ["Instrument Serif", "serif"],
      },
      boxShadow: {
        glow: "0 12px 40px rgba(255, 203, 5, 0.2)",
      },
    },
  },
  plugins: [],
};
