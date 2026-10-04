import React, { useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DeviceInfo } from "@roundtable/protocol";
import { colors, radii, spacing, typography } from "../theme";
import { AudioWaveform } from "./AudioWaveform";
import { ExtendedCaptionMessage } from "./CaptionLine";
import { CaptionGroup } from "./CaptionGroup";

interface CaptionListProps {
  captions: ExtendedCaptionMessage[];
  roster: DeviceInfo[];
  activeSpeakerId?: number | null;
  overlappingCount?: number;
  micLevel?: number;
}

interface CaptionCluster {
  id: string;
  speakerId: number | null;
  speakerName?: string;
  speakerColor?: string;
  lines: ExtendedCaptionMessage[];
}

export const CaptionList: React.FC<CaptionListProps> = ({
  captions,
  roster,
  activeSpeakerId,
  overlappingCount = 0,
  micLevel = 0,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const shouldAutoScrollRef = useRef(true);

  const speakerMap = new Map<number, DeviceInfo>();
  roster.forEach((dev) => speakerMap.set(dev.device_idx, dev));

  // Empty draft revisions carry no caption text. Keep the stream focused on readable words;
  // the listening status lives in the room controls instead of spawning one loader per speaker.
  const visibleCaptions = captions.filter(
    (caption) => caption.state !== "draft" || Boolean(caption.text.trim())
  );

  // Intelligently group consecutive caption lines by the same speaker
  const clusters: CaptionCluster[] = [];
  visibleCaptions.forEach((cap, index) => {
    const speakerInfo =
      cap.speaker_id !== null ? speakerMap.get(cap.speaker_id) : undefined;
    const resolvedName = cap.speakerName || speakerInfo?.name;
    const resolvedColor = cap.speakerColor || speakerInfo?.color;

    const prevCluster = clusters[clusters.length - 1];
    if (
      prevCluster &&
      prevCluster.speakerId === cap.speaker_id &&
      !cap.isOverlapping
    ) {
      prevCluster.lines.push(cap);
    } else {
      clusters.push({
        id: `cluster-${cap.line_id || index}`,
        speakerId: cap.speaker_id,
        speakerName: resolvedName,
        speakerColor: resolvedColor,
        lines: [cap],
      });
    }
  });

  return (
    <View style={styles.container}>
      {/* Overlapping speech alert banner */}
      {overlappingCount > 1 && (
        <View style={styles.overlapBanner}>
          <View style={styles.overlapDot} />
          <Text style={styles.overlapBannerText}>
            Multiple people speaking simultaneously
          </Text>
        </View>
      )}

      {visibleCaptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.waveformBox}>
            <AudioWaveform
              isActive={micLevel >= 0.01}
              height={32}
              barCount={24}
              color={colors.primaryLight}
              level={micLevel}
            />
          </View>
          <Text style={styles.emptyKicker}>THE CONVERSATION</Text>
          <Text style={styles.emptyTitle}>Listening for the conversation</Text>
          <Text style={styles.emptySubtitle}>
            Speak naturally. Your group’s words will appear here as the conversation unfolds.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={clusters}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CaptionGroup
              speakerId={item.speakerId}
              speakerName={item.speakerName}
              speakerColor={item.speakerColor}
              captions={item.lines}
              isCurrentSpeaker={
                item.speakerId !== null && item.speakerId === activeSpeakerId
              }
            />
          )}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => {
            if (shouldAutoScrollRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            shouldAutoScrollRef.current =
              contentSize.height - layoutMeasurement.height - contentOffset.y < 96;
          }}
          scrollEventThrottle={80}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: colors.bgPrimary,
  },
  overlapBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerBg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(168, 50, 50, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
  },
  overlapDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  overlapBannerText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxWidth: 980,
    width: "100%",
    alignSelf: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  waveformBox: {
    marginBottom: 20,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyKicker: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 8,
  },
  emptyTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 23,
  },
});
