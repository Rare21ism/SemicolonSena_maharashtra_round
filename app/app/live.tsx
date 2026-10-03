import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
  const params = useLocalSearchParams<{ code?: string; name?: string }>();
  const {
    sessionCode,
    sessionName,
    name,
    status,
    roster,
    captions,
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

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.roomInfo}>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {sessionName || "Group Discussion"}
          </Text>
          <View style={styles.codeTag}>
            <Text style={styles.codeTagText}>{params.code || sessionCode}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <ConnectionBadge status={status} />

          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Participant Presence Strip */}
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
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  roomInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  roomTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    maxWidth: 200,
  },
  codeTag: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  codeTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leaveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  leaveBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  participantStrip: {
    backgroundColor: "rgba(17, 23, 38, 0.6)",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: 8,
  },
  participantScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },
  captionArea: {
    flex: 1,
    width: "100%",
  },
});

