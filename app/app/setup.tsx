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
      console.warn("Microphone permission failed:", error);
      setPermissionError("Microphone access is needed to capture room speech. Check browser permissions and try again.");
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
            <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MICROPHONE SETUP</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Room Pill */}
        <View style={styles.roomPill}>
          <Text style={styles.roomPillCode}>{sessionName || "Group Discussion"}</Text>
          <Text style={styles.roomPillCodeTag}>[{sessionCode}]</Text>
        </View>

        {!hasPermission ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>AUDIO INPUT CHECK</Text>
            <Text style={styles.cardTitle}>Can Roundtable hear you?</Text>
            <Text style={styles.cardDesc}>
              Allow microphone access so Roundtable can convert spoken words into live captions.
            </Text>

            {permissionError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.permissionError}>{permissionError}</Text>
              </View>
            )}

            <Button
              title="Enable Microphone"
              variant="primary"
              size="lg"
              icon={<Ionicons name="mic" size={18} color="#FBF9F5" />}
              onPress={requestPermission}
              style={styles.btnFull}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.readyHeader}>
              <View style={styles.readyDot} />
              <Text style={styles.cardKicker}>MICROPHONE ACTIVE</Text>
            </View>

            <Text style={styles.cardTitle}>Microphone connected</Text>
            <Text style={styles.cardDesc}>
              Speak a few words to confirm your voice is being captured clearly.
            </Text>

            {/* Restrained Audio Waveform Visualizer */}
            <View style={styles.waveformWrapper}>
              <AudioWaveform
                isActive={true}
                height={40}
                barCount={28}
                color={colors.primaryLight}
                level={level}
              />
            </View>

            {/* Audio Level Meter */}
            <AudioLevelMeter level={level} quality={quality} />

            {/* Continue Button */}
            <Button
              title="Continue to Voice Setup"
              variant="primary"
              size="lg"
              rightIcon={<Ionicons name="arrow-forward" size={18} color="#FBF9F5" />}
              onPress={handleContinue}
              style={[styles.btnFull, { marginTop: 24 }]}
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    paddingBottom: 48,
    maxWidth: 540,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
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
  roomPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    gap: 8,
    marginBottom: 28,
  },
  roomPillCode: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  roomPillCodeTag: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardKicker: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 6,
  },
  readyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  cardTitle: {
    ...typography.h1,
    textAlign: "left",
    marginBottom: 8,
  },
  cardDesc: {
    ...typography.body,
    textAlign: "left",
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 23,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginBottom: 16,
    width: "100%",
  },
  permissionError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  waveformWrapper: {
    width: "100%",
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    marginBottom: 16,
  },
  btnFull: {
    width: "100%",
  },
});
