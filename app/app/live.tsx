import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
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
  } = useSession();

  const [rosterOpen, setRosterOpen] = useState(false);

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
});
