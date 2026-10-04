import React, { useEffect, useState } from "react";
import {
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    clearToast,
  } = useSession();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (sessionCode) connectToSession(sessionCode, name);
  }, [connectToSession, name, sessionCode]);

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
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CONVERSATION LOBBY</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Room Banner */}
        <View style={styles.roomBanner}>
          <Text style={styles.bannerKicker}>ROOM READY</Text>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {sessionName || "Group Discussion"}
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
              color={copied ? colors.success : colors.textMuted}
            />
          </TouchableOpacity>

          <Text style={styles.roomNotice}>
            Place your phones or laptops on the table. Audio from all connected devices will stream into a unified live transcript.
          </Text>
        </View>

        {/* Participant Roster Section */}
        <View style={styles.rosterSection}>
          <View style={styles.rosterHeader}>
            <Text style={styles.rosterLabel}>CONNECTED PEOPLE</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {roster.length} {roster.length === 1 ? "person" : "people"}
              </Text>
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
                  statusText={isSelf ? "Microphone active" : "Connected"}
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
              title="Start Live Conversation"
              variant="primary"
              size="lg"
              icon={<Ionicons name="play" size={18} color="#FBF9F5" />}
              onPress={handleStartMeeting}
              style={styles.actionBtn}
            />
          ) : (
            <View style={styles.waitingNoticeBox}>
              <View style={styles.waitingDot} />
              <Text style={styles.waitingNoticeText}>
                Waiting for host to start conversation…
              </Text>
              <Button
                title="Enter Live View"
                variant="secondary"
                size="md"
                onPress={handleStartMeeting}
                style={{ marginTop: 14 }}
              />
            </View>
          )}

          <Button
            title="Leave Lobby"
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
    paddingHorizontal: 24,
    paddingVertical: 28,
    paddingBottom: 48,
    maxWidth: 580,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    padding: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  roomBanner: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  bannerKicker: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 4,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    gap: 10,
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  codeText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  roomNotice: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  rosterSection: {
    marginBottom: 28,
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
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "rgba(43, 97, 64, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },
  participantList: {
    gap: 8,
  },
  actionSection: {
    gap: 12,
  },
  actionBtn: {
    width: "100%",
  },
  waitingNoticeBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    alignItems: "center",
    width: "100%",
  },
  waitingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
    marginBottom: 8,
  },
  waitingNoticeText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    fontWeight: "500",
  },
});
