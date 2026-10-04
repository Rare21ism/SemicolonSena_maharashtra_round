import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

interface RoundtableSpatialMotifProps {
  activeSpeakerIndex?: number | null;
}

export const RoundtableSpatialMotif: React.FC<RoundtableSpatialMotifProps> = ({
  activeSpeakerIndex = null,
}) => {
  const microphones = [
    { color: "#2E523F", position: styles.posTopLeft },
    { color: "#8C4B37", position: styles.posTopRight },
    { color: "#2F4356", position: styles.posBottomRight },
    { color: "#7D6628", position: styles.posBottomLeft },
  ];

  return (
    <View style={styles.container}>
      {/* Outer Spatial Boundary Orbit */}
      <View style={styles.orbitOuter}>
        {/* Subtle Middle Alignment Ring */}
        <View style={styles.orbitInner}>
          {/* Central Conversation Core */}
          <View style={styles.centerTableCore}>
            <View style={styles.centerPulseRing} />
            <Text style={styles.centerBrandLabel}>ROUNDTABLE</Text>
            <Text style={styles.centerSubLabel}>ONE CONVERSATION</Text>
          </View>
        </View>

        {/* Dynamic Speaker Nodes around the Spatial Table */}
        {microphones.map((microphone, idx) => {
          const isActive = activeSpeakerIndex === idx;
          return (
            <View key={idx} style={[styles.speakerNode, microphone.position]}>
              <View style={[styles.avatarChip, { borderColor: microphone.color }]}>
                <View
                  style={[
                    styles.nodeDot,
                    { backgroundColor: microphone.color },
                    isActive && styles.activeDot,
                  ]}
                />
                <Text style={styles.speakerNameText}>MIC</Text>
              </View>
              {isActive && (
                <View style={[styles.activeSpeakingBadge, { backgroundColor: microphone.color }]}>
                  <View style={styles.soundBar1} />
                  <View style={styles.soundBar2} />
                  <View style={styles.soundBar3} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  orbitOuter: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: "rgba(18, 19, 18, 0.08)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  orbitInner: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: "rgba(56, 73, 59, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerTableCore: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(18, 19, 18, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  centerPulseRing: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderColor: "rgba(56, 73, 59, 0.12)",
  },
  centerBrandLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1.8,
  },
  centerSubLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  speakerNode: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  posTopLeft: {
    top: 10,
    left: 10,
  },
  posTopRight: {
    top: 10,
    right: 10,
  },
  posBottomRight: {
    bottom: 10,
    right: 10,
  },
  posBottomLeft: {
    bottom: 10,
    left: 10,
  },
  avatarChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    gap: 6,
  },
  nodeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  activeDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  speakerNameText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  activeSpeakingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  soundBar1: {
    width: 2,
    height: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  },
  soundBar2: {
    width: 2,
    height: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  },
  soundBar3: {
    width: 2,
    height: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  },
});
