import React, { useEffect, useState } from "react";
import {
  Platform,
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
import { AudioLevelMeter } from "../src/components/AudioLevelMeter";
import { AudioWaveform } from "../src/components/AudioWaveform";
import { useSession } from "../src/state/SessionContext";

export default function AudioSetupScreen() {
  const router = useRouter();
  const { sessionCode, sessionName } = useSession();

  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [level, setLevel] = useState<number>(0.55);
  const [quality, setQuality] = useState<"good" | "fair" | "poor">("good");
  const [selectedDevice, setSelectedDevice] = useState("Default System Microphone");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Request mic permission on Web or mock for native
  const requestPermission = async () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.mediaDevices) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasPermission(true);
        // Connect web audio meter
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length / 255;
          setLevel(Math.max(0.1, avg * 1.8));
          if (avg > 0.05) setQuality("good");
          requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (e) {
        console.warn("Permission denied or unavailable, using simulation:", e);
        setHasPermission(true);
      }
    } else {
      setHasPermission(true);
    }
  };

  // Simulate audio level activity if no real mic attached
  useEffect(() => {
    if (!hasPermission) return;
    const interval = setInterval(() => {
      setLevel((prev) => {
        const delta = (Math.random() - 0.48) * 0.2;
        return Math.min(0.85, Math.max(0.15, prev + delta));
      });
    }, 150);
    return () => clearInterval(interval);
  }, [hasPermission]);

  const handleContinue = () => {
    router.push("/enroll");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Check your microphone</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Meeting Pill */}
        <View style={styles.roomPill}>
          <Text style={styles.roomPillLabel}>MEETING</Text>
          <Text style={styles.roomPillCode}>{sessionName || "Team Discussion"}</Text>
          <Text style={styles.roomPillCodeTag}>[{sessionCode}]</Text>
        </View>

        {!hasPermission ? (
          /* Permission Request State (Section 11) */
          <View style={styles.card}>
            <View style={styles.micCircle}>
              <Ionicons name="mic-outline" size={32} color={colors.primary} />
            </View>

            <Text style={styles.cardTitle}>Check your microphone</Text>
            <Text style={styles.cardDesc}>
              Roundtable needs microphone access to identify your voice and
              generate live captions for the meeting.
            </Text>

            <Button
              title="Allow microphone"
              variant="primary"
              size="lg"
              icon={<Ionicons name="mic" size={18} color="#FFFFFF" />}
              onPress={requestPermission}
              style={styles.btnFull}
            />

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => setHasPermission(true)}
            >
              <Text style={styles.skipBtnText}>Continue with system default</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Permission Granted & Active Audio Level State (Section 11) */
          <View style={styles.card}>
            <View style={styles.readyCircle}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            </View>

            <Text style={styles.cardTitle}>Microphone ready</Text>
            <Text style={styles.cardDesc}>
              Speak normally to test your audio. Your device will contribute to
              the synchronized meeting audio array.
            </Text>

            {/* Audio Waveform Visualizer */}
            <View style={styles.waveformWrapper}>
              <AudioWaveform
                isActive={true}
                height={50}
                barCount={28}
                color={colors.primaryLight}
                level={level}
              />
            </View>

            {/* Audio Level Meter */}
            <AudioLevelMeter level={level} quality={quality} />

            {/* Selected Microphone Device */}
            <View style={styles.deviceRow}>
              <Ionicons name="hardware-chip-outline" size={16} color={colors.textMuted} />
              <Text style={styles.deviceText} numberOfLines={1}>
                {selectedDevice}
              </Text>
            </View>

            {/* Advanced Hardware Diagnostics Toggle */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Ionicons
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? "Hide audio settings" : "Advanced microphone settings"}
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.diagnosticsBox}>
                <View style={styles.diagRow}>
                  <Text style={styles.diagLabel}>Format</Text>
                  <Text style={styles.diagValue}>16-bit Int16 PCM, Mono</Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagLabel}>Sample Rate</Text>
                  <Text style={styles.diagValue}>16,000 Hz</Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagLabel}>Frame Chunk</Text>
                  <Text style={styles.diagValue}>100 ms (1,600 samples)</Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagLabel}>Hardware Processing</Text>
                  <Text style={styles.diagValue}>Raw feed, server fused</Text>
                </View>
              </View>
            )}

            {/* Continue Button */}
            <Button
              title="Continue to Voice Enrollment"
              variant="primary"
              size="lg"
              icon={<Ionicons name="arrow-forward" size={18} color="#FFFFFF" />}
              onPress={handleContinue}
              style={[styles.btnFull, { marginTop: 20 }]}
            />
          </View>
        )}
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
    maxWidth: 580,
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
  roomPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    gap: 6,
    marginBottom: 20,
  },
  roomPillLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primaryLight,
  },
  roomPillCode: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  roomPillCodeTag: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    alignItems: "center",
  },
  micCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  readyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardTitle: {
    ...typography.h2,
    textAlign: "center",
    marginBottom: 8,
  },
  cardDesc: {
    ...typography.body,
    textAlign: "center",
    color: colors.textMuted,
    marginBottom: 20,
    maxWidth: 420,
  },
  waveformWrapper: {
    width: "100%",
    backgroundColor: colors.bgInput,
    borderRadius: radii.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    marginBottom: 12,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  deviceText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 6,
  },
  advancedToggleText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  diagnosticsBox: {
    width: "100%",
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    marginTop: 4,
    gap: 8,
  },
  diagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diagLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  diagValue: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    fontFamily: "monospace",
  },
  btnFull: {
    width: "100%",
  },
  skipBtn: {
    paddingVertical: 12,
    marginTop: 4,
  },
  skipBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },
});
