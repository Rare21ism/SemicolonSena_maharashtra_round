import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "../theme";
import { ConnectionStatus } from "../net/ws";

interface ReconnectingBannerProps {
  status: ConnectionStatus;
  isBackfilling?: boolean;
  backfillSeconds?: number;
  onRetry: () => void;
  onLeave: () => void;
}

export const ReconnectingBanner: React.FC<ReconnectingBannerProps> = ({
  status,
  isBackfilling = false,
  backfillSeconds = 0,
  onRetry,
  onLeave,
}) => {
  const slideAnim = useRef(new Animated.Value(-60)).current;

  const isVisible =
    status === "reconnecting" ||
    status === "disconnected" ||
    isBackfilling;

  useEffect(() => {
    if (isVisible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, slideAnim]);

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        isBackfilling ? styles.containerBackfill : styles.containerAlert,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.leftRow}>
        {isBackfilling ? (
          <Ionicons name="sync-outline" size={18} color={colors.info} />
        ) : (
          <ActivityIndicator size="small" color={colors.warning} />
        )}

        <View style={styles.textCol}>
          <Text style={styles.title}>
            {isBackfilling
              ? "Catching up on conversation..."
              : status === "reconnecting"
              ? "Connection lost · Reconnecting..."
              : "Disconnected from session"}
          </Text>
          <Text style={styles.subtext}>
            {isBackfilling
              ? `Syncing missed audio (${backfillSeconds.toFixed(1)}s backfill)`
              : "Your session and transcript history are preserved."}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {!isBackfilling && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={onRetry}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Retry Now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.leaveBtn}
          onPress={onLeave}
          activeOpacity={0.7}
        >
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    zIndex: 100,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  containerAlert: {
    backgroundColor: "rgba(23, 23, 35, 0.95)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  containerBackfill: {
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderColor: "rgba(59, 130, 246, 0.4)",
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtext: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  leaveBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
  },
  leaveText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
