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
    name,
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
              <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Start a conversation</Text>
            <View style={{ width: 32 }} />
          </View>

          {!created ? (
            <View style={styles.formCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="chatbubbles-outline" size={24} color={colors.primary} />
              </View>

              <Text style={styles.cardTitle}>New conversation</Text>
              <Text style={styles.cardDesc}>
                Create a room. Anyone with the code can join with their phone or laptop
                to contribute to the live transcript.
              </Text>

              <Input
                label="CONVERSATION NAME"
                placeholder="e.g. Weekly Sync"
                value={sessionName}
                onChangeText={setSessionName}
                icon={
                  <Ionicons
                    name="bookmark-outline"
                    size={18}
                    color={colors.textMuted}
                  />
                }
              />

              {error && <Text style={styles.errorText}>{error}</Text>}

              <Button
                title="Create Room"
                variant="primary"
                size="lg"
                loading={loading}
                icon={<Ionicons name="add" size={20} color="#FFFFFF" />}
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
                  Share this code with everyone participating.
                </Text>
              </View>

              {/* Next Steps Buttons */}
              <View style={styles.actionStack}>
                <Button
                  title="Check Microphone"
                  variant="primary"
                  size="lg"
                  rightIcon={
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  }
                  onPress={handleProceedToSetup}
                />

                <Button
                  title="Back"
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
  errorText: {
    color: colors.danger,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  container: {
    flex: 1,
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
  formCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    alignItems: "center",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
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
    marginBottom: 24,
    maxWidth: 400,
  },
  createBtn: {
    width: "100%",
    marginTop: 16,
  },
  shareSection: {
    gap: 16,
  },
  participantPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.full,
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
    gap: 10,
    marginTop: 8,
  },
});

