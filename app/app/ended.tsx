import React, { useState } from "react";
import {
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
import { ExportModal } from "../src/components/ExportModal";
import { useSession } from "../src/state/SessionContext";

export default function MeetingEndedScreen() {
  const router = useRouter();
  const { sessionCode, sessionName, roster, captions, startTimeMs, recordedAudioUrl } = useSession();

  const [exportOpen, setExportOpen] = useState(false);

  // Compute meeting duration
  const durationSec = Math.max(
    14,
    Math.round((Date.now() - (startTimeMs || Date.now() - 60000)) / 1000)
  );
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationFormatted =
    minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  // Count distinct speakers
  const distinctSpeakerIds = new Set(
    captions.map((c) => c.speaker_id).filter((id) => id !== null)
  );
  const speakersDetectedCount = Math.max(distinctSpeakerIds.size, roster.length);

  const handleStartNew = () => {
    router.replace("/create");
  };

  const handleReturnHome = () => {
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExportModal
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        captions={captions}
        roster={roster}
        sessionCode={sessionCode}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Badge */}
        <View style={styles.badgeWrapper}>
          <View style={styles.flagIconCircle}>
            <Ionicons name="checkmark-done" size={28} color={colors.primaryLight} />
          </View>
          <Text style={styles.endedTitle}>Conversation summary</Text>
          <Text style={styles.endedSubtitle}>
            {sessionName || "Group Discussion"} · {sessionCode}
          </Text>
        </View>

        {/* Summary Metrics Cards Grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Ionicons name="time-outline" size={20} color={colors.primaryLight} />
            <Text style={styles.metricValue}>{durationFormatted}</Text>
            <Text style={styles.metricLabel}>DURATION</Text>
          </View>

          <View style={styles.metricCard}>
            <Ionicons name="people-outline" size={20} color="#0EA5E9" />
            <Text style={styles.metricValue}>{roster.length}</Text>
            <Text style={styles.metricLabel}>PARTICIPANTS</Text>
          </View>

          <View style={styles.metricCard}>
            <Ionicons name="document-text-outline" size={20} color="#10B981" />
            <Text style={styles.metricValue}>{captions.length}</Text>
            <Text style={styles.metricLabel}>LINES CAPTURED</Text>
          </View>

          <View style={styles.metricCard}>
            <Ionicons name="mic-outline" size={20} color="#FB923C" />
            <Text style={styles.metricValue}>{speakersDetectedCount}</Text>
            <Text style={styles.metricLabel}>SPEAKERS</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionStack}>
          {recordedAudioUrl && (
            <Button
              title="Play Recorded Audio"
              variant="secondary"
              size="lg"
              icon={<Ionicons name="play-circle-outline" size={18} color={colors.primaryLight} />}
              onPress={() => {
                if (typeof Audio !== "undefined") {
                  const audio = new Audio(recordedAudioUrl);
                  audio.play().catch(() => {});
                }
              }}
              style={styles.btnFull}
            />
          )}

          <Button
            title="Export Transcript"
            variant="primary"
            size="lg"
            icon={<Ionicons name="download-outline" size={18} color="#FFFFFF" />}
            onPress={() => setExportOpen(true)}
            style={styles.btnFull}
          />

          <Button
            title="Start New Conversation"
            variant="secondary"
            size="lg"
            icon={<Ionicons name="add" size={18} color={colors.textPrimary} />}
            onPress={handleStartNew}
            style={styles.btnFull}
          />

          <Button
            title="Return Home"
            variant="ghost"
            size="md"
            onPress={handleReturnHome}
            style={styles.btnFull}
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
    paddingVertical: 24,
    paddingBottom: 48,
    maxWidth: 580,
    width: "100%",
    alignSelf: "center",
  },
  badgeWrapper: {
    alignItems: "center",
    marginBottom: 28,
  },
  flagIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  endedTitle: {
    ...typography.h2,
    textAlign: "center",
    marginBottom: 6,
  },
  endedSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  metricCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginVertical: 4,
    textAlign: "center",
  },
  metricLabel: {
    ...typography.label,
    fontSize: 10,
  },
  actionStack: {
    gap: 12,
  },
  btnFull: {
    width: "100%",
  },
});

