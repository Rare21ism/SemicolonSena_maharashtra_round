import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

interface AudioLevelMeterProps {
  level: number; // 0.0 to 1.0
  quality?: "good" | "fair" | "poor";
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({
  level,
  quality = "good",
}) => {
  const clampedLevel = Math.min(Math.max(level, 0), 1);
  const percent = Math.round(clampedLevel * 100);

  const getMeterColor = () => {
    if (clampedLevel > 0.85) return colors.danger;
    if (clampedLevel > 0.6) return colors.warning;
    return colors.success;
  };

  const getQualityLabel = () => {
    switch (quality) {
      case "good":
        return "Audio quality: Good";
      case "fair":
        return "Audio quality: Fair (Low input)";
      case "poor":
        return "Audio quality: Poor (Clipping or noisy)";
      default:
        return "Audio ready";
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>MIC INPUT LEVEL</Text>
        <Text style={styles.qualityLabel}>{getQualityLabel()}</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.max(percent, 4)}%`,
              backgroundColor: getMeterColor(),
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  qualityLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },
  track: {
    height: 8,
    backgroundColor: colors.bgInput,
    borderRadius: radii.full,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  fill: {
    height: "100%",
    borderRadius: radii.full,
  },
});
