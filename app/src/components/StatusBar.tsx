import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../theme";

interface StatusBarProps {
  isListening?: boolean;
  participantCount: number;
  onOpenRoster?: () => void;
  isMuted?: boolean;
  micLevel?: number;
  onToggleMute?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isListening = true,
  participantCount,
  onOpenRoster,
  isMuted = false,
  micLevel = 0,
  onToggleMute,
}) => {
  const voiceDetected = micLevel >= 0.025;

  return (
    <View style={styles.container}>
      {/* Mic toggle & Listening indicator */}
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={[styles.micBtn, isMuted && styles.micBtnMuted]}
          onPress={onToggleMute}
          activeOpacity={0.7}
          accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={16}
            color={isMuted ? colors.danger : colors.success}
          />
          <Text style={[styles.micBtnText, isMuted && styles.micTextMuted]}>
            {isMuted ? "Microphone off" : "Mute"}
          </Text>
        </TouchableOpacity>

        <View style={styles.listeningWrap}>
          <View
            style={[
              styles.pulseDot,
              {
                backgroundColor: isMuted
                  ? colors.danger
                  : voiceDetected
                    ? colors.success
                    : colors.textDim,
              },
            ]}
          />
          <Text style={styles.listeningText}>
            {isMuted
              ? "Microphone muted"
              : voiceDetected
                ? "Voice detected"
                : isListening
                  ? "Listening"
                  : "Connecting"}
          </Text>
        </View>
      </View>

      {/* Right: Participant toggle */}
      <View style={styles.rightSection}>
        <TouchableOpacity
          style={styles.rosterBtn}
          onPress={onOpenRoster}
          activeOpacity={0.7}
        >
          <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.rosterBtnText}>
            {participantCount} {participantCount === 1 ? "person" : "people"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 3,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "rgba(43, 97, 64, 0.2)",
  },
  micBtnMuted: {
    backgroundColor: colors.dangerBg,
    borderColor: "rgba(168, 50, 50, 0.2)",
  },
  micBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
    letterSpacing: 0.5,
  },
  micTextMuted: {
    color: colors.danger,
  },
  listeningWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listeningText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  rosterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgSecondary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  rosterBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});


