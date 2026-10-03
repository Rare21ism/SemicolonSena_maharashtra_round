import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, getSpeakerColor, radii } from "../theme";

interface SpeakerChipProps {
  speakerId: number | null;
  name?: string;
  color?: string;
  isSpeaking?: boolean;
}

export const SpeakerChip: React.FC<SpeakerChipProps> = ({
  speakerId,
  name,
  color,
  isSpeaking = false,
}) => {
  const fallback = getSpeakerColor(speakerId);
  const derivedColor = color || fallback.color;
  const label = name
    ? name
    : speakerId !== null
    ? `Speaker ${speakerId + 1}`
    : "Speaker";

  const initial = label.trim().charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.container,
        isSpeaking && { borderColor: derivedColor },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: derivedColor }]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <Text style={styles.nameText} numberOfLines={1}>
        {label}
      </Text>
      {isSpeaking && (
        <View style={styles.speakingWave}>
          <View style={[styles.bar, { backgroundColor: derivedColor, height: 8 }]} />
          <View style={[styles.bar, { backgroundColor: derivedColor, height: 12 }]} />
          <View style={[styles.bar, { backgroundColor: derivedColor, height: 6 }]} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(23, 32, 51, 0.8)",
    borderRadius: radii.full,
    paddingRight: 10,
    paddingLeft: 3,
    paddingVertical: 3,
    gap: 6,
    alignSelf: "flex-start",
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  nameText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  speakingWave: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 2,
  },
  bar: {
    width: 2,
    borderRadius: 1,
  },
});

