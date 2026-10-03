import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../theme";

interface ToastProps {
  message: string | null;
  onDismiss?: () => void;
  type?: "info" | "success" | "warning";
}

export const Toast: React.FC<ToastProps> = ({
  message,
  onDismiss,
  type = "info",
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (message) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.delay(2800),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onDismiss?.();
      });
    }
  }, [message, fadeAnim, onDismiss]);

  if (!message) return null;

  const getTypeStyle = () => {
    switch (type) {
      case "success":
        return styles.successToast;
      case "warning":
        return styles.warningToast;
      default:
        return styles.infoToast;
    }
  };

  return (
    <Animated.View style={[styles.container, getTypeStyle(), { opacity: fadeAnim }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 64,
    alignSelf: "center",
    zIndex: 99,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  infoToast: {
    backgroundColor: "rgba(19, 28, 46, 0.95)",
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  successToast: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: colors.success,
  },
  warningToast: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: colors.warning,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
});
