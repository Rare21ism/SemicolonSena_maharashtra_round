import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";
import { ConnectionStatus } from "../net/ws";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ status }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (status === "connecting" || status === "reconnecting") {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
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
        return "Connected";
      case "connecting":
        return "Connecting…";
      case "reconnecting":
        return "Getting you back in…";
      default:
        return "Lost connection";
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
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});


