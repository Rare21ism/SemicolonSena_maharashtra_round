import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CaptionMessage } from "@roundtable/protocol";
import { colors, getSpeakerColor, radii, spacing, typography } from "../theme";
import { ParticipantAvatar } from "./ParticipantAvatar";

export interface ExtendedCaptionMessage extends CaptionMessage {
  isOverlapping?: boolean;
  speakerName?: string;
  speakerColor?: string;
}

interface CaptionLineProps {
  caption: ExtendedCaptionMessage;
  speakerName?: string;
  speakerColor?: string;
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

export const CaptionLine: React.FC<CaptionLineProps> = React.memo(
  ({ caption, speakerName, speakerColor, isCurrentSpeaker = false }) => {
    const isDraft = caption.state === "draft";
    const fadeAnim = useRef(new Animated.Value(0.4)).current;

    // Resolve speaker color & name
    const fallback = getSpeakerColor(caption.speaker_id);
    const resolvedColor = speakerColor || caption.speakerColor || fallback.color;
    const resolvedName =
      speakerName ||
      caption.speakerName ||
      (caption.speaker_id !== null ? `Participant ${caption.speaker_id}` : "Speaker");

    // Format start time into mm:ss or seconds
    const formatTime = (ms: number) => {
      const totalSec = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
      }
      return `${(ms / 1000).toFixed(1)}s`;
    };

    // Smooth subtle flash on revision update
    useEffect(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }, [caption.rev, caption.text, fadeAnim]);

    return (
      <Animated.View
        className="flex-row py-3.5 px-4 mb-2 rounded-xl border border-borderDefault bg-bgCard/60"
        style={[
          styles.container,
          isDraft ? styles.containerDraft : styles.containerFinal,
          caption.isOverlapping && styles.containerOverlap,
          { opacity: fadeAnim },
        ]}
      >
        {/* Left Avatar Column */}
        <View className="mr-3 pt-0.5" style={styles.avatarCol}>
          <ParticipantAvatar
            name={resolvedName}
            speakerId={caption.speaker_id}
            color={resolvedColor}
            isSpeaking={isCurrentSpeaker || isDraft}
            size={36}
          />
        </View>

        {/* Right Content Column */}
        <View className="flex-1 min-w-0" style={styles.contentCol}>
          <View className="flex-row items-center justify-between mb-1 pb-1" style={styles.headerRow}>
            <View className="flex-row items-center gap-2" style={styles.speakerIdentityRow}>
              <Text className="text-xs font-black tracking-wider uppercase" style={[styles.speakerName, { color: resolvedColor }]}>
                {resolvedName.toUpperCase()}
              </Text>

              {caption.isOverlapping && (
                <View style={styles.overlapBadge}>
                  <Text style={styles.overlapBadgeText}>OVERLAP</Text>
                </View>
              )}
            </View>

            <View className="flex-row items-center gap-2" style={styles.metaRow}>
              {isDraft ? (
                <View style={styles.draftBadge}>
                  <View style={styles.draftPulseDot} />
                  <Text style={styles.draftBadgeText}>LIVE</Text>
                </View>
              ) : (
                caption.rev > 1 && (
                  <Text style={styles.revTag}>rev.{caption.rev}</Text>
                )
              )}
              <Text style={styles.timeTag}>{formatTime(caption.t_start)}</Text>
            </View>
          </View>

          {/* Transcript Text (Hero readability) */}
          {isDraft && (!caption.text || !caption.text.trim()) ? (
            <AnimatedTypingDots />
          ) : (
            <Text
              className={isDraft ? "text-lg font-medium leading-relaxed text-textSecondary italic" : "text-lg font-bold leading-relaxed text-textPrimary"}
              style={[
                styles.captionBody,
                isDraft ? styles.captionBodyDraft : styles.captionBodyFinal,
              ]}
            >
              {caption.text}
              {isDraft && <Text style={styles.draftCaret}> ▎</Text>}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.caption.line_id === next.caption.line_id &&
    prev.caption.rev === next.caption.rev &&
    prev.caption.state === next.caption.state &&
    prev.caption.text === next.caption.text &&
    prev.caption.speaker_id === next.caption.speaker_id &&
    prev.caption.isOverlapping === next.caption.isOverlapping &&
    prev.speakerName === next.speakerName &&
    prev.speakerColor === next.speakerColor &&
    prev.isCurrentSpeaker === next.isCurrentSpeaker
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    marginVertical: 4,
    borderLeftWidth: 3,
    backgroundColor: "transparent",
  },
  containerFinal: {
    borderLeftColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(19, 28, 46, 0.45)",
  },
  containerDraft: {
    borderLeftColor: colors.warning,
    backgroundColor: "rgba(19, 28, 46, 0.25)",
  },
  containerOverlap: {
    borderLeftColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  avatarCol: {
    marginRight: 12,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  contentCol: {
    flex: 1,
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  speakerIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  speakerName: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  overlapBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  overlapBadgeText: {
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
  draftBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.4)",
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    gap: 4,
  },
  draftPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  draftBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.warning,
    letterSpacing: 0.6,
  },
  revTag: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  timeTag: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  captionBody: {
    ...typography.caption,
  },
  captionBodyFinal: {
    color: colors.textPrimary,
  },
  captionBodyDraft: {
    color: "#CBD5E1",
    fontStyle: "italic",
  },
  draftCaret: {
    color: colors.warning,
    fontSize: 14,
  },
  animatedDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  animatedDotText: {
    fontSize: 20,
    lineHeight: 22,
    color: colors.warning,
    fontWeight: "bold",
  },
});
