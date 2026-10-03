/**
 * Roundtable Design System Tokens
 * Curated dark-first palette, typography scale, speaker colors, and layout constants.
 */

export const colors = {
  // Backgrounds
  bgPrimary: "#070B14",       // Deepest space navy
  bgSecondary: "#0D1322",     // Surface background
  bgCard: "#131C2E",          // Elevated card background
  bgCardHover: "#1A253C",     // Card hover state
  bgInput: "#0A0F1D",         // Input field background
  bgGlass: "rgba(13, 19, 34, 0.85)", // Glassmorphic overlay

  // Borders
  borderSubtle: "rgba(255, 255, 255, 0.07)",
  borderDefault: "rgba(255, 255, 255, 0.12)",
  borderBright: "rgba(255, 255, 255, 0.22)",
  borderActive: "rgba(99, 102, 241, 0.5)",

  // Brand Accents
  primary: "#6366F1",         // Indigo
  primaryLight: "#818CF8",
  primaryDark: "#4F46E5",
  primaryGlow: "rgba(99, 102, 241, 0.25)",
  cyan: "#06B6D4",
  cyanGlow: "rgba(6, 182, 212, 0.2)",

  // Status & Telemetry
  success: "#10B981",         // Emerald
  successGlow: "rgba(16, 185, 129, 0.2)",
  warning: "#F59E0B",         // Amber
  warningGlow: "rgba(245, 158, 11, 0.2)",
  danger: "#EF4444",          // Crimson
  dangerGlow: "rgba(239, 68, 68, 0.2)",
  info: "#3B82F6",            // Sky blue

  // Text Hierarchy
  textPrimary: "#F8FAFC",     // High contrast white
  textSecondary: "#CBD5E1",   // Slate-300
  textMuted: "#64748B",       // Slate-500
  textDim: "#475569",         // Slate-600

  // Participant Speaker Palette (Jim, Pam, Dwight, Michael)
  speakers: [
    { id: 0, color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.14)", label: "Jim (Purple)" },
    { id: 1, color: "#0284C7", bg: "rgba(2, 132, 199, 0.14)", label: "Pam (Blue)" },
    { id: 2, color: "#10B981", bg: "rgba(16, 185, 129, 0.14)", label: "Dwight (Green)" },
    { id: 3, color: "#F97316", bg: "rgba(249, 115, 22, 0.14)", label: "Michael (Orange)" },
    { id: 4, color: "#EC4899", bg: "rgba(236, 72, 153, 0.14)", label: "Rose" },
    { id: 5, color: "#14B8A6", bg: "rgba(20, 184, 166, 0.14)", label: "Teal" },
  ],
  speakerDefault: {
    color: "#94A3B8",
    bg: "rgba(148, 163, 184, 0.12)",
    label: "Unknown / Ambient",
  },
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: "800" as const,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 24,
    fontWeight: "700" as const,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  h3: {
    fontSize: 18,
    fontWeight: "700" as const,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  caption: {
    fontSize: 19,
    fontWeight: "500" as const,
    color: colors.textPrimary,
    lineHeight: 30,
    letterSpacing: 0.1,
  },
  captionDraft: {
    fontSize: 19,
    fontWeight: "400" as const,
    color: "#CBD5E1",
    lineHeight: 30,
    letterSpacing: 0.1,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
  },
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: colors.textMuted,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  full: 9999,
};

export function getSpeakerColor(speakerId: number | null): { color: string; bg: string } {
  if (speakerId === null || speakerId < 0) {
    return colors.speakerDefault;
  }
  const match = colors.speakers[speakerId % colors.speakers.length];
  return { color: match.color, bg: match.bg };
}
