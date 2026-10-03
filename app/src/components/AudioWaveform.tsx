import React, { useEffect, useState } from "react";
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
  level = 0.5,
}) => {
  const [barHeights, setBarHeights] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 8)
  );

  useEffect(() => {
    if (!isActive) {
      setBarHeights(Array.from({ length: barCount }, () => 6));
      return;
    }

    const interval = setInterval(() => {
      setBarHeights((prev) =>
        prev.map((_, i) => {
          // Create natural bell-curve / voice frequency distribution
          const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
          const bellCurve = Math.max(0.2, 1 - centerDist * 0.7);
          const noise = 0.3 + Math.random() * 0.7;
          const target = Math.max(6, height * level * bellCurve * noise);
          return Math.min(height, Math.round(target));
        })
      );
    }, 90);

    return () => clearInterval(interval);
  }, [isActive, barCount, height, level]);

  return (
    <View style={[styles.container, { height }]}>
      {barHeights.map((h, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: isActive ? color : "rgba(255, 255, 255, 0.12)",
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
