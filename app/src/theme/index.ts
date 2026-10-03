/**
 * Roundtable Editorial Design System Tokens
 * Reference-driven editorial typography, generous whitespace, restrained sage/charcoal palette.
 */

export const colors = {
  // Backgrounds (Warm Paper / Cream Editorial Palette)
  bgPrimary: "#FBF9F5",       // Warm bone / cream background
  bgSecondary: "#F3F0EA",     // Elevated surface tone
  bgCard: "#FFFFFF",          // Crisp white card surface
  bgCardHover: "#F7F5F1",     // Light hover tint
  bgInput: "#FFFFFF",         // Clean white input surface
  bgDark: "#141614",          // Deep obsidian dark contrast
  bgGlass: "rgba(251, 249, 245, 0.92)",

  // Hairline & Subtle Borders
  borderSubtle: "rgba(18, 19, 18, 0.06)",
  borderDefault: "rgba(18, 19, 18, 0.12)",
  borderBright: "rgba(18, 19, 18, 0.25)",
  borderActive: "#38493B",

  // Editorial Accent Palette (Sage Moss & Warm Terracotta)
  primary: "#2C392F",         // Deep Sage / Charcoal
  primaryLight: "#4E6352",    // Lighter Sage
  primaryDark: "#1B241D",
  primaryGlow: "rgba(56, 73, 59, 0.08)",
  accentTerracotta: "#C55A11", // Subtle warm accent

  // Restrained Status Telemetry
  success: "#2B6140",         // Deep forest green
  successBg: "rgba(43, 97, 64, 0.08)",
  warning: "#9A5D16",         // Muted warm amber
  warningBg: "rgba(154, 93, 22, 0.08)",
  danger: "#A83232",          // Muted crimson
  dangerBg: "rgba(168, 50, 50, 0.08)",
  info: "#2F4356",

  // Typography & Content Hierarchy
  textPrimary: "#111211",     // High contrast near-black
  textSecondary: "#484B48",   // Charcoal slate
  textMuted: "#747774",       // Muted gray-green
  textDim: "#9FA29F",         // Soft dim gray

  // Curated Editorial Speaker Palette (Harmonious & Distinct)
  speakers: [
    { id: 0, color: "#2E523F", bg: "rgba(46, 82, 63, 0.08)", label: "Forest" },
    { id: 1, color: "#8C4B37", bg: "rgba(140, 75, 55, 0.08)", label: "Rust" },
    { id: 2, color: "#2F4356", bg: "rgba(47, 67, 86, 0.08)", label: "Slate" },
    { id: 3, color: "#5E3A54", bg: "rgba(94, 58, 84, 0.08)", label: "Plum" },
    { id: 4, color: "#7D6628", bg: "rgba(125, 102, 40, 0.08)", label: "Ochre" },
    { id: 5, color: "#385A5A", bg: "rgba(56, 90, 90, 0.08)", label: "Teal" },
  ],
  speakerDefault: {
    color: "#484B48",
    bg: "rgba(72, 75, 72, 0.08)",
    label: "Speaker",
  },
};

export const typography = {
  display1: {
    fontSize: 52,
    fontWeight: "800" as const,
    letterSpacing: -1.6,
    color: colors.textPrimary,
    lineHeight: 58,
  },
  h1: {
    fontSize: 36,
    fontWeight: "800" as const,
    letterSpacing: -1.0,
    color: colors.textPrimary,
    lineHeight: 44,
  },
  h2: {
    fontSize: 26,
    fontWeight: "700" as const,
    letterSpacing: -0.6,
    color: colors.textPrimary,
    lineHeight: 34,
  },
  h3: {
    fontSize: 19,
    fontWeight: "600" as const,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    lineHeight: 27,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  caption: {
    fontSize: 21,
    fontWeight: "500" as const,
    color: colors.textPrimary,
    lineHeight: 33,
    letterSpacing: -0.2,
  },
  captionDraft: {
    fontSize: 21,
    fontWeight: "400" as const,
    color: "#747774",
    lineHeight: 33,
    letterSpacing: -0.2,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "600" as const,
    letterSpacing: 1.5,
  },
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    color: colors.textMuted,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 36,
  xxl: 52,
};

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export function getSpeakerColor(speakerId: number | null): { color: string; bg: string } {
  if (speakerId === null || speakerId < 0) {
    return colors.speakerDefault;
  }
  const match = colors.speakers[speakerId % colors.speakers.length];
  return { color: match.color, bg: match.bg };
}


