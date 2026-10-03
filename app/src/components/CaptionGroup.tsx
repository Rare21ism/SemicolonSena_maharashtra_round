import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, getSpeakerColor, radii, typography } from "../theme";
import { ExtendedCaptionMessage } from "./CaptionLine";
import { ParticipantAvatar } from "./ParticipantAvatar";

interface CaptionGroupProps {
  speakerId: number | null;
  speakerName?: string;
  speakerColor?: string;
  captions: ExtendedCaptionMessage[];
  isCurrentSpeaker?: boolean;
}

export const CaptionGroup: React.FC<CaptionGroupProps> = React.memo(
  ({
    speakerId,
    speakerName,
    speakerColor,
    captions,
    isCurrentSpeaker = false,
  }) => {
    const fallback = getSpeakerColor(speakerId);
    const resolvedColor = speakerColor || fallback.color;
    const resolvedName =
      speakerName ||
      (speakerId !== null ? `Speaker ${speakerId + 1}` : "Speaker");

    const formatTime = (ms: number) => {
      if (!ms) return "";
      const totalSec = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const hasDraft = captions.some((c) => c.state === "draft");
    const hasOverlap = captions.some((c) => c.isOverlapping);

    return (
      <View
        style={[
          styles.groupContainer,
          isCurrentSpeaker && styles.activeSpeakerGroup,
          hasDraft && styles.groupDraft,
          hasOverlap && styles.groupOverlap,
        ]}
      >
        {/* Left Avatar Column */}
        <View style={styles.avatarCol}>
          <ParticipantAvatar
            name={resolvedName}
            speakerId={speakerId}
            color={resolvedColor}
            isSpeaking={isCurrentSpeaker || hasDraft}
            size={36}
          />
        </View>

        {/* Right Content Area */}
        <View style={styles.contentCol}>
          {/* Speaker Header */}
          <View style={styles.speakerHeader}>
            <View style={styles.nameRow}>
              <Text style={[styles.speakerName, { color: resolvedColor }]}>
                {resolvedName}
              </Text>

              {hasOverlap && (
                <View style={styles.overlapTag}>
                  <Text style={styles.overlapTagText}>Simultaneous speech</Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              {hasDraft && (
                <View style={styles.speakingIndicator}>
                  <View style={styles.speakingDot} />
                  <Text style={styles.speakingText}>Speaking</Text>
                </View>
              )}
              {captions[0]?.t_start ? (
                <Text style={styles.timestamp}>
                  {formatTime(captions[0].t_start)}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Grouped Caption Lines */}
          <View style={styles.sentencesContainer}>
            {captions.map((caption, idx) => {
              const isLineDraft = caption.state === "draft";
              return (
                <View key={caption.line_id || idx} style={styles.sentenceRow}>
                  <Text
                    style={[
                      styles.captionText,
                      isLineDraft ? styles.captionDraftText : styles.captionFinalText,
                    ]}
                  >
                    {caption.text}
                    {isLineDraft && (
                      <Text style={styles.draftPulse}> ···</Text>
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  groupContainer: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    marginVertical: 4,
    backgroundColor: "rgba(23, 32, 51, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  activeSpeakerGroup: {
    borderColor: "rgba(99, 102, 241, 0.3)",
    backgroundColor: "rgba(23, 32, 51, 0.7)",
  },
  groupDraft: {
    backgroundColor: "rgba(23, 32, 51, 0.5)",
  },
  groupOverlap: {
    borderColor: "rgba(239, 68, 68, 0.25)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  avatarCol: {
    marginRight: 14,
    paddingTop: 2,
    alignItems: "center",
  },
  contentCol: {
    flex: 1,
    justifyContent: "center",
  },
  speakerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  speakerName: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  overlapTag: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  overlapTagText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.danger,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  speakingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  speakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  speakingText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.success,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
  },
  sentencesContainer: {
    gap: 6,
  },
  sentenceRow: {
    marginVertical: 1,
  },
  captionText: {
    ...typography.caption,
  },
  captionFinalText: {
    color: colors.textPrimary,
  },
  captionDraftText: {
    color: "#CBD5E1",
    opacity: 0.85,
  },
  draftPulse: {
    color: colors.primaryLight,
    fontWeight: "600",
  },
});

