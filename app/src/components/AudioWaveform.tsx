import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radii } from "../theme";

interface AudioWaveformProps {
  isActive?: boolean;
  barCount?: number;
  height?: number;
  color?: string;
  level?: number; // 0.0 to 1.0
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive = false,
  barCount = 24,
  height = 56,
  color = colors.primary,
  level = 0,
}) => {
  const barHeights = useMemo(() => {
    const shape = [0.24, 0.38, 0.58, 0.82, 0.52, 0.34, 0.7, 0.92, 0.48, 0.3];
    const normalizedLevel = Math.max(0, Math.min(level, 1));
    return Array.from({ length: barCount }, (_, index) => {
      if (!isActive || normalizedLevel < 0.01) return 4;
      return Math.max(4, Math.round(height * normalizedLevel * shape[index % shape.length]));
    });
  }, [barCount, height, isActive, level]);

  return (
    <View style={[styles.container, { height }]}>
      {barHeights.map((h, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: isActive && level >= 0.01 ? color : colors.borderDefault,
              shadowColor: isActive ? color : "transparent",
              shadowOpacity: isActive ? 0.3 : 0,
              shadowRadius: 3,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 8,
  },
  bar: {
    width: 3.5,
    borderRadius: radii.full,
  },
});
