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
}) => {
  const flatListRef = useRef<FlatList>(null);

  const speakerMap = new Map<number, DeviceInfo>();
  roster.forEach((dev) => speakerMap.set(dev.device_idx, dev));

  // Intelligently group consecutive caption lines by the same speaker (Section 17)
  const clusters: CaptionCluster[] = [];
  captions.forEach((cap, index) => {
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
      {/* Overlapping speech alert banner (Section 23) */}
      {overlappingCount > 1 && (
        <View style={styles.overlapBanner}>
          <View style={styles.overlapDot} />
          <Text style={styles.overlapBannerText}>
            2 speakers talking · Overlapping speech separated
          </Text>
        </View>
      )}

      {captions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.waveformBox}>
            <AudioWaveform
              isActive={true}
              height={44}
              barCount={24}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>Roundtable is listening...</Text>
          <Text style={styles.emptySubtitle}>
            Speak naturally. Live subtitles will stream here with automatic
            speaker identification.
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
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
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
  },
  overlapBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239, 68, 68, 0.35)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  overlapDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  overlapBannerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FCA5A5",
    letterSpacing: 0.2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 48,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  waveformBox: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.2)",
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 22,
  },
});
