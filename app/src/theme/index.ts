/**
 * Roundtable Design System Tokens
 * Curated dark-first palette focused on conversation, presence, and legibility.
 */

export const colors = {
  // Backgrounds
  bgPrimary: "#090D16",       // Deep warm charcoal navy
  bgSecondary: "#111726",     // Surface background
  bgCard: "#172033",          // Elevated card background
  bgCardHover: "#1E2A42",     // Card hover state
  bgInput: "#0D1322",         // Input field background
  bgGlass: "rgba(17, 23, 38, 0.85)", // Subtle overlay

  // Borders
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderDefault: "rgba(255, 255, 255, 0.10)",
  borderBright: "rgba(255, 255, 255, 0.18)",
  borderActive: "rgba(99, 102, 241, 0.45)",

  // Brand Accents
  primary: "#6366F1",         // Indigo
  primaryLight: "#818CF8",
  primaryDark: "#4F46E5",
  primaryGlow: "rgba(99, 102, 241, 0.18)",
  cyan: "#0EA5E9",

  // Status & Telemetry (Restrained)
  success: "#10B981",         // Emerald green (Listening / Connected)
  successGlow: "rgba(16, 185, 129, 0.15)",
  warning: "#F59E0B",         // Amber (Reconnecting / Draft)
  warningGlow: "rgba(245, 158, 11, 0.15)",
  danger: "#EF4444",          // Coral red (Error / Mic Muted)
  dangerGlow: "rgba(239, 68, 68, 0.15)",
  info: "#3B82F6",

  // Text Hierarchy (High contrast & legibility)
  textPrimary: "#F8FAFC",     // Crisp warm white
  textSecondary: "#94A3B8",   // Slate-400
  textMuted: "#64748B",       // Slate-500
  textDim: "#475569",         // Slate-600

  // Participant Speaker Palette (Harmonious, distinct palette)
  speakers: [
    { id: 0, color: "#A855F7", bg: "rgba(168, 85, 247, 0.12)", label: "Purple" },
    { id: 1, color: "#38BDF8", bg: "rgba(56, 189, 248, 0.12)", label: "Blue" },
    { id: 2, color: "#34D399", bg: "rgba(52, 211, 153, 0.12)", label: "Green" },
    { id: 3, color: "#FB923C", bg: "rgba(251, 146, 60, 0.12)", label: "Orange" },
    { id: 4, color: "#F472B6", bg: "rgba(244, 114, 182, 0.12)", label: "Rose" },
    { id: 5, color: "#2DD4BF", bg: "rgba(45, 212, 191, 0.12)", label: "Teal" },
  ],
  speakerDefault: {
    color: "#94A3B8",
    bg: "rgba(148, 163, 184, 0.10)",
    label: "Speaker",
  },
};

export const typography = {
  h1: {
    fontSize: 34,
    fontWeight: "700" as const,
    letterSpacing: -0.8,
    color: colors.textPrimary,
    lineHeight: 42,
  },
  h2: {
    fontSize: 24,
    fontWeight: "700" as const,
    letterSpacing: -0.4,
    color: colors.textPrimary,
    lineHeight: 32,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
    letterSpacing: -0.2,
    color: colors.textPrimary,
    lineHeight: 26,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    lineHeight: 23,
  },
  caption: {
    fontSize: 18,
    fontWeight: "500" as const,
    color: colors.textPrimary,
    lineHeight: 29,
    letterSpacing: -0.1,
  },
  captionDraft: {
    fontSize: 18,
    fontWeight: "400" as const,
    color: "#CBD5E1",
    lineHeight: 29,
    letterSpacing: -0.1,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "600" as const,
    letterSpacing: 1.2,
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

