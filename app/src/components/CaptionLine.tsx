import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CaptionMessage } from "@roundtable/protocol";
import { SpeakerChip } from "./SpeakerChip";

interface CaptionLineProps {
  caption: CaptionMessage;
  speakerName?: string;
  speakerColor?: string;
}

export const CaptionLine: React.FC<CaptionLineProps> = React.memo(
  ({ caption, speakerName, speakerColor }) => {
    const isDraft = caption.state === "draft";
    const startSec = (caption.t_start / 1000.0).toFixed(1);

    return (
      <View style={[styles.container, isDraft && styles.draftContainer]}>
        <View style={styles.header}>
          <SpeakerChip
            speakerId={caption.speaker_id}
            name={speakerName}
            color={speakerColor}
          />
          <View style={styles.metaRow}>
            {isDraft ? (
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>DRAFT rev.{caption.rev}</Text>
              </View>
            ) : (
              <Text style={styles.revText}>rev.{caption.rev}</Text>
            )}
            <Text style={styles.timeText}>{startSec}s</Text>
          </View>
        </View>

        <Text style={[styles.captionText, isDraft && styles.draftCaptionText]}>
          {caption.text}
        </Text>
      </View>
    );
  },
  (prev, next) =>
    prev.caption.line_id === next.caption.line_id &&
    prev.caption.rev === next.caption.rev &&
    prev.caption.state === next.caption.state &&
    prev.caption.text === next.caption.text &&
    prev.speakerName === next.speakerName &&
    prev.speakerColor === next.speakerColor
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  draftContainer: {
    backgroundColor: "#131C2E",
    borderColor: "rgba(148, 163, 184, 0.2)",
    borderStyle: "dashed",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  draftBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  draftBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F59E0B",
    textTransform: "uppercase",
  },
  revText: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "monospace",
  },
  timeText: {
    fontSize: 11,
    color: "#94A3B8",
    fontFamily: "monospace",
  },
  captionText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#F8FAFC",
    fontWeight: "400",
  },
  draftCaptionText: {
    color: "#94A3B8",
    fontStyle: "italic",
  },
});
