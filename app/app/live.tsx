import React, { useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../src/theme";
import { CaptionList } from "../src/components/CaptionList";
import { ConnectionBadge } from "../src/components/ConnectionBadge";
import { EvaluationModal } from "../src/components/EvaluationModal";
import { ReconnectingBanner } from "../src/components/ReconnectingBanner";
import { RosterDrawer } from "../src/components/RosterDrawer";
import { StatusBar } from "../src/components/StatusBar";
import { Toast } from "../src/components/Toast";
import { useSession } from "../src/state/SessionContext";

export default function LiveMeetingScreen() {
  // Prevent mobile screen sleep during live meeting
  useKeepAwake();

  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    name?: string;
    demo?: string;
  }>();

  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  const {
    sessionCode,
    sessionName,
    status,
    rttMs,
    offsetMs,
    roster,
    captions,
    myDeviceIdx,
    activeSpeakerId,
    overlappingCount,
    isBackfilling,
    backfillSeconds,
    isMuted,
    toggleMute,
    toastMessage,
    clearToast,
    isDemoMode,
    startDemoMode,
    stopDemoMode,
    leaveSession,
    retryConnection,
    connectToSession,
    name,
    evalOpen,
    setEvalOpen,
  } = useSession();

  const [rosterOpen, setRosterOpen] = useState(isDesktop);

  // Auto-adapt roster layout when screen resizes
  useEffect(() => {
    setRosterOpen(isDesktop);
  }, [isDesktop]);

  // Handle direct navigation with demo param or initial connect (once on mount)
  useEffect(() => {
    if (params.demo === "true") {
      startDemoMode();
    } else {
      const codeToConnect = params.code || sessionCode;
      const nameToConnect = params.name || name || "Participant";
      if (codeToConnect) {
        connectToSession(codeToConnect, nameToConnect);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEndSession = () => {
    leaveSession();
    router.replace("/ended");
  };

  const handleToggleRoster = () => {
    setRosterOpen((prev) => !prev);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onDismiss={clearToast} />

      {/* Evaluation / Benchmarks Modal (Section 58) */}
      <EvaluationModal
        visible={evalOpen}
        onClose={() => setEvalOpen(false)}
        participantCount={roster.length}
        captionCount={captions.length}
        rttMs={rttMs}
        offsetMs={offsetMs}
      />

      {/* Floating Reconnection & Backfill Alert (Section 27) */}
      <ReconnectingBanner
        status={status}
        isBackfilling={isBackfilling}
        backfillSeconds={backfillSeconds}
        onRetry={retryConnection}
        onLeave={handleEndSession}
      />

      {/* Meeting Top Bar (Section 15 & 53) */}
      <View className="h-14 flex-row items-center justify-between px-4 bg-bgSecondary border-b border-borderDefault z-10" style={styles.topBar}>
        <View className="flex-row items-center gap-2.5" style={styles.leftControls}>
          <TouchableOpacity
            className="flex-row items-center gap-1 bg-white/5 py-1.5 px-2.5 rounded-lg border border-white/5"
            style={styles.leaveBtn}
            onPress={handleEndSession}
            activeOpacity={0.7}
          >
            <Ionicons name="exit-outline" size={15} color={colors.textSecondary} />
            <Text className="text-xs font-bold text-textSecondary" style={styles.leaveBtnText}>End</Text>
          </TouchableOpacity>

          <View style={styles.brandTitleWrap}>
            <Text className="text-sm font-extrabold text-textPrimary tracking-tight" style={styles.brandTitle}>Roundtable</Text>
          </View>

          <View className="px-2 border-l border-borderDefault max-w-[160px]" style={styles.meetingTitleWrap}>
            <Text className="text-xs font-semibold text-textSecondary" style={styles.meetingTitle} numberOfLines={1}>
              {sessionName || "Team Discussion"}
            </Text>
          </View>

          {/* Join Code Pill */}
          <View className="flex-row items-center bg-indigo-500/15 border border-indigo-500/35 rounded-full px-2.5 py-1 gap-1" style={styles.roomPill}>
            <Text className="text-[9px] font-extrabold text-indigo-400 tracking-wider" style={styles.roomLabel}>CODE</Text>
            <Text className="text-xs font-extrabold text-textPrimary tracking-widest font-mono" style={styles.roomCode}>{sessionCode}</Text>
          </View>
        </View>

        {/* Center / Right Telemetry & Controls */}
        <View className="flex-row items-center gap-2" style={styles.rightControls}>
          <ConnectionBadge status={status} rttMs={rttMs} offsetMs={offsetMs} />

          {/* Interactive Demo Mode Toggle (Section 40 & 41) */}
          <TouchableOpacity
            className="flex-row items-center gap-1.5 py-1.5 px-3 rounded-full border border-indigo-500/30 bg-indigo-500/10"
            style={[styles.demoToggle, isDemoMode && styles.demoToggleActive]}
            onPress={isDemoMode ? stopDemoMode : startDemoMode}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isDemoMode ? "refresh-outline" : "play-circle-outline"}
              size={15}
              color={isDemoMode ? colors.warning : colors.primaryLight}
            />
            <Text
              className="text-xs font-bold"
              style={[
                styles.demoToggleText,
                isDemoMode && { color: colors.warning },
              ]}
            >
              {isDemoMode ? "Replay Demo" : "Demo Mode"}
            </Text>
          </TouchableOpacity>

          {/* ML & Acoustic Diagnostics Modal Trigger (Section 58) */}
          <TouchableOpacity
            className="p-2 rounded-lg bg-white/5 border border-white/5"
            style={styles.evalBtn}
            onPress={() => setEvalOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="analytics-outline" size={17} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Participants Roster Toggle (Mobile & Desktop) */}
          <TouchableOpacity
            className="flex-row items-center gap-1 py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/5"
            style={[styles.rosterToggleBtn, rosterOpen && styles.rosterToggleActive]}
            onPress={handleToggleRoster}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people-outline"
              size={17}
              color={rosterOpen ? colors.primaryLight : colors.textSecondary}
            />
            <Text className="text-xs font-bold text-textSecondary" style={styles.rosterCount}>{roster.length}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Workspace (Split on Desktop, Full transcript on Mobile) */}
      <View className="flex-1 flex-row bg-bgPrimary" style={styles.mainLayout}>
        {/* Dominant Live Caption Area (The Hero Experience) */}
        <View className="flex-1 h-full" style={styles.captionFeedWrapper}>
          <CaptionList
            captions={captions}
            roster={roster}
            activeSpeakerId={activeSpeakerId}
            overlappingCount={overlappingCount}
          />
        </View>

        {/* Desktop Roster Side Panel */}
        {isDesktop && (
          <RosterDrawer
            visible={rosterOpen}
            onClose={() => setRosterOpen(false)}
            devices={roster}
            myDeviceIdx={myDeviceIdx}
            activeSpeakerId={activeSpeakerId}
            isMobile={false}
          />
        )}
      </View>

      {/* Mobile Bottom Sheet Roster */}
      {!isDesktop && (
        <RosterDrawer
          visible={rosterOpen}
          onClose={() => setRosterOpen(false)}
          devices={roster}
          myDeviceIdx={myDeviceIdx}
          activeSpeakerId={activeSpeakerId}
          isMobile={true}
        />
      )}

      {/* Bottom Status Bar (Section 29 & 54) */}
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
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
    zIndex: 10,
  },
  leftControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
  },
  leaveBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  brandTitleWrap: {
    display: Platform.OS === "web" ? "flex" : "none",
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  meetingTitleWrap: {
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDefault,
    maxWidth: 160,
  },
  meetingTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  roomPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderRadius: radii.full,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    gap: 5,
  },
  roomLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primaryLight,
  },
  roomCode: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textPrimary,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  rightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  demoToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.35)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.full,
  },
  demoToggleActive: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  demoToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primaryLight,
  },
  evalBtn: {
    padding: 7,
    borderRadius: radii.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  rosterToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  rosterToggleActive: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderColor: colors.primaryLight,
  },
  rosterCount: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  mainLayout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.bgPrimary,
  },
  captionFeedWrapper: {
    flex: 1,
    height: "100%",
  },
});
