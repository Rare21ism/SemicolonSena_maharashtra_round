import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";
import { ConnectionStatus } from "../net/ws";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  rttMs?: number;
  offsetMs?: number;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  rttMs,
  offsetMs,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (status === "connecting" || status === "reconnecting") {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => anim?.stop();
  }, [status, pulseAnim]);

  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return colors.success;
      case "connecting":
      case "reconnecting":
        return colors.warning;
      default:
        return colors.danger;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "connected":
        return "LIVE";
      case "connecting":
        return "CONNECTING";
      case "reconnecting":
        return "RECONNECTING";
      default:
        return "OFFLINE";
    }
  };

  const dotColor = getStatusColor();

  return (
    <View style={styles.badgeContainer}>
      <Animated.View
        style={[
          styles.statusDot,
          { backgroundColor: dotColor, opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.statusText, { color: dotColor }]}>
        {getStatusLabel()}
      </Text>
      {status === "connected" && typeof rttMs === "number" && rttMs > 0 && (
        <Text style={styles.metricsText}>
          {Math.round(rttMs)}ms
          {typeof offsetMs === "number" && Math.abs(offsetMs) > 0
            ? ` · Δ${Math.round(offsetMs)}ms`
            : ""}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(13, 19, 34, 0.85)",
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  metricsText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: "monospace",
    marginLeft: 2,
  },
});
