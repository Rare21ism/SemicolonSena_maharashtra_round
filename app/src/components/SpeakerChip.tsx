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
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgCard,
    borderRadius: radii.full,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
    gap: 7,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FBF9F5",
  },
  nameText: {
    fontSize: 12,
    fontWeight: "700",
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


