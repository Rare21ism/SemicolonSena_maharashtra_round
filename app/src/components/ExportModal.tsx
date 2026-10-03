import React, { useState } from "react";
import {
  Clipboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CaptionMessage, DeviceInfo } from "@roundtable/protocol";
import { colors, radii, spacing, typography } from "../theme";
import { Button } from "./Button";

interface ExportModalProps {
  visible: boolean;
  onClose: () => void;
  captions: CaptionMessage[];
  roster: DeviceInfo[];
  sessionCode: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  visible,
  onClose,
  captions,
  roster,
  sessionCode,
}) => {
  const [format, setFormat] = useState<"txt" | "markdown" | "json">("markdown");
  const [copied, setCopied] = useState(false);

  const speakerMap = new Map<number, string>();
  roster.forEach((d) => speakerMap.set(d.device_idx, d.name));

  const generateContent = () => {
    if (format === "json") {
      return JSON.stringify(
        {
          session: sessionCode,
          exportedAt: new Date().toISOString(),
          participants: roster,
          captions: captions.map((c) => ({
            line_id: c.line_id,
            speaker: c.speaker_id !== null ? speakerMap.get(c.speaker_id) || `Speaker ${c.speaker_id}` : "Unknown",
            text: c.text,
            t_start_ms: c.t_start,
            t_end_ms: c.t_end,
          })),
        },
        null,
        2
      );
    }

    if (format === "markdown") {
      let md = `# Roundtable Transcript — Room ${sessionCode}\n\n`;
      md += `*Exported on ${new Date().toLocaleString()}*\n\n`;
      md += `### Participants\n`;
      roster.forEach((r) => {
        md += `- **${r.name}**\n`;
      });
      md += `\n---\n\n### Transcript\n\n`;

      captions.forEach((c) => {
        const speaker =
          c.speaker_id !== null ? speakerMap.get(c.speaker_id) || `Speaker ${c.speaker_id + 1}` : "Speaker";
        const timeSec = (c.t_start / 1000).toFixed(1);
        md += `**${speaker}** \`[${timeSec}s]\`\n> ${c.text}\n\n`;
      });
      return md;
    }

    // Plain text
    let txt = `ROUNDTABLE TRANSCRIPT — ${sessionCode}\n\n`;
    captions.forEach((c) => {
      const speaker =
        c.speaker_id !== null ? speakerMap.get(c.speaker_id) || `Speaker ${c.speaker_id}` : "Unknown";
      txt += `[${(c.t_start / 1000).toFixed(1)}s] ${speaker}: ${c.text}\n`;
    });
    return txt;
  };

  const content = generateContent();

  const handleCopy = () => {
    Clipboard.setString(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const mime = format === "json" ? "application/json" : "text/plain";
      const ext = format === "json" ? "json" : format === "markdown" ? "md" : "txt";
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roundtable-${sessionCode}-transcript.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      handleCopy();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Export Transcript</Text>
              <Text style={styles.subtitle}>Session {sessionCode} · {captions.length} lines</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Format Tabs */}
          <View style={styles.tabRow}>
            {(["markdown", "txt", "json"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, format === tab && styles.tabActive]}
                onPress={() => setFormat(tab)}
              >
                <Text style={[styles.tabText, format === tab && styles.tabTextActive]}>
                  {tab.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Preview Window */}
          <View style={styles.previewBox}>
            <ScrollView style={styles.previewScroll}>
              <Text style={styles.previewCode}>{content}</Text>
            </ScrollView>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Button
              title={copied ? "Copied!" : "Copy to Clipboard"}
              variant="secondary"
              size="md"
              icon={
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={16}
                  color={copied ? colors.success : colors.textPrimary}
                />
              }
              onPress={handleCopy}
              style={styles.flexBtn}
            />
            <Button
              title="Download File"
              variant="primary"
              size="md"
              icon={<Ionicons name="download-outline" size={16} color="#FFFFFF" />}
              onPress={handleDownload}
              style={styles.flexBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    width: "100%",
    maxWidth: 580,
    maxHeight: "85%",
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  previewBox: {
    height: 220,
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  previewScroll: {
    flex: 1,
  },
  previewCode: {
    fontFamily: "monospace",
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  flexBtn: {
    flex: 1,
  },
});
