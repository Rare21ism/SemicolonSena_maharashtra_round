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
    paddingHorizontal: 18,
    borderRadius: radii.full,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  infoToast: {
    backgroundColor: colors.primary,
    borderColor: "rgba(18, 19, 18, 0.2)",
  },
  successToast: {
    backgroundColor: colors.successBg,
    borderColor: "rgba(43, 97, 64, 0.3)",
  },
  warningToast: {
    backgroundColor: colors.warningBg,
    borderColor: "rgba(154, 93, 22, 0.3)",
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FBF9F5",
    letterSpacing: 0.2,
  },
});

