/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // These are the custom colors used in your App.jsx
        cubity: {
          bg: "#0f172a", // Slate 950 (Main Background)
          panel: "#1e293b", // Slate 800 (Cards/Panels)
          accent: "#3b82f6", // Blue 500 (Buttons/Highlights)
          success: "#22c55e", // Green 500
          danger: "#ef4444", // Red 500
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"], // Used for timer digits
      },
    },
  },
  plugins: [],
};
