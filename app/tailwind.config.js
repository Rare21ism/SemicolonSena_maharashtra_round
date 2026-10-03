/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bgPrimary: "#FBF9F5",
        bgSecondary: "#F3F0EA",
        bgCard: "#FFFFFF",
        bgCardHover: "#F7F5F1",
        bgInput: "#FFFFFF",
        borderDefault: "rgba(18, 19, 18, 0.12)",
        borderFocus: "#38493B",
        primary: "#2C392F",
        primaryLight: "#4E6352",
        primaryDark: "#1B241D",
        success: "#2B6140",
        warning: "#9A5D16",
        danger: "#A83232",
        textPrimary: "#111211",
        textSecondary: "#484B48",
        textMuted: "#747774",
        textDisabled: "#9FA29F",
      },
    },
  },
  plugins: [],
};

