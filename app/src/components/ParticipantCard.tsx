import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DeviceInfo } from "@roundtable/protocol";
import { colors, radii, spacing, typography } from "../theme";
import { ParticipantAvatar } from "./ParticipantAvatar";

export interface ParticipantCardProps {
  device: DeviceInfo;
  isSelf?: boolean;
  isSpeaking?: boolean;
  statusText?: string;
  connectionQuality?: "good" | "fair" | "reconnecting" | "offline";
  latencyMs?: number;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  device,
  isSelf = false,
  isSpeaking = false,
  statusText = "Ready",
  connectionQuality = "good",
  latencyMs,
}) => {
  const getQualityDot = () => {
    switch (connectionQuality) {
      case "good":
        return colors.success;
      case "fair":
        return colors.warning;
      case "reconnecting":
        return colors.warning;
      default:
        return colors.danger;
    }
  };

  const getPlatformIcon = () => {
    switch (device.platform) {
      case "ios":
      case "android":
        return "phone-portrait-outline";
      default:
        return "laptop-outline";
    }
  };

  return (
    <View
      style={[
        styles.card,
        isSpeaking && { borderColor: device.color || colors.primary },
        isSelf && styles.cardSelf,
      ]}
    >
      <View style={styles.leftRow}>
        <ParticipantAvatar
          name={device.name}
          speakerId={device.device_idx}
          color={device.color}
          isSpeaking={isSpeaking}
          size={38}
        />
        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>
              {device.name}
            </Text>
            {isSelf && (
              <View style={styles.selfBadge}>
                <Text style={styles.selfBadgeText}>YOU</Text>
              </View>
            )}
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isSpeaking ? device.color : getQualityDot() },
              ]}
            />
            <Text style={styles.statusSubtext} numberOfLines={1}>
              {isSpeaking ? "Speaking" : statusText}
            </Text>
            {latencyMs !== undefined && latencyMs > 0 && (
              <Text style={styles.latencyText}>· {Math.round(latencyMs)}ms</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.rightBadges}>
        <View style={styles.platformBadge}>
          <Ionicons
            name={getPlatformIcon() as any}
            size={13}
            color={colors.textMuted}
          />
          <Text style={styles.platformText}>
            {device.platform === "ios" || device.platform === "android"
              ? "Phone"
              : "Laptop"}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  cardSelf: {
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  infoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nameText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  selfBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  selfBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primaryLight,
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusSubtext: {
    fontSize: 12,
    color: colors.textMuted,
  },
  latencyText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  rightBadges: {
    flexDirection: "row",
    alignItems: "center",
  },
  platformBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.sm,
    gap: 4,
  },
  platformText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
});
