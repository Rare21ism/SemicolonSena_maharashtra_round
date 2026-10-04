import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, getSpeakerColor, radii } from "../theme";
import { ExtendedCaptionMessage } from "./CaptionLine";

interface CaptionGroupProps {
  speakerId: number | null;
  speakerName?: string;
  speakerColor?: string;
  captions: ExtendedCaptionMessage[];
  isCurrentSpeaker?: boolean;
}

export const CaptionGroup: React.FC<CaptionGroupProps> = React.memo(
  ({ speakerId, speakerName, speakerColor, captions, isCurrentSpeaker = false }) => {
    const fallback = getSpeakerColor(speakerId);
    const resolvedColor = speakerColor || fallback.color;
    const resolvedName = speakerName || (speakerId !== null ? `Speaker ${speakerId + 1}` : "Speaker");
    const hasOverlap = captions.some((caption) => caption.isOverlapping);
    const timestamp = captions[captions.length - 1]?.t_start ?? 0;
    const timeLabel = `${Math.floor(timestamp / 60000)}:${String(Math.floor(timestamp / 1000) % 60).padStart(2, "0")}`;

    return (
      <View
        style={[
          styles.group,
          isCurrentSpeaker && styles.groupActive,
          hasOverlap && styles.groupOverlap,
        ]}
        accessibilityRole="summary"
        accessibilityLabel={`${resolvedName}, ${captions.map((caption) => caption.text).filter(Boolean).join(" ")}`}
      >
        <View style={styles.header}>
          <View style={[styles.speakerMark, { backgroundColor: resolvedColor }]} />
          <Text style={[styles.speakerName, { color: resolvedColor }]}>{resolvedName}</Text>
          {isCurrentSpeaker && (
            <View style={styles.speakingBadge}>
              <View style={[styles.speakingDot, { backgroundColor: resolvedColor }]} />
              <Text style={styles.speakingText}>Speaking</Text>
            </View>
          )}
          {hasOverlap && <Text style={styles.overlapText}>Overlapping voices</Text>}
          <Text style={styles.timestamp}>{timeLabel}</Text>
        </View>

        <View style={styles.lines}>
          {captions.map((caption, index) => {
            if (caption.state === "draft" && !caption.text.trim()) return null;
            const isDraft = caption.state === "draft";
            return (
              <Text
                key={caption.line_id || index}
                accessibilityLabel={isDraft ? `Current speech: ${caption.text}` : caption.text}
                style={[styles.captionText, isDraft && styles.captionDraft]}
              >
                {caption.text}{isDraft ? " ▎" : ""}
              </Text>
            );
          })}
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  group: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 5,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    borderRadius: radii.sm,
  },
  groupActive: {
    borderLeftColor: colors.primary,
    backgroundColor: colors.bgCard,
  },
  groupOverlap: { borderLeftColor: colors.danger },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" },
  speakerMark: { width: 7, height: 7, borderRadius: 4 },
  speakerName: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  speakingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  speakingPulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  speakingBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  overlapTag: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: "rgba(168, 50, 50, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  overlapTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.danger,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  sentencesContainer: {
    gap: 8,
  },
  sentenceRow: {
    marginVertical: 2,
  },
  captionText: {
    fontSize: 22,
    lineHeight: 34,
    letterSpacing: -0.2,
  },
  captionFinalText: {
    color: colors.textPrimary,
    fontWeight: "500",
  },
  captionDraftText: {
    color: colors.textMuted,
    fontWeight: "400",
  },
  draftCaret: {
    color: colors.primaryLight,
    fontWeight: "600",
  },
  draftPulse: {
    color: colors.primaryLight,
    fontWeight: "600",
  },
  animatedDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  animatedDotText: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.warning,
    fontWeight: "bold",
  },
  speakingDot: { width: 5, height: 5, borderRadius: 3 },
  speakingText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  overlapText: { color: colors.danger, fontSize: 10, fontWeight: "700" },
  timestamp: { color: colors.textMuted, fontSize: 10, fontFamily: "monospace", marginLeft: "auto" },
  lines: { gap: 3 },
  captionText: { color: colors.textPrimary, fontSize: 22, lineHeight: 31, fontWeight: "500", letterSpacing: -0.2 },
  captionDraft: { color: colors.textSecondary, fontWeight: "400" },
});
