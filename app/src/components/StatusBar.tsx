import React, { useEffect, useRef } from "react";
import {
  Animated,
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
  onToggleMute?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isListening = true,
  participantCount,
  onOpenRoster,
  isMuted = false,
  onToggleMute,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isListening && !isMuted) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => anim?.stop();
  }, [isListening, isMuted, pulseAnim]);

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
          <Animated.View
            style={[
              styles.pulseDot,
              {
                backgroundColor: isMuted ? colors.danger : colors.success,
                opacity: isMuted ? 1 : pulseAnim,
              },
            ]}
          />
          <Text style={styles.listeningText}>
            {isMuted ? "Microphone muted" : "Listening…"}
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
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    paddingHorizontal: 16,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  micBtnMuted: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  micBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
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
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  listeningText: {
    fontSize: 13,
    fontWeight: "500",
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
    backgroundColor: colors.bgCard,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  rosterBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});

