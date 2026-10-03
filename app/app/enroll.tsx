import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { Input } from "../src/components/Input";
import { AudioWaveform } from "../src/components/AudioWaveform";
import { useSession } from "../src/state/SessionContext";

export default function VoiceEnrollmentScreen() {
  const router = useRouter();
  const { name, setName, setVoiceEnrolled } = useSession();

  const [state, setState] = useState<
    "idle" | "countdown" | "recording" | "captured" | "ready"
  >("idle");
  const [countdown, setCountdown] = useState<number>(5);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // 5-second voice enrollment recording timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (state === "recording") {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer!);
            setState("captured");
            setVoiceEnrolled(true);
            return 5;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [setVoiceEnrolled, state]);

  const startRecording = () => {
    setCountdown(5);
    setState("recording");
  };

  const handlePlaySample = () => {
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 2500);
  };

  const handleProceed = () => {
    setState("ready");
    setTimeout(() => {
      router.push("/waiting");
    }, 1200);
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
          <Text style={styles.headerTitle}>Voice Enrollment</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.card}>
          {state === "ready" ? (
            /* Confirmation celebration (Section 12) */
            <View style={styles.readyCard}>
              <View style={styles.readyCircle}>
                <Ionicons name="checkmark" size={36} color={colors.success} />
              </View>
              <Text style={styles.readyTitle}>You're ready, {name}.</Text>
              <Text style={styles.readyDesc}>
                Roundtable will use your voice to attribute captions during the
                meeting. Entering meeting lobby...
              </Text>
              <ActivityIndicator
                size="small"
                color={colors.primaryLight}
                style={{ marginTop: 16 }}
              />
            </View>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Ionicons
                  name={
                    state === "recording"
                      ? "radio"
                      : state === "captured"
                      ? "sparkles"
                      : "finger-print-outline"
                  }
                  size={28}
                  color={state === "recording" ? colors.danger : colors.primary}
                />
              </View>

              <Text style={styles.cardTitle}>Let's learn your voice</Text>
              <Text style={styles.cardDesc}>
                Say your name naturally so Roundtable can recognize you during
                the conversation.
              </Text>

              {/* Natural prompt card (Section 12) */}
              <View style={styles.promptBox}>
                <Text style={styles.promptLabel}>SAY NATURALLY:</Text>
                <Text style={styles.promptText}>"My name is {name}."</Text>
              </View>

              {/* State: Idle */}
              {state === "idle" && (
                <View style={styles.actionWrap}>
                  <Button
                    title="Start 5-Second Sample"
                    variant="primary"
                    size="lg"
                    icon={<Ionicons name="mic" size={18} color="#FFFFFF" />}
                    onPress={startRecording}
                    style={styles.fullWidth}
                  />
                </View>
              )}

              {/* State: Recording */}
              {state === "recording" && (
                <View style={styles.recordingWrap}>
                  <View style={styles.countdownPill}>
                    <View style={styles.recDot} />
                    <Text style={styles.countdownText}>
                      RECORDING · {countdown}s REMAINING
                    </Text>
                  </View>

                  <View style={styles.waveformBox}>
                    <AudioWaveform
                      isActive={true}
                      height={60}
                      barCount={30}
                      color={colors.danger}
                      level={0.7}
                    />
                  </View>
                </View>
              )}

              {/* State: Captured */}
              {state === "captured" && (
                <View style={styles.capturedWrap}>
                  <View style={styles.successPill}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.success}
                    />
                    <Text style={styles.successText}>
                      Voice sample captured: {name}
                    </Text>
                  </View>

                  {isPlaying && (
                    <View style={styles.waveformBox}>
                      <AudioWaveform
                        isActive={true}
                        height={40}
                        barCount={24}
                        color={colors.cyan}
                        level={0.6}
                      />
                    </View>
                  )}

                  <View style={styles.sampleControls}>
                    <Button
                      title={isPlaying ? "Playing..." : "Play Sample"}
                      variant="secondary"
                      size="md"
                      icon={
                        <Ionicons
                          name={isPlaying ? "volume-high" : "play"}
                          size={16}
                          color={colors.textPrimary}
                        />
                      }
                      onPress={handlePlaySample}
                      disabled={isPlaying}
                      style={styles.halfBtn}
                    />

                    <Button
                      title="Record Again"
                      variant="outline"
                      size="md"
                      icon={<Ionicons name="refresh" size={16} color={colors.textSecondary} />}
                      onPress={startRecording}
                      style={styles.halfBtn}
                    />
                  </View>

                  {/* Name confirmation */}
                  <View style={styles.nameConfirmBox}>
                    <Input
                      label="NAME TO DISPLAY IN SUBTITLES"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      icon={
                        <Ionicons
                          name="person-outline"
                          size={18}
                          color={colors.textMuted}
                        />
                      }
                    />
                  </View>

                  <Button
                    title={`Continue as ${name}`}
                    variant="primary"
                    size="lg"
                    icon={<Ionicons name="arrow-forward" size={18} color="#FFFFFF" />}
                    onPress={handleProceed}
                    style={[styles.fullWidth, { marginTop: 12 }]}
                  />
                </View>
              )}
            </>
          )}
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
    maxWidth: 580,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
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
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
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
  promptBox: {
    width: "100%",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: 20,
  },
  promptLabel: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 4,
  },
  promptText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  actionWrap: {
    width: "100%",
  },
  fullWidth: {
    width: "100%",
  },
  recordingWrap: {
    width: "100%",
    alignItems: "center",
  },
  countdownPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    gap: 8,
    marginBottom: 14,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  waveformBox: {
    width: "100%",
    backgroundColor: colors.bgInput,
    borderRadius: radii.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    marginVertical: 10,
  },
  capturedWrap: {
    width: "100%",
    alignItems: "center",
  },
  successPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    gap: 8,
    marginBottom: 14,
  },
  successText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.success,
  },
  sampleControls: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 16,
  },
  halfBtn: {
    flex: 1,
  },
  nameConfirmBox: {
    width: "100%",
    marginBottom: 8,
  },
  readyCard: {
    alignItems: "center",
    paddingVertical: 24,
  },
  readyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  readyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  readyDesc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 360,
  },
});
