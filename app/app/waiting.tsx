import React, { useEffect, useState } from "react";
import {
  Clipboard,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../src/theme";
import { Button } from "../src/components/Button";
import { ParticipantCard } from "../src/components/ParticipantCard";
import { Toast } from "../src/components/Toast";
import { useSession } from "../src/state/SessionContext";

export default function MeetingLobbyScreen() {
  const router = useRouter();
  const {
    sessionCode,
    sessionName,
    isHost,
    name,
    roster,
    myDeviceIdx,
    connectToSession,
    toastMessage,
    showToast,
    clearToast,
  } = useSession();

  const [copied, setCopied] = useState(false);

  // Subtle join notification toasts per Section 13
  useEffect(() => {
    const timer1 = setTimeout(() => {
      showToast("Pam joined the meeting");
    }, 1500);
    const timer2 = setTimeout(() => {
      showToast("Dwight joined the meeting");
    }, 3200);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [showToast]);

  const handleCopyCode = () => {
    Clipboard.setString(sessionCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartMeeting = () => {
    connectToSession(sessionCode, name);
    router.replace({
      pathname: "/live",
      params: { code: sessionCode, name },
    });
  };

  const handleLeave = () => {
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onDismiss={clearToast} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleLeave}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Meeting Lobby</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Meeting Banner (Section 13) */}
        <View style={styles.roomBanner}>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {sessionName || "Team Discussion"}
          </Text>

          <TouchableOpacity
            style={styles.codePill}
            onPress={handleCopyCode}
            activeOpacity={0.8}
          >
            <Text style={styles.codeLabel}>MEETING CODE</Text>
            <Text style={styles.codeText}>{sessionCode}</Text>
            <Ionicons
              name={copied ? "checkmark-circle" : "copy-outline"}
              size={16}
              color={copied ? colors.success : colors.primaryLight}
            />
          </TouchableOpacity>

          <Text style={styles.roomNotice}>
            Nearby devices on the table will automatically coordinate audio
            fusion when the conversation starts.
          </Text>
        </View>

        {/* Participant Roster Section */}
        <View style={styles.rosterSection}>
          <View style={styles.rosterHeader}>
            <Text style={styles.rosterLabel}>PARTICIPANTS</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{roster.length} Ready</Text>
            </View>
          </View>

          <View style={styles.participantList}>
            {roster.map((dev) => {
              const isSelf = dev.device_idx === myDeviceIdx;
              return (
                <ParticipantCard
                  key={dev.device_idx}
                  device={dev}
                  isSelf={isSelf}
                  statusText={isSelf ? "Microphone Ready" : "Ready"}
                  connectionQuality="good"
                />
              );
            })}
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionSection}>
          {isHost ? (
            <Button
              title="Start Meeting"
              variant="primary"
              size="lg"
              icon={<Ionicons name="play" size={18} color="#FFFFFF" />}
              onPress={handleStartMeeting}
              style={styles.actionBtn}
            />
          ) : (
            <View style={styles.waitingNoticeBox}>
              <View style={styles.waitingDot} />
              <Text style={styles.waitingNoticeText}>
                Waiting for host to start the meeting...
              </Text>
              <Button
                title="Enter Meeting Now"
                variant="secondary"
                size="md"
                onPress={handleStartMeeting}
                style={{ marginTop: 12 }}
              />
            </View>
          )}

          <Button
            title="Leave Meeting"
            variant="ghost"
            size="md"
            onPress={handleLeave}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 48,
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    padding: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  roomBanner: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: 20,
  },
  sessionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(99, 102, 241, 0.4)",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radii.full,
    gap: 8,
    marginBottom: 12,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primaryLight,
    letterSpacing: 1,
  },
  codeText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  roomNotice: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 380,
    lineHeight: 18,
  },
  rosterSection: {
    marginBottom: 24,
  },
  rosterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  rosterLabel: {
    ...typography.label,
  },
  countBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },
  participantList: {
    gap: 6,
  },
  actionSection: {
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    width: "100%",
  },
  waitingNoticeBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    alignItems: "center",
  },
  waitingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
    marginBottom: 6,
  },
  waitingNoticeText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
