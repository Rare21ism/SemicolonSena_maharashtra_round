import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface SpeakerChipProps {
  speakerId: number | null;
  name?: string;
  color?: string;
}

export const SpeakerChip: React.FC<SpeakerChipProps> = ({
  speakerId,
  name,
  color = "#64748B",
}) => {
  const label = name
    ? name
    : speakerId !== null
    ? `Device ${speakerId}`
    : "Ambient / Unassigned";

  return (
    <View style={[styles.container, { borderColor: color }]}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarText}>
          {speakerId !== null ? `${speakerId}` : "?"}
        </Text>
      </View>
      <Text style={[styles.nameText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderWidth: 1,
    borderRadius: 14,
    paddingRight: 8,
    paddingLeft: 2,
    paddingVertical: 2,
    gap: 6,
    alignSelf: "flex-start",
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  nameText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
