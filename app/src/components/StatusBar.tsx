import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "../theme";

interface StatusBarProps {
  isListening?: boolean;
  participantCount: number;
  myDeviceIdx?: number | null;
  onOpenRoster?: () => void;
  audioSyncStatus?: string;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isListening = true,
  participantCount,
  myDeviceIdx,
  onOpenRoster,
  audioSyncStatus = "Audio synchronized",
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
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
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
      {/* Listening & Mic State */}
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={styles.micBtn}
          onPress={onToggleMute}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={16}
            color={isMuted ? colors.danger : colors.success}
          />
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
            {isMuted ? "Mic muted" : "Listening · 16 kHz"}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.syncWrap}>
          <Ionicons name="git-commit-outline" size={13} color={colors.primaryLight} />
          <Text style={styles.syncText}>{audioSyncStatus}</Text>
        </View>
      </View>

      {/* Right: Roster trigger & Device idx */}
      <View style={styles.rightSection}>
        {myDeviceIdx !== null && myDeviceIdx !== undefined && (
          <View style={styles.deviceBadge}>
            <Text style={styles.deviceText}>Device #{myDeviceIdx}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.rosterBtn}
          onPress={onOpenRoster}
          activeOpacity={0.7}
        >
          <Ionicons name="people-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.rosterBtnText}>{participantCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 48,
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
    gap: 10,
  },
  micBtn: {
    padding: 6,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
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
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: colors.borderDefault,
  },
  syncWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  syncText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deviceBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  deviceText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  rosterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.bgCard,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  rosterBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
