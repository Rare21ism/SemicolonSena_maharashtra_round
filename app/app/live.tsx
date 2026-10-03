import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ConnectionBadge } from "../src/components/ConnectionBadge";
import { CaptionList } from "../src/components/CaptionList";
import { SpeakerChip } from "../src/components/SpeakerChip";
import { StatusBar } from "../src/components/StatusBar";
import { Toast } from "../src/components/Toast";
import { useSession } from "../src/state/SessionContext";
import { colors } from "../src/theme";

export default function LiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; name?: string }>();
  const {
    sessionCode,
    sessionName,
    name,
    status,
    rttMs,
    offsetMs,
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
    // Connect once when this route is entered. Lobby navigation may have connected already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeave = () => {
    leaveSession();
    router.replace("/ended");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onDismiss={clearToast} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
        <View style={styles.meetingLabel}>
          <Text style={styles.meetingName} numberOfLines={1}>{sessionName}</Text>
          <Text style={styles.meetingCode}>{params.code || sessionCode}</Text>
        </View>
        <ConnectionBadge status={status} rttMs={rttMs} offsetMs={offsetMs} />
      </View>

      <View style={styles.rosterSection}>
        <TouchableOpacity onPress={() => setRosterOpen((open) => !open)}>
          <Text style={styles.rosterTitle}>CONNECTED DEVICES ({roster.length}) · {rosterOpen ? "hide" : "show"}</Text>
        </TouchableOpacity>
        {rosterOpen && (
          <ScrollView horizontal contentContainerStyle={styles.rosterList}>
            {roster.map((device) => (
              <SpeakerChip
                key={device.device_idx}
                speakerId={device.device_idx}
                name={`${device.name}${device.device_idx === myDeviceIdx ? " (You)" : ""}`}
                color={device.color}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.captionArea}>
        <CaptionList
          captions={captions}
          roster={roster}
          activeSpeakerId={activeSpeakerId}
          overlappingCount={overlappingCount}
        />
      </View>

      <StatusBar
        isListening={status === "connected"}
        participantCount={roster.length}
        myDeviceIdx={myDeviceIdx}
        onOpenRoster={() => setRosterOpen(true)}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  leaveButton: { paddingVertical: 8, paddingHorizontal: 10 },
  leaveText: { color: colors.textSecondary, fontWeight: "700" },
  meetingLabel: { flex: 1, paddingHorizontal: 8 },
  meetingName: { color: colors.textPrimary, fontWeight: "700" },
  meetingCode: { color: colors.textMuted, fontSize: 11, fontFamily: "monospace" },
  rosterSection: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  rosterTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  rosterList: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10 },
  captionArea: { flex: 1 },
});
