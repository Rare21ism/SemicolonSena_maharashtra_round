import React, { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ConnectionBadge } from "../src/components/ConnectionBadge";
import { CaptionList } from "../src/components/CaptionList";
import { SpeakerChip } from "../src/components/SpeakerChip";
import { StatusBar } from "../src/components/StatusBar";
import { Toast } from "../src/components/Toast";
import { RosterDrawer } from "../src/components/RosterDrawer";
import { useSession } from "../src/state/SessionContext";
import { colors, radii } from "../src/theme";

export default function LiveScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const params = useLocalSearchParams<{ code?: string; name?: string }>();
  const {
    sessionCode,
    sessionName,
    name,
    status,
    roster,
    captions,
    micLevel,
    myDeviceIdx,
    activeSpeakerId,
    overlappingCount,
    isMuted,
    toggleMute,
    connectToSession,
    leaveSession,
    toastMessage,
    clearToast,
    debugInfo,
  } = useSession();

  const [rosterOpen, setRosterOpen] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(true);

  useEffect(() => {
    if (status === "disconnected") {
      connectToSession(params.code || sessionCode, params.name || name);
    }
  }, []);

  const handleLeave = () => {
    leaveSession();
    router.replace("/ended");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onDismiss={clearToast} />

      {/* Top Editorial Header */}
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.roomInfo}>
          {!compact && <Text style={styles.roomBrandLabel}>ROUNDTABLE</Text>}
          {!compact && <View style={styles.headerDivider} />}
          <Text style={styles.roomTitle} numberOfLines={1}>
            {sessionName || "Group Discussion"}
          </Text>
          {!compact && (
            <View style={styles.codeTag}>
              <Text style={styles.codeTagText}>{params.code || sessionCode}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <ConnectionBadge status={status} />

          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} activeOpacity={0.8}>
            <Text style={styles.leaveBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Spatial Participant Presence Strip */}
      <View style={styles.participantStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.participantScroll}
        >
          {roster.map((dev) => {
            const isSpeaking = dev.device_idx === activeSpeakerId;
            const isSelf = dev.device_idx === myDeviceIdx;
            return (
              <TouchableOpacity
                key={dev.device_idx}
                onPress={() => setRosterOpen(true)}
                activeOpacity={0.8}
              >
                <SpeakerChip
                  speakerId={dev.device_idx}
                  name={`${dev.name}${isSelf ? " (You)" : ""}`}
                  color={dev.color}
                  isSpeaking={isSpeaking}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Captions Transcript Area */}
      <View style={styles.captionArea}>
        <CaptionList
          captions={captions}
          roster={roster}
          activeSpeakerId={activeSpeakerId}
          overlappingCount={overlappingCount}
          micLevel={isMuted ? 0 : micLevel}
        />
      </View>

      {/* Roster Drawer Modal */}
      <RosterDrawer
        visible={rosterOpen}
        onClose={() => setRosterOpen(false)}
        roster={roster}
        myDeviceIdx={myDeviceIdx}
        activeSpeakerId={activeSpeakerId}
      />

      {/* Bottom Floating Control Bar */}
      <StatusBar
        isListening={status === "connected"}
        participantCount={roster.length}
        micLevel={micLevel}
        onOpenRoster={() => setRosterOpen(true)}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />

      {/* Diagnostics Debug Overlay */}
      <View style={styles.debugOverlay} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.debugHeader}
          onPress={() => setDebugExpanded(!debugExpanded)}
          activeOpacity={0.7}
        >
          <Text style={styles.debugHeaderTitle}>DEBUG OVERLAY</Text>
          <Text style={styles.debugToggleIcon}>{debugExpanded ? "▾" : "▸"}</Text>
        </TouchableOpacity>
        {debugExpanded && (
          <View style={styles.debugBody}>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>WS State:</Text>
              <Text style={styles.debugValue}>{debugInfo.wsStatus}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Frames Sent/s:</Text>
              <Text style={styles.debugValue}>{debugInfo.framesSentFps} fps</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Sample Rate:</Text>
              <Text style={styles.debugValue}>{debugInfo.sampleRate} Hz</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Format:</Text>
              <Text style={styles.debugValue}>{debugInfo.sampleFormat}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>First 3 capture_ts:</Text>
              <Text style={styles.debugValue}>
                {debugInfo.firstThreeCaptureTs.length > 0
                  ? debugInfo.firstThreeCaptureTs.join(", ")
                  : "waiting..."}
              </Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Clock Offset:</Text>
              <Text style={styles.debugValue}>{debugInfo.clockOffsetMs.toFixed(1)} ms</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Mic Level:</Text>
              <Text style={styles.debugValue}>{debugInfo.micLevel.toFixed(3)}</Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  headerCompact: { paddingHorizontal: 12, gap: 8 },
  roomInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  roomBrandLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 2,
  },
  headerDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.borderDefault,
  },
  roomTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    maxWidth: 360,
    flexShrink: 1,
  },
  codeTag: {
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  codeTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    fontFamily: "monospace",
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leaveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: "rgba(168, 50, 50, 0.2)",
  },
  leaveBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  participantStrip: {
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: 6,
  },
  participantScroll: {
    paddingHorizontal: 24,
    gap: 8,
    alignItems: "center",
  },
  captionArea: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: 1220,
  },
  debugOverlay: {
    position: "absolute",
    top: 68,
    right: 14,
    zIndex: 999,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: 8,
    maxWidth: 290,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  debugHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 4,
  },
  debugHeaderTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#38bdf8",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  debugToggleIcon: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
  },
  debugBody: {
    gap: 3,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  debugRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  debugLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  debugValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f8fafc",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
