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
        {/* Editorial Summary Header */}
        <View style={styles.badgeWrapper}>
          <Text style={styles.kickerLabel}>CONVERSATION COMPLETED</Text>
          <Text style={styles.endedTitle}>Summary & Record</Text>
          <Text style={styles.endedSubtitle}>
            {sessionName || "Group Discussion"} · Meeting Code: {sessionCode}
          </Text>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>DURATION</Text>
            <Text style={styles.metricValue}>{durationFormatted}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>PARTICIPANTS</Text>
            <Text style={styles.metricValue}>{roster.length}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>TRANSCRIPT LINES</Text>
            <Text style={styles.metricValue}>{captions.length}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>SPEAKERS IDENTIFIED</Text>
            <Text style={styles.metricValue}>{speakersDetectedCount}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionStack}>
          {recordedAudioUrl && (
            <Button
              title="Play Recorded Session Audio"
              variant="secondary"
              size="lg"
              icon={<Ionicons name="play-circle-outline" size={18} color={colors.textPrimary} />}
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
            title="Export Live Transcript"
            variant="primary"
            size="lg"
            icon={<Ionicons name="download-outline" size={18} color="#FBF9F5" />}
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
            title="Return to Home"
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
    paddingHorizontal: 24,
    paddingVertical: 28,
    paddingBottom: 48,
    maxWidth: 580,
    width: "100%",
    alignSelf: "center",
  },
  badgeWrapper: {
    alignItems: "flex-start",
    marginBottom: 32,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  kickerLabel: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 6,
  },
  endedTitle: {
    ...typography.display1,
    textAlign: "left",
    marginBottom: 6,
  },
  endedSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "left",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 32,
  },
  metricCard: {
    flex: 1,
    minWidth: 124,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  metricLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  actionStack: {
    gap: 12,
  },
  btnFull: {
    width: "100%",
  },
});
