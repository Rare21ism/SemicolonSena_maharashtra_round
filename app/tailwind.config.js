/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bgPrimary: "#0B0F19",
        bgSecondary: "#111827",
        bgCard: "#1F2937",
        bgCardHover: "#283548",
        bgInput: "#151C2C",
        borderDefault: "#374151",
        borderFocus: "#6366F1",
        primary: "#6366F1",
        primaryLight: "#818CF8",
        primaryDark: "#4F46E5",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        textPrimary: "#F9FAFB",
        textSecondary: "#E5E7EB",
        textMuted: "#9CA3AF",
        textDisabled: "#4B5563",
        speaker: {
          jim: "#A855F7",
          pam: "#3B82F6",
          dwight: "#10B981",
          michael: "#F59E0B",
        },
      },
    },
  },
  plugins: [],
};
