import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
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
import { AudioLevelMeter } from "../src/components/AudioLevelMeter";
import { AudioWaveform } from "../src/components/AudioWaveform";
import { useSession } from "../src/state/SessionContext";

export default function AudioSetupScreen() {
  const router = useRouter();
  const { sessionCode, sessionName } = useSession();

  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [level, setLevel] = useState<number>(0);
  const [quality, setQuality] = useState<"good" | "fair" | "poor">("poor");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nativeRecorderRef = useRef<any>(null);
  const nativePollRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    if (nativePollRef.current) clearInterval(nativePollRef.current);
    try {
      nativeRecorderRef.current?.stop?.();
    } catch {}
  }, []);

  // Request and meter a real microphone stream. Permission failures stay visible.
  const requestPermission = async () => {
    setPermissionError(null);
    if (Platform.OS !== "web") {
      try {
        const {
          requestRecordingPermissionsAsync,
          setAudioModeAsync,
          AudioModule,
          RecordingPresets,
        } = await import("expo-audio");
        const res = await requestRecordingPermissionsAsync();
        if (res.granted) {
          setHasPermission(true);
          try {
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            const recorder = new (AudioModule as any).AudioRecorder({
              ...RecordingPresets.HIGH_QUALITY,
              isMeteringEnabled: true,
            });
            nativeRecorderRef.current = recorder;
            await recorder.prepareToRecordAsync();
            recorder.record();

            nativePollRef.current = setInterval(() => {
              try {
                const status = recorder.getStatus();
                if (typeof status?.metering === "number") {
                  const normalized = Math.max(0, Math.min(1, (status.metering + 55) / 45));
                  setLevel(normalized);
                  setQuality(status.metering > -38 ? "good" : status.metering > -52 ? "fair" : "poor");
                }
              } catch {}
            }, 80);
          } catch (recErr) {
            console.warn("Could not start native audio meter:", recErr);
          }
        } else {
          setPermissionError("Microphone permission was denied. Please allow microphone access in Settings.");
          setHasPermission(false);
        }
      } catch (error) {
        setPermissionError(error instanceof Error ? error.message : "Microphone permission error.");
        setHasPermission(false);
      }
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Microphone capture is unavailable in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      await audioCtx.resume();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      const muted = audioCtx.createGain();
      muted.gain.value = 0;
      source.connect(analyser);
      analyser.connect(muted);
      muted.connect(audioCtx.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (const sample of dataArray) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        setLevel(Math.min(1, rms * 4));
        setQuality(rms > 0.02 ? "good" : "poor");
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      setHasPermission(true);
      updateLevel();
    } catch (error) {
      console.warn("Microphone permission or capture failed:", error);
      setPermissionError(error instanceof Error ? error.message : "Microphone permission was denied.");
      setHasPermission(false);
    }
  };

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

            {permissionError && <Text style={styles.permissionError}>{permissionError}</Text>}
            <Button
              title="Allow microphone"
              variant="primary"
              size="lg"
              icon={<Ionicons name="mic" size={18} color="#FFFFFF" />}
              onPress={requestPermission}
              style={styles.btnFull}
            />

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
                Microphone input
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
            <Button
              title="Join Meeting Directly"
              variant="outline"
              size="md"
              icon={<Ionicons name="enter-outline" size={16} color={colors.textSecondary} />}
              onPress={() => router.push("/waiting")}
              style={[styles.btnFull, { marginTop: 10 }]}
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
  permissionError: {
    color: colors.danger,
    textAlign: "center",
    marginBottom: 12,
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
