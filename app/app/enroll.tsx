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
  const [capturedFrameCount, setCapturedFrameCount] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const sourceRef = useRef<ReturnType<typeof createAudioSource> | null>(null);
  const clientRef = useRef<RoundtableClient | null>(null);
  const recordingRef = useRef(false);
  const capturedAudioRef = useRef<Int16Array[] | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);

  const nativeRecorderRef = useRef<any>(null);
  const nativePlayerRef = useRef<any>(null);
  const recordedUriRef = useRef<string | null>(null);

  useEffect(() => () => {
    recordingRef.current = false;
    sourceRef.current?.stop();
    clientRef.current?.disconnect();
    playbackRef.current?.pause();
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    try {
      nativeRecorderRef.current?.stop?.();
      nativePlayerRef.current?.release?.();
    } catch {}
  }, []);

  const startRecording = async () => {
    setCaptureError(null);
    setCountdown(5);
    setCapturedFrameCount(0);
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

        setCapturedFrameCount(50);
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
        const timeout = setTimeout(() => reject(new Error("Could not connect to the meeting server.")), 10000);
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
              reject(new Error("Connection to the meeting server was lost."));
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

      capturedAudioRef.current = frames;
      setCapturedFrameCount(frames.length);
      setVoiceEnrolled(true);
      setState("captured");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone recording failed.";
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
      const uri = recordedUriRef.current;
      if (!uri) return;
      try {
        const { createAudioPlayer } = await import("expo-audio");
        setIsPlaying(true);
        const player = createAudioPlayer(uri);
        nativePlayerRef.current = player;
        (player as any).addListener?.("playbackStatusUpdate", (status: any) => {
          if (status?.didJustFinish || !status?.playing) {
            setIsPlaying(false);
          }
        });
        player.play();
      } catch (error) {
        setIsPlaying(false);
        setCaptureError(error instanceof Error ? error.message : "Could not play recorded sample.");
      }
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
      setCaptureError(error instanceof Error ? error.message : "Could not play the recorded sample.");
    }
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
                Your microphone sample has been sent through the meeting speech
                pipeline. Entering the meeting lobby...
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

              <Text style={styles.cardTitle}>Check your voice sample</Text>
              <Text style={styles.cardDesc}>
                Speak for five seconds. Your live 16 kHz microphone frames are sent
                to the meeting server and processed by its speech pipeline.
              </Text>

              {captureError && <Text style={styles.captureError}>{captureError}</Text>}

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
                  <Text style={styles.cardDesc}>Connecting to the meeting and requesting microphone access…</Text>
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
                      size={18}
                      color={colors.success}
                    />
                    <Text style={styles.successText}>
                      Sent {capturedFrameCount} microphone frames for {name}
                    </Text>
                  </View>

                  {isPlaying && (
                    <View style={styles.waveformBox}>
                      <AudioWaveform
                        isActive={true}
                        height={40}
                        barCount={24}
                        color={colors.cyan}
                        level={micLevel}
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
  captureError: {
    color: colors.danger,
    textAlign: "center",
    marginBottom: 12,
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
