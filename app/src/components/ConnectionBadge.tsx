import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ConnectionStatus } from "../net/ws";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  rttMs?: number;
  offsetMs?: number;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  rttMs,
  offsetMs,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return "#10B981"; // Emerald
      case "connecting":
      case "reconnecting":
        return "#F59E0B"; // Amber
      default:
        return "#EF4444"; // Red
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "connected":
        return "LIVE";
      case "connecting":
        return "CONNECTING...";
      case "reconnecting":
        return "RECONNECTING...";
      default:
        return "OFFLINE";
    }
  };

  const dotColor = getStatusColor();

  return (
    <View style={styles.badgeContainer}>
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.statusText, { color: dotColor }]}>{getStatusLabel()}</Text>
      {status === "connected" && typeof rttMs === "number" && rttMs > 0 && (
        <Text style={styles.metricsText}>
          {Math.round(rttMs)}ms
          {typeof offsetMs === "number" ? ` · Δ${Math.round(offsetMs)}ms` : ""}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  metricsText: {
    fontSize: 10,
    color: "#94A3B8",
    fontFamily: "monospace",
    marginLeft: 2,
  },
});
