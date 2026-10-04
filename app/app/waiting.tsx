import React, { useEffect, useState } from "react";
import {
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../src/theme";
import { Button } from "../src/components/Button";
import { ConnectionBadge } from "../src/components/ConnectionBadge";
import { RoundtableSpatialMotif } from "../src/components/RoundtableSpatialMotif";
import { Toast } from "../src/components/Toast";
import { useSession } from "../src/state/SessionContext";

export default function MeetingLobbyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const compactContentWidth = Math.max(280, width - 40);
  const {
    sessionCode,
    sessionName,
    isHost,
    name,
    roster,
    myDeviceIdx,
    status,
    connectToSession,
    leaveSession,
    toastMessage,
    clearToast,
  } = useSession();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (sessionCode) connectToSession(sessionCode, name);
  }, [connectToSession, name, sessionCode]);

  const handleCopyCode = () => {
    try {
      Clipboard.setString(sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // The code remains visible for manual sharing if clipboard access is unavailable.
    }
  };

  const handleEnter = () => {
    router.replace({ pathname: "/live", params: { code: sessionCode, name } });
  };

  const handleLeave = () => {
    leaveSession();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onDismiss={clearToast} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          compact && styles.scrollContentCompact,
          compact && { width: compactContentWidth, alignSelf: "center" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleLeave}
            accessibilityRole="button"
            accessibilityLabel="Leave room"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerBrand}>ROUNDTABLE</Text>
          <ConnectionBadge status={status} />
        </View>

        <View style={[styles.mainLayout, compact && styles.mainLayoutCompact, compact && { width: compactContentWidth }]}>
          <View style={[styles.roomColumn, compact && styles.roomColumnCompact]}>
            <Text style={styles.eyebrow}>{isHost ? "YOUR ROOM IS READY" : "YOU'RE IN"}</Text>
            <Text style={[styles.title, compact && styles.titleCompact, compact && { width: compactContentWidth, maxWidth: compactContentWidth }]}>
              {roster.length > 1 ? "The conversation is gathering." : "Make yourself at home."}
            </Text>
            <Text style={[styles.description, compact && { width: compactContentWidth, maxWidth: compactContentWidth }]}>
              {roster.length > 1
                ? `${roster.length} people are connected. Head into the live room whenever you're ready.`
                : "Share the room code with your group. When you're ready, enter the live room to start the transcript."}
            </Text>

            <View style={styles.roomCard}>
              <View style={styles.roomCardTop}>
                <View style={styles.roomTitleWrap}>
                  <Text style={styles.roomLabel}>ROOM</Text>
                  <Text style={styles.roomTitle} numberOfLines={2}>
                    {sessionName || "Group Discussion"}
                  </Text>
                </View>
                <View style={styles.livePresence}>
                  <View style={[styles.connectionDot, status === "connected" && styles.connectionDotOn]} />
                  <Text style={styles.livePresenceText}>{status === "connected" ? "Connected" : "Connecting"}</Text>
                </View>
              </View>

              <View style={styles.codeRow}>
                <View>
                  <Text style={styles.codeLabel}>SHARE THIS CODE</Text>
                  <Text style={styles.codeValue} accessibilityLabel={`Room code ${sessionCode}`}>
                    {sessionCode || "------"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyCode}
                  accessibilityRole="button"
                  accessibilityLabel={copied ? "Room code copied" : "Copy room code"}
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={17} color={colors.primary} />
                  <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.motifWrap}>
              <RoundtableSpatialMotif />
            </View>
          </View>

          <View style={[styles.peopleColumn, compact && styles.peopleColumnCompact]}>
            <View style={styles.peoplePanel}>
              <View style={styles.peopleHeader}>
                <View>
                  <Text style={styles.panelKicker}>ROOM PRESENCE</Text>
                  <Text style={styles.peopleTitle}>People here</Text>
                </View>
                <View style={styles.countBadge} accessibilityLabel={`${roster.length} people connected`}>
                  <Text style={styles.countText}>{roster.length}</Text>
                </View>
              </View>

              {roster.length > 0 ? (
                <View style={styles.peopleList}>
                  {roster.map((person) => {
                    const isSelf = person.device_idx === myDeviceIdx;
                    return (
                      <View key={person.device_idx} style={styles.personRow}>
                        <View style={[styles.personMark, { backgroundColor: person.color || colors.primary }]}>
                          <Text style={styles.personInitial}>{person.name.trim().charAt(0).toUpperCase() || "?"}</Text>
                        </View>
                        <View style={styles.personInfo}>
                          <Text style={styles.personName} numberOfLines={1}>{person.name}{isSelf ? " (you)" : ""}</Text>
                          <Text style={styles.personStatus}>{isSelf ? "You're connected" : "Connected"}</Text>
                        </View>
                        {isSelf && <Text style={styles.hostTag}>{isHost ? "HOST" : "YOU"}</Text>}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.peopleEmpty}>
                  <Ionicons name="people-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.peopleEmptyTitle}>Waiting for your connection</Text>
                  <Text style={styles.peopleEmptyCopy}>Your name will appear here once you're connected.</Text>
                </View>
              )}

              <View style={styles.panelDivider} />
              <Text style={styles.nextLabel}>NEXT</Text>
              <Text style={styles.nextCopy}>Settle in, then open the live transcript when your group is ready.</Text>
              <Button
                title="Enter live room"
                variant="primary"
                size="lg"
                icon={<Ionicons name="arrow-forward" size={18} color="#FBF9F5" />}
                onPress={handleEnter}
                style={styles.enterButton}
              />
              <TouchableOpacity style={styles.leaveLink} onPress={handleLeave} accessibilityRole="button">
                <Text style={styles.leaveText}>Leave room</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
    paddingHorizontal: 48,
    paddingVertical: 24,
    paddingBottom: 36,
  },
  scrollContentCompact: { width: "100%", maxWidth: "100%", alignSelf: "stretch", flexGrow: 0, flexShrink: 0, paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 28 },
  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 14,
    marginBottom: 24,
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderDefault },
  headerBrand: { ...typography.label, color: colors.primary, letterSpacing: 1.7, flex: 1 },
  mainLayout: { flex: 1, flexDirection: "row", alignItems: "center", gap: 54 },
  mainLayoutCompact: { flex: 0, flexGrow: 0, flexShrink: 0, width: "100%", flexDirection: "column", alignItems: "stretch", gap: 24 },
  roomColumn: { flex: 1.08, justifyContent: "center", paddingVertical: 12 },
  roomColumnCompact: { width: "100%", alignSelf: "stretch", flex: 0, flexGrow: 0, flexShrink: 0, paddingVertical: 0 },
  peopleColumn: { flex: 0.92, maxWidth: 490, width: "100%", alignSelf: "center" },
  peopleColumnCompact: { width: "100%", maxWidth: 560, alignSelf: "stretch", flex: 0, flexGrow: 0, flexShrink: 0 },
  eyebrow: { ...typography.label, color: colors.accentTerracotta, marginBottom: 13 },
  title: { ...typography.display1, fontSize: 48, lineHeight: 54, maxWidth: 610 },
  titleCompact: { fontSize: 39, lineHeight: 44, letterSpacing: -1.1 },
  description: { ...typography.body, fontSize: 16, lineHeight: 25, maxWidth: 560, marginTop: 14, marginBottom: 24 },
  roomCard: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.lg, padding: 18, maxWidth: 540 },
  roomCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  roomTitleWrap: { flex: 1 },
  roomLabel: { ...typography.label, fontSize: 9, marginBottom: 3 },
  roomTitle: { ...typography.h3, fontSize: 18 },
  livePresence: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: colors.bgSecondary, borderRadius: radii.full },
  connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  connectionDotOn: { backgroundColor: colors.success },
  livePresenceText: { fontSize: 11, fontWeight: "600", color: colors.textSecondary },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  codeLabel: { ...typography.label, fontSize: 9, marginBottom: 3 },
  codeValue: { ...typography.code, fontSize: 20, color: colors.textPrimary, letterSpacing: 3 },
  copyButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 42, borderRadius: radii.sm, backgroundColor: colors.bgSecondary },
  copyText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  motifWrap: { alignSelf: "flex-start", marginTop: 8 },
  peoplePanel: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.xl, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
  peopleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  panelKicker: { ...typography.label, color: colors.primaryLight, fontSize: 9, marginBottom: 4 },
  peopleTitle: { ...typography.h2, fontSize: 23, lineHeight: 29 },
  countBadge: { minWidth: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.successBg, borderWidth: 1, borderColor: "rgba(43, 97, 64, 0.2)" },
  countText: { color: colors.success, fontWeight: "800", fontSize: 13 },
  peopleList: { gap: 12 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 46 },
  personMark: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  personInitial: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  personInfo: { flex: 1 },
  personName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  personStatus: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  hostTag: { color: colors.primaryLight, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  peopleEmpty: { paddingVertical: 16, alignItems: "flex-start", gap: 5 },
  peopleEmptyTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14, marginTop: 5 },
  peopleEmptyCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  panelDivider: { height: 1, backgroundColor: colors.borderSubtle, marginTop: 18, marginBottom: 16 },
  nextLabel: { ...typography.label, fontSize: 9, color: colors.textMuted, marginBottom: 5 },
  nextCopy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  enterButton: { width: "100%" },
  leaveLink: { minHeight: 42, alignItems: "center", justifyContent: "center", marginTop: 5 },
  leaveText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
