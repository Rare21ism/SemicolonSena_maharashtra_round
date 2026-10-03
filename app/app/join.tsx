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
          participantCount: info.roster.length,
        });
      } else {
        setErrorMsg("Meeting code not found. Check the code and try again.");
        setSessionPreview(null);
      }
    } catch (error) {
      setErrorMsg("Could not reach the server. Please check your connection.");
      setSessionPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (text: string) => {
    const formatted = text.toUpperCase();
    setInputCode(formatted);
    if (formatted.length === 6) {
      handleLookup(formatted);
    } else {
      setSessionPreview(null);
      setErrorMsg(null);
    }
  };

  const handleJoin = () => {
    if (inputCode.length !== 6) {
      setErrorMsg("Please enter the full 6-character room code.");
      return;
    }
    if (!name.trim()) {
      setErrorMsg("Please enter your display name.");
      return;
    }

    setSessionCode(inputCode);
    setIsHost(false);
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
              <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>JOIN CONVERSATION</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Join Card */}
          <View style={styles.card}>
            <Text style={styles.cardKicker}>ROOM CONNECTIVITY</Text>
            <Text style={styles.cardTitle}>Enter meeting code</Text>
            <Text style={styles.cardDesc}>
              Type the 6-character code provided by your session host.
            </Text>

            {/* Discrete 6-letter Box */}
            <View style={styles.codeInputWrapper}>
              <SessionCodeInput
                value={inputCode}
                onChangeText={handleCodeChange}
              />
            </View>

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primaryLight} />
                <Text style={styles.loadingText}>Locating conversation...</Text>
              </View>
            )}

            {/* Room Preview Info */}
            {sessionPreview && (
              <View style={styles.previewBox}>
                <View style={styles.previewHeader}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.success}
                  />
                  <Text style={styles.previewTitle}>
                    Room {sessionPreview.code} is ready
                  </Text>
                </View>
                <Text style={styles.previewDetailText}>
                  {sessionPreview.participantCount} {sessionPreview.participantCount === 1 ? "person" : "people"} connected
                </Text>
              </View>
            )}

            {/* Error Message */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Display Name Input */}
            <View style={styles.nameSection}>
              <Input
                label="YOUR DISPLAY NAME"
                placeholder="Enter your name"
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
              title="Join Conversation"
              variant="primary"
              size="lg"
              disabled={inputCode.length !== 6 || !name.trim()}
              icon={<Ionicons name="arrow-forward" size={18} color="#FBF9F5" />}
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
    marginBottom: 32,
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
  codeInputWrapper: {
    width: "100%",
    alignItems: "center",
    marginVertical: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 8,
    alignSelf: "center",
  },
  loadingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  previewBox: {
    width: "100%",
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "rgba(43, 97, 64, 0.2)",
    borderRadius: radii.md,
    padding: spacing.md,
    marginVertical: 12,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.success,
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
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: "rgba(168, 50, 50, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    marginVertical: 12,
    width: "100%",
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: "500",
    flex: 1,
  },
  nameSection: {
    width: "100%",
    marginTop: 8,
    marginBottom: 20,
  },
  joinBtn: {
    width: "100%",
  },
});
