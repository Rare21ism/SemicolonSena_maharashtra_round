import React, { useState } from "react";
import {
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
import { QRCodeCard } from "../src/components/QRCodeCard";
import { useSession } from "../src/state/SessionContext";

export default function CreateMeetingScreen() {
  const router = useRouter();
  const {
    sessionName,
    setSessionName,
    sessionCode,
    createSessionOnBackend,
    setIsHost,
  } = useSession();

  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await createSessionOnBackend(sessionName || "Group Discussion");
      setIsHost(true);
      setCreated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the conversation.");
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToSetup = () => {
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
            <Text style={styles.headerTitle}>START CONVERSATION</Text>
            <View style={{ width: 32 }} />
          </View>

          {!created ? (
            <View style={styles.formCard}>
              <Text style={styles.cardKicker}>STEP 1 OF 2</Text>
              <Text style={styles.cardTitle}>Name your room</Text>
              <Text style={styles.cardDesc}>
                Create a space for your group. Participants can join with their phone or laptop to share room audio.
              </Text>

              <View style={styles.inputWrapper}>
                <Input
                  label="CONVERSATION NAME"
                  placeholder="e.g. Product Strategy Review"
                  value={sessionName}
                  onChangeText={setSessionName}
                  icon={
                    <Ionicons
                      name="bookmark-outline"
                      size={16}
                      color={colors.textMuted}
                    />
                  }
                />
              </View>

              {error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                title="Create Meeting Code"
                variant="primary"
                size="lg"
                loading={loading}
                icon={<Ionicons name="add" size={18} color="#FBF9F5" />}
                onPress={handleCreate}
                style={styles.createBtn}
              />
            </View>
          ) : (
            <View style={styles.shareSection}>
              {/* QR Code and Code Card */}
              <QRCodeCard
                code={sessionCode}
                sessionName={sessionName || "Group Discussion"}
              />

              <View style={styles.participantPill}>
                <View style={styles.onlineDot} />
                <Text style={styles.participantText}>
                  Share this 6-character code with everyone in the room.
                </Text>
              </View>

              {/* Next Steps Buttons */}
              <View style={styles.actionStack}>
                <Button
                  title="Set Up Microphone"
                  variant="primary"
                  size="lg"
                  rightIcon={
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FBF9F5"
                    />
                  }
                  onPress={handleProceedToSetup}
                />

                <Button
                  title="Change Meeting Name"
                  variant="ghost"
                  size="md"
                  onPress={() => setCreated(false)}
                />
              </View>
            </View>
          )}
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
  formCard: {
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
    marginBottom: 24,
    lineHeight: 23,
  },
  inputWrapper: {
    width: "100%",
    marginBottom: 16,
  },
  errorBanner: {
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
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  createBtn: {
    width: "100%",
  },
  shareSection: {
    gap: 16,
  },
  participantPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: "rgba(43, 97, 64, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    gap: 8,
    alignSelf: "center",
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  participantText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.success,
  },
  actionStack: {
    gap: 12,
    marginTop: 8,
  },
});
