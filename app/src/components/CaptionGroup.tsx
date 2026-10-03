import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, getSpeakerColor, radii, spacing, typography } from "../theme";
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
      (speakerId !== null ? `Speaker ${speakerId}` : "Unknown Speaker");

    const formatTime = (ms: number) => {
      const totalSec = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
      }
      return `${(ms / 1000).toFixed(1)}s`;
    };

    const hasDraft = captions.some((c) => c.state === "draft");
    const hasOverlap = captions.some((c) => c.isOverlapping);

    return (
      <View
        className="flex-row py-3.5 px-4 mb-2.5 rounded-2xl border border-borderDefault bg-bgCard/60"
        style={[
          styles.groupContainer,
          hasDraft && styles.groupDraft,
          hasOverlap && styles.groupOverlap,
        ]}
      >
        {/* Left Avatar Column */}
        <View className="mr-3.5 pt-0.5" style={styles.avatarCol}>
          <ParticipantAvatar
            name={resolvedName}
            speakerId={speakerId}
            color={resolvedColor}
            isSpeaking={isCurrentSpeaker || hasDraft}
            size={38}
          />
        </View>

        {/* Right Content Area */}
        <View className="flex-1 min-w-0" style={styles.contentCol}>
          {/* Speaker Header (rendered once for the group) */}
          <View className="flex-row items-center justify-between mb-2 pb-1.5 border-b border-white/5" style={styles.speakerHeader}>
            <View className="flex-row items-center gap-2" style={styles.nameRow}>
              <Text className="text-xs font-black tracking-wider uppercase" style={[styles.speakerName, { color: resolvedColor }]}>
                {resolvedName.toUpperCase()}
              </Text>
              {speakerId === null && (
                <Text style={styles.uncertainTag}>Uncertain</Text>
              )}
              {hasOverlap && (
                <View style={styles.overlapTag}>
                  <Text style={styles.overlapTagText}>OVERLAP</Text>
                </View>
              )}
            </View>

            <View className="flex-row items-center gap-2" style={styles.metaRow}>
              {hasDraft && (
                <View style={styles.liveBadge}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              )}
              <Text style={styles.timestamp}>
                {formatTime(captions[0]?.t_start || 0)}
              </Text>
            </View>
          </View>

          {/* Grouped Caption Lines (Consecutive statements by this speaker) */}
          <View className="gap-1.5" style={styles.sentencesContainer}>
            {captions.map((caption, idx) => {
              const isLineDraft = caption.state === "draft";
              return (
                <View key={caption.line_id || idx} style={styles.sentenceRow}>
                  <Text
                    className={isLineDraft ? "text-base font-medium text-textSecondary" : "text-base font-semibold text-textPrimary"}
                    style={[
                      styles.captionText,
                      isLineDraft ? styles.captionDraftText : styles.captionFinalText,
                    ]}
                  >
                    {caption.text}
                    {isLineDraft && <Text style={styles.draftCaret}> ▎</Text>}
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.xl,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(19, 28, 46, 0.4)",
  },
  groupDraft: {
    borderLeftColor: colors.warning,
    backgroundColor: "rgba(19, 28, 46, 0.28)",
  },
  groupOverlap: {
    borderLeftColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
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
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  uncertainTag: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  overlapTag: {
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  overlapTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radii.sm,
    gap: 4,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.warning,
    letterSpacing: 0.6,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
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
    fontStyle: "italic",
  },
  draftCaret: {
    color: colors.warning,
    fontSize: 14,
  },
});
