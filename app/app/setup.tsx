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
  const animationRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
  }, []);

  const requestPermission = async () => {
    setPermissionError(null);
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Microphone access is unavailable in this environment. Open Roundtable in a supported web browser.");
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
      setPermissionError("Microphone access is needed to hear you. Check your browser permissions and try again.");
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
          <Text style={styles.headerTitle}>Microphone Setup</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Room Pill */}
        <View style={styles.roomPill}>
          <Text style={styles.roomPillCode}>{sessionName || "Group Discussion"}</Text>
          <Text style={styles.roomPillCodeTag}>[{sessionCode}]</Text>
        </View>

        {!hasPermission ? (
          <View style={styles.card}>
            <View style={styles.micCircle}>
              <Ionicons name="mic-outline" size={28} color={colors.primary} />
            </View>

            <Text style={styles.cardTitle}>Can Roundtable hear you?</Text>
            <Text style={styles.cardDesc}>
              Allow microphone access so Roundtable can convert speech to live captions.
            </Text>

            {permissionError && <Text style={styles.permissionError}>{permissionError}</Text>}

            <Button
              title="Enable Microphone"
              variant="primary"
              size="lg"
              icon={<Ionicons name="mic" size={18} color="#FFFFFF" />}
              onPress={requestPermission}
              style={styles.btnFull}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.readyCircle}>
              <Ionicons name="checkmark" size={28} color={colors.success} />
            </View>

            <Text style={styles.cardTitle}>Microphone connected</Text>
            <Text style={styles.cardDesc}>
              Speak a few words to confirm your microphone is responding smoothly.
            </Text>

            {/* Audio Waveform Visualizer */}
            <View style={styles.waveformWrapper}>
              <AudioWaveform
                isActive={true}
                height={48}
                barCount={26}
                color={colors.primaryLight}
                level={level}
              />
            </View>

            {/* Audio Level Meter */}
            <AudioLevelMeter level={level} quality={quality} />

            {/* Continue Button */}
            <Button
              title="Continue"
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
  permissionError: {
    color: colors.danger,
    textAlign: "center",
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 48,
    maxWidth: 540,
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
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.25)",
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    gap: 6,
    marginBottom: 24,
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
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    alignItems: "center",
  },
  micCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  readyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
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
    maxWidth: 380,
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
  btnFull: {
    width: "100%",
  },
});

