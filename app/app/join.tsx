import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { SessionCodeInput } from "../src/components/SessionCodeInput";
import { useSession } from "../src/state/SessionContext";

export default function JoinMeetingScreen() {
  const router = useRouter();
  const {
    name,
    setName,
    setSessionCode,
    setIsHost,
    querySessionOnBackend,
  } = useSession();

  const [inputCode, setInputCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionPreview, setSessionPreview] = useState<{
    code: string;
    meetingName: string;
    hostName: string;
    participantCount: number;
  } | null>(null);

  const handleLookup = async (codeToTest: string) => {
    if (codeToTest.length !== 6) {
      setSessionPreview(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const info = await querySessionOnBackend(codeToTest);
      if (info.exists) {
        setSessionPreview({
          code: codeToTest,
          meetingName: "Team Discussion",
          hostName: info.roster[0]?.name || "Host",
          participantCount: info.roster.length,
        });
      } else {
        setErrorMsg("Meeting not found. Check the code and try again.");
        setSessionPreview(null);
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Could not reach the meeting server.");
      setSessionPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (text: string) => {
    setInputCode(text);
    if (text.length === 6) {
      handleLookup(text);
    } else {
      setSessionPreview(null);
      setErrorMsg(null);
    }
  };

  const handleJoin = () => {
    if (inputCode.length !== 6) {
      setErrorMsg("Please enter the full 6-character meeting code.");
      return;
    }
    if (!name.trim()) {
      setErrorMsg("Please enter your name.");
      return;
    }

    setSessionCode(inputCode);
    setIsHost(false);
    // Proceed to check microphone
    router.push("/setup");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
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
            <Text style={styles.headerTitle}>Join a meeting</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Join Card (Section 10) */}
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="enter-outline" size={24} color={colors.primary} />
            </View>

            <Text style={styles.cardTitle}>Enter meeting code</Text>
            <Text style={styles.cardDesc}>
              Enter the 6-character code shared by your host to join the meeting.
            </Text>

            {/* Discrete 6-letter Box */}
            <SessionCodeInput
              value={inputCode}
              onChangeText={handleCodeChange}
            />

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primaryLight} />
                <Text style={styles.loadingText}>Verifying meeting code...</Text>
              </View>
            )}

            {/* Meeting Preview Info (Section 10) */}
            {sessionPreview && (
              <View style={styles.previewBox}>
                <View style={styles.previewHeader}>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={colors.success}
                  />
                  <Text style={styles.previewTitle}>
                    {sessionPreview.meetingName}
                  </Text>
                </View>
                <View style={styles.previewDetails}>
                  <Text style={styles.previewDetailText}>
                    Hosted by{" "}
                    <Text style={styles.previewHighlight}>
                      {sessionPreview.hostName}
                    </Text>
                  </Text>
                  <Text style={styles.previewDetailText}>
                    <Text style={styles.previewHighlight}>
                      {sessionPreview.participantCount} people
                    </Text>{" "}
                    are already here.
                  </Text>
                </View>
              </View>
            )}

            {/* Error Message */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Display Name Input */}
            <View style={styles.nameSection}>
              <Input
                label="YOUR NAME"
                placeholder="e.g. Jim, Pam, Dwight"
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
              title="Join Meeting"
              variant="primary"
              size="lg"
              disabled={inputCode.length !== 6 || !name.trim()}
              icon={<Ionicons name="arrow-forward" size={18} color="#FFFFFF" />}
              onPress={handleJoin}
              style={styles.joinBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  container: {
    flex: 1,
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
    marginBottom: 24,
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
    width: 52,
    height: 52,
    borderRadius: 26,
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
    marginBottom: 16,
    maxWidth: 420,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 6,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  previewBox: {
    width: "100%",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: radii.lg,
    padding: spacing.md,
    marginVertical: 10,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.success,
  },
  previewDetails: {
    gap: 4,
  },
  previewDetailText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  previewHighlight: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    marginVertical: 8,
    width: "100%",
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: "600",
    flex: 1,
  },
  nameSection: {
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
  },
  joinBtn: {
    width: "100%",
  },
});
