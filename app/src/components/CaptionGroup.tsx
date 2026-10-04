import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, getSpeakerColor, radii, spacing, typography } from "../theme";
import { ExtendedCaptionMessage } from "./CaptionLine";

interface CaptionGroupProps {
  speakerId: number | null;
  speakerName?: string;
  speakerColor?: string;
  captions: ExtendedCaptionMessage[];
  isCurrentSpeaker?: boolean;
}

const AnimatedTypingDots: React.FC = () => {
  const dot1 = useRef(new Animated.Value(0.2)).current;
  const dot2 = useRef(new Animated.Value(0.2)).current;
  const dot3 = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(val, {
          toValue: 0.2,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, 360 - delay)),
      ]);

    const anim = Animated.loop(
      Animated.parallel([
        pulse(dot1, 0),
        pulse(dot2, 180),
        pulse(dot3, 360),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.animatedDotsContainer} accessibilityLabel="Listening...">
      <Animated.Text style={[styles.animatedDotText, { opacity: dot1 }]}>•</Animated.Text>
      <Animated.Text style={[styles.animatedDotText, { opacity: dot2 }]}>•</Animated.Text>
      <Animated.Text style={[styles.animatedDotText, { opacity: dot3 }]}>•</Animated.Text>
    </View>
  );
};

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
          hasOverlap && styles.groupOverlap,
        ]}
      >
        {/* Speaker Editorial Header */}
        <View style={styles.speakerHeader}>
          <View style={styles.nameRow}>
            <View style={[styles.speakerDot, { backgroundColor: resolvedColor }]} />
            <Text style={[styles.speakerName, { color: resolvedColor }]}>
              {resolvedName.toUpperCase()}
            </Text>

            {isCurrentSpeaker && (
              <View style={styles.speakingBadge}>
                <View style={[styles.speakingPulseDot, { backgroundColor: resolvedColor }]} />
                <Text style={[styles.speakingBadgeText, { color: resolvedColor }]}>
                  SPEAKING
                </Text>
              </View>
            )}

            {hasOverlap && (
              <View style={styles.overlapTag}>
                <Text style={styles.overlapTagText}>Simultaneous speech</Text>
              </View>
            )}
          </View>

          {/* Grouped Caption Lines (Consecutive statements by this speaker) */}
          <View className="gap-1.5" style={styles.sentencesContainer}>
            {captions.map((caption, idx) => {
              const isLineDraft = caption.state === "draft";
              return (
                <View key={caption.line_id || idx} style={styles.sentenceRow}>
                  {isLineDraft && (!caption.text || !caption.text.trim()) ? (
                    <AnimatedTypingDots />
                  ) : (
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
                  )}
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
    paddingVertical: 18,
    paddingHorizontal: 0,
    marginVertical: 12,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
    paddingLeft: 16,
  },
  activeSpeakerGroup: {
    borderLeftColor: colors.primary,
  },
  groupOverlap: {
    borderLeftColor: colors.danger,
  },
  speakerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  speakerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  speakerName: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  speakingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
});
