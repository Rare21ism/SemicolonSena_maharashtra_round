import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Input } from "../src/components/Input";
import { AudioWaveform } from "../src/components/AudioWaveform";
import { useSession } from "../src/state/SessionContext";
import { createAudioSource } from "../src/audio";
import { RoundtableClient } from "../src/net/ws";

export default function VoiceEnrollmentScreen() {
  const router = useRouter();
  const { name, setName, setVoiceEnrolled, sessionCode, serverUrl } = useSession();

  const [state, setState] = useState<
    "idle" | "connecting" | "recording" | "captured" | "ready"
  >("idle");
  const [countdown, setCountdown] = useState<number>(5);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const sourceRef = useRef<ReturnType<typeof createAudioSource> | null>(null);
  const clientRef = useRef<RoundtableClient | null>(null);
  const recordingRef = useRef(false);
  const capturedAudioRef = useRef<Int16Array[] | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const nativeRecorderRef = useRef<any>(null);
  const recordedUriRef = useRef<string | null>(null);

  useEffect(() => () => {
    recordingRef.current = false;
    sourceRef.current?.stop();
    clientRef.current?.disconnect();
    playbackRef.current?.pause();
    if (nativeRecorderRef.current) {
      try { nativeRecorderRef.current.stop(); } catch {}
    }
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
  }, []);

  const startRecording = async () => {
    setCaptureError(null);
    setCountdown(5);
    setState("connecting");

    let source: ReturnType<typeof createAudioSource> | null = null;
    const frames: Int16Array[] = [];
    let nonZeroSamples = 0;

    let effectiveUrl = (serverUrl || "").trim().replace(/\/+$/, "");
    if (!effectiveUrl || (Platform.OS !== "web" && (effectiveUrl.includes("localhost") || effectiveUrl.includes("127.0.0.1")))) {
      effectiveUrl = "http://192.168.1.3:8000";
    }

    if (Platform.OS !== "web") {
      try {
        const {
          AudioModule,
          RecordingPresets,
          setAudioModeAsync,
          requestRecordingPermissionsAsync,
        } = await import("expo-audio");
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          throw new Error("Microphone permission is required.");
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

        const recorder = new (AudioModule as any).AudioRecorder({
          ...RecordingPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        nativeRecorderRef.current = recorder;
        await recorder.prepareToRecordAsync();
        recorder.record();

        recordingRef.current = true;
        setState("recording");

        const meterInterval = setInterval(() => {
          try {
            const status = recorder.getStatus();
            if (typeof status?.metering === "number") {
              const normalized = Math.max(0, Math.min(1, (status.metering + 55) / 45));
              setMicLevel(normalized);
            }
          } catch {}
        }, 80);

        const startedAt = performance.now();
        while (performance.now() - startedAt < 5000) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          setCountdown(Math.max(0, Math.ceil(5 - (performance.now() - startedAt) / 1000)));
        }

        clearInterval(meterInterval);
        recordingRef.current = false;
        try {
          await recorder.stop();
          recordedUriRef.current = recorder.uri;
        } catch {}

        setVoiceEnrolled(true);
        setState("captured");
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Microphone recording failed.";
        setCaptureError(message);
        setState("idle");
        recordingRef.current = false;
        return;
      }
    }

    try {
      const client = await new Promise<RoundtableClient>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Could not connect to room server.")), 10000);
        const connectedClient = new RoundtableClient({
          serverUrl: effectiveUrl,
          sessionId: sessionCode,
          name,
          onJoined: () => {
            clearTimeout(timeout);
            resolve(connectedClient);
          },
          onStatusChange: (status) => {
            if (status === "reconnecting" || status === "disconnected") {
              clearTimeout(timeout);
              reject(new Error("Connection lost. Please try again."));
            }
          },
        });
        clientRef.current = connectedClient;
        connectedClient.connect();
      });

      source = createAudioSource();
      sourceRef.current = source;
      source.onChunk((pcm, captureTsMs) => {
        if (!recordingRef.current || pcm.length !== 1600) return;
        const frame = pcm.slice();
        frames.push(frame);
        for (let i = 0; i < frame.length; i++) {
          if (frame[i] !== 0) nonZeroSamples++;
        }
        clientRef.current?.sendAudioFrame(frame, captureTsMs);
        let sumSquares = 0;
        for (let i = 0; i < frame.length; i++) {
          const sample = frame[i] / 32768;
          sumSquares += sample * sample;
        }
        setMicLevel(Math.min(1, Math.sqrt(sumSquares / frame.length) * 4));
      });
      await source.start();

      recordingRef.current = true;
      setState("recording");
      const startedAt = performance.now();
      while (performance.now() - startedAt < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setCountdown(Math.max(0, Math.ceil(5 - (performance.now() - startedAt) / 1000)));
      }

      recordingRef.current = false;
      source.stop();
      sourceRef.current = null;
      source = null;
      client.disconnect();
      clientRef.current = null;

      if (frames.length < 45 || nonZeroSamples === 0) {
        throw new Error("We couldn't hear your voice. Check your microphone and try again.");
      }
      capturedAudioRef.current = frames;
      setVoiceEnrolled(true);
      setState("captured");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recording failed. Please try again.";
      setCaptureError(message);
      setState("idle");
      recordingRef.current = false;
      source?.stop();
      sourceRef.current = null;
      clientRef.current?.disconnect();
      clientRef.current = null;
    }
  };

  const handlePlaySample = async () => {
    if (Platform.OS !== "web") {
      setCaptureError("Sample playback is available in the web app only.");
      return;
    }
    const frames = capturedAudioRef.current;
    if (!frames) return;
    const sampleCount = frames.reduce((count, frame) => count + frame.length, 0);
    const wav = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(wav);
    const writeText = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeText(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    let offset = 44;
    for (const frame of frames) {
      for (let i = 0; i < frame.length; i++, offset += 2) view.setInt16(offset, frame[i], true);
    }
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    playbackUrlRef.current = url;
    const audio = new Audio(url);
    playbackRef.current = audio;
    const finishPlayback = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
      playbackUrlRef.current = null;
      playbackRef.current = null;
    };
    audio.onended = finishPlayback;
    audio.onerror = finishPlayback;
    setIsPlaying(true);
    try {
      await audio.play();
    } catch (error) {
      finishPlayback();
      setCaptureError("Could not play recorded sample.");
    }
  };

  const handleProceed = () => {
    setState("ready");
    setTimeout(() => {
      router.push("/waiting");
    }, 800);
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
          <Text style={styles.headerTitle}>VOICE SETUP</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.card}>
          {state === "ready" ? (
            <View style={styles.readyCard}>
              <View style={styles.readyCircle}>
                <Ionicons name="checkmark" size={28} color={colors.success} />
              </View>
              <Text style={styles.readyTitle}>You're set, {name}.</Text>
              <Text style={styles.readyDesc}>
                Entering the conversation room…
              </Text>
              <ActivityIndicator
                size="small"
                color={colors.primaryLight}
                style={{ marginTop: 20 }}
              />
            </View>
          ) : (
            <>
              <Text style={styles.cardKicker}>SPEAKER RECOGNITION</Text>
              <Text style={styles.cardTitle}>Let's hear your voice</Text>
              <Text style={styles.cardDesc}>
                Say a short sentence so Roundtable can attribute your speech correctly during live conversation.
              </Text>

              {captureError && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={styles.captureError}>{captureError}</Text>
                </View>
              )}

              {/* Natural sentence prompt box */}
              <View style={styles.promptBox}>
                <Text style={styles.promptLabel}>PLEASE SAY:</Text>
                <Text style={styles.promptText}>"Hello, my name is {name}."</Text>
              </View>

              {/* State: Idle */}
              {state === "idle" && (
                <View style={styles.actionWrap}>
                  <Button
                    title="Record 5-Second Sample"
                    variant="primary"
                    size="lg"
                    icon={<Ionicons name="mic" size={18} color="#FBF9F5" />}
                    onPress={startRecording}
                    style={styles.fullWidth}
                  />
                  <Button
                    title="Skip & Enter Meeting"
                    variant="outline"
                    size="md"
                    icon={<Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />}
                    onPress={handleProceed}
                    style={[styles.fullWidth, { marginTop: 10 }]}
                  />
                </View>
              )}

              {state === "connecting" && (
                <View style={styles.recordingWrap}>
                  <ActivityIndicator color={colors.primaryLight} />
                  <Text style={[styles.cardDesc, { marginTop: 10 }]}>Connecting audio stream...</Text>
                </View>
              )}

              {/* State: Recording */}
              {state === "recording" && (
                <View style={styles.recordingWrap}>
                  <View style={styles.countdownPill}>
                    <View style={styles.recDot} />
                    <Text style={styles.countdownText}>
                      LISTENING · {countdown} / 05 seconds
                    </Text>
                  </View>

                  <View style={styles.waveformBox}>
                    <AudioWaveform
                      isActive={true}
                      height={44}
                      barCount={28}
                      color={colors.danger}
                      level={micLevel}
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
                      size={16}
                      color={colors.success}
                    />
                    <Text style={styles.successText}>
                      Voice sample recorded
                    </Text>
                  </View>

                  <View style={styles.sampleControls}>
                    <Button
                      title={isPlaying ? "Playing sample..." : "Play Sample"}
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

                  {/* Display Name Input */}
                  <View style={styles.nameConfirmBox}>
                    <Input
                      label="YOUR DISPLAY NAME"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      icon={
                        <Ionicons
                          name="person-outline"
                          size={16}
                          color={colors.textMuted}
                        />
                      }
                    />
                  </View>

                  <Button
                    title="Enter Lobby"
                    variant="primary"
                    size="lg"
                    icon={<Ionicons name="arrow-forward" size={18} color="#FBF9F5" />}
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
  captureError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  promptBox: {
    width: "100%",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "flex-start",
    marginBottom: 24,
  },
  promptLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 6,
  },
  promptText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "left",
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
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: "rgba(168, 50, 50, 0.25)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    gap: 8,
    marginBottom: 16,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  waveformBox: {
    width: "100%",
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    marginVertical: 12,
  },
  capturedWrap: {
    width: "100%",
    alignItems: "flex-start",
  },
  successPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "rgba(43, 97, 64, 0.25)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    gap: 8,
    marginBottom: 16,
  },
  successText: {
    fontSize: 13,
    fontWeight: "600",
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
    marginBottom: 12,
  },
  readyCard: {
    alignItems: "center",
    paddingVertical: 28,
    width: "100%",
  },
  readyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "rgba(43, 97, 64, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  readyTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  readyDesc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
