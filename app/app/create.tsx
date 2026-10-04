import React, { useState } from "react";
import {
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../src/theme";
import { Button } from "../src/components/Button";
import { Input } from "../src/components/Input";
import { QRCodeCard } from "../src/components/QRCodeCard";
import { RoundtableSpatialMotif } from "../src/components/RoundtableSpatialMotif";
import { useSession } from "../src/state/SessionContext";

export default function CreateMeetingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const compactContentWidth = Math.max(280, width - 40);
  const {
    sessionName,
    setSessionName,
    name,
    setName,
    sessionCode,
    createSessionOnBackend,
    setIsHost,
  } = useSession();

  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Add your name so people know who's speaking.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createSessionOnBackend(sessionName.trim() || "Group Discussion");
      setIsHost(true);
      setCreated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the conversation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    try {
      Clipboard.setString(sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the room code. You can still share it manually.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollContentCompact,
            compact && { width: compactContentWidth, alignSelf: "center" },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerBrand}>ROUNDTABLE</Text>
            {!compact && <Text style={styles.headerStep}>{created ? "ROOM READY" : "NEW CONVERSATION"}</Text>}
          </View>

          <View style={[styles.mainLayout, compact && styles.mainLayoutCompact, compact && { width: compactContentWidth }]}>
            <View style={[styles.introColumn, compact && styles.introColumnCompact]}>
              <Text style={styles.eyebrow}>A BETTER WAY TO GATHER</Text>
              <Text style={[styles.title, compact && styles.titleCompact, compact && { width: compactContentWidth, maxWidth: compactContentWidth }]}>
                {created ? "Bring your people together." : "Make room for every voice."}
              </Text>
              <Text style={[styles.introCopy, compact && { width: compactContentWidth, maxWidth: compactContentWidth }]}>
                {created
                  ? "Your room is ready. Share the code, then set up your microphone to join the conversation."
                  : "Create a shared conversation. Everyone can join from the device already in their hands."}
              </Text>

              {!compact && (
                <>
                  <View style={styles.motifFrame}>
                    <RoundtableSpatialMotif />
                  </View>
                  <View style={styles.stepsRow}>
                    <View style={styles.stepItem}>
                      <Text style={styles.stepNumber}>01</Text>
                      <Text style={styles.stepLabel}>Gather</Text>
                    </View>
                    <View style={styles.stepRule} />
                    <View style={styles.stepItem}>
                      <Text style={styles.stepNumber}>02</Text>
                      <Text style={styles.stepLabel}>Connect</Text>
                    </View>
                    <View style={styles.stepRule} />
                    <View style={styles.stepItem}>
                      <Text style={styles.stepNumber}>03</Text>
                      <Text style={styles.stepLabel}>Talk</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            <View style={[styles.actionColumn, compact && styles.actionColumnCompact]}>
              {!created ? (
                <View style={styles.formPanel}>
                  <Text style={styles.formKicker}>START HERE</Text>
                  <Text style={styles.formTitle}>Create a room</Text>
                  <Text style={styles.formCopy}>Give your conversation a name and let people know who you are.</Text>

                  <View style={styles.field}>
                    <Input
                      label="ROOM NAME"
                      placeholder="e.g. Product review"
                      value={sessionName}
                      onChangeText={setSessionName}
                      autoCapitalize="sentences"
                      icon={<Ionicons name="bookmark-outline" size={16} color={colors.textMuted} />}
                    />
                  </View>
                  <View style={styles.field}>
                    <Input
                      label="YOUR NAME"
                      placeholder="How should people address you?"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      icon={<Ionicons name="person-outline" size={16} color={colors.textMuted} />}
                    />
                  </View>

                  {error && (
                    <View style={styles.errorBanner} accessibilityRole="alert">
                      <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <Button
                    title="Create room"
                    variant="primary"
                    size="lg"
                    loading={loading}
                    icon={<Ionicons name="arrow-forward" size={18} color="#FBF9F5" />}
                    onPress={handleCreate}
                    style={styles.primaryAction}
                  />
                  <Text style={styles.formFootnote}>You can invite people with a short room code.</Text>
                </View>
              ) : (
                <View style={styles.readyPanel}>
                  <View style={styles.readyHeader}>
                    <View style={styles.readyIcon}>
                      <Ionicons name="checkmark" size={18} color={colors.success} />
                    </View>
                    <View style={styles.readyTitleWrap}>
                      <Text style={styles.formKicker}>ROOM CREATED</Text>
                      <Text style={styles.formTitle} numberOfLines={1}>{sessionName || "Group Discussion"}</Text>
                    </View>
                  </View>

                  <View style={styles.codePanel}>
                    <View>
                      <Text style={styles.codeLabel}>ROOM CODE</Text>
                      <Text style={styles.codeValue} accessibilityLabel={`Room code ${sessionCode}`}>{sessionCode}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={handleCopyCode}
                      accessibilityRole="button"
                      accessibilityLabel={copied ? "Room code copied" : "Copy room code"}
                      hitSlop={8}
                    >
                      <Ionicons name={copied ? "checkmark" : "copy-outline"} size={17} color={colors.primary} />
                      <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
                    </TouchableOpacity>
                  </View>

                  <QRCodeCard code={sessionCode} sessionName={sessionName || "Group Discussion"} />

                  {error && <Text style={styles.errorText}>{error}</Text>}
                  <Button
                    title="Set up microphone"
                    variant="primary"
                    size="lg"
                    rightIcon={<Ionicons name="arrow-forward" size={18} color="#FBF9F5" />}
                    onPress={() => router.push("/setup")}
                    style={styles.primaryAction}
                  />
                  <TouchableOpacity
                    style={styles.changeNameButton}
                    onPress={() => setCreated(false)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.changeNameText}>Edit room details</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {compact && (
              <View style={styles.mobileVisual}>
                <RoundtableSpatialMotif />
                <View style={styles.stepsRow}>
                  <View style={styles.stepItem}><Text style={styles.stepNumber}>01</Text><Text style={styles.stepLabel}>Gather</Text></View>
                  <View style={styles.stepRule} />
                  <View style={styles.stepItem}><Text style={styles.stepNumber}>02</Text><Text style={styles.stepLabel}>Connect</Text></View>
                  <View style={styles.stepRule} />
                  <View style={styles.stepItem}><Text style={styles.stepNumber}>03</Text><Text style={styles.stepLabel}>Talk</Text></View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
    paddingHorizontal: 48,
    paddingVertical: 28,
    paddingBottom: 40,
  },
  scrollContentCompact: { width: "100%", maxWidth: "100%", alignSelf: "stretch", flexGrow: 0, flexShrink: 0, paddingHorizontal: 20, paddingVertical: 18 },
  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 14,
    marginBottom: 26,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  headerBrand: { ...typography.label, color: colors.primary, letterSpacing: 1.7 },
  headerStep: { ...typography.label, marginLeft: "auto", fontSize: 10 },
  mainLayout: { flex: 1, flexDirection: "row", alignItems: "center", gap: 56 },
  mainLayoutCompact: { flex: 0, flexGrow: 0, flexShrink: 0, width: "100%", flexDirection: "column", alignItems: "stretch", gap: 24 },
  introColumn: { flex: 1.1, justifyContent: "center", paddingVertical: 18 },
  introColumnCompact: { width: "100%", alignSelf: "stretch", flex: 0, flexGrow: 0, flexShrink: 0, paddingVertical: 0 },
  eyebrow: { ...typography.label, color: colors.accentTerracotta, marginBottom: 16 },
  title: { ...typography.display1, width: "100%", flexShrink: 1, maxWidth: 600 },
  titleCompact: { width: "100%", maxWidth: "100%", fontSize: 42, lineHeight: 47, letterSpacing: -1.2 },
  introCopy: { ...typography.body, width: "100%", flexShrink: 1, marginTop: 16, maxWidth: 510, fontSize: 17, lineHeight: 27 },
  motifFrame: { alignSelf: "flex-start", marginTop: 14, marginBottom: 2 },
  stepsRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 5, maxWidth: 350 },
  stepItem: { gap: 2 },
  stepNumber: { fontSize: 10, fontWeight: "800", color: colors.primaryLight, letterSpacing: 1 },
  stepLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  stepRule: { height: 1, flex: 1, backgroundColor: colors.borderDefault, maxWidth: 46 },
  actionColumn: { flex: 0.9, maxWidth: 470, width: "100%", alignSelf: "center" },
  actionColumnCompact: { flex: 0, flexGrow: 0, flexShrink: 0, width: "100%", maxWidth: 560, alignSelf: "stretch" },
  mobileVisual: { alignItems: "center", marginTop: 2 },
  formPanel: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    padding: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.045,
    shadowRadius: 18,
    elevation: 3,
  },
  formKicker: { ...typography.label, color: colors.primaryLight, marginBottom: 7 },
  formTitle: { ...typography.h2, fontSize: 24, lineHeight: 30 },
  formCopy: { ...typography.body, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 22 },
  field: { marginBottom: 14 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginBottom: 14,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "500", flex: 1 },
  primaryAction: { width: "100%", marginTop: 4 },
  formFootnote: { fontSize: 12, color: colors.textMuted, marginTop: 13, textAlign: "center" },
  readyPanel: {
    gap: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    padding: 24,
  },
  readyHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  readyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" },
  readyTitleWrap: { flex: 1 },
  codePanel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  codeLabel: { ...typography.label, fontSize: 9, marginBottom: 3 },
  codeValue: { ...typography.code, color: colors.textPrimary, fontSize: 21, letterSpacing: 3 },
  copyButton: { flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, minHeight: 42 },
  copyText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  changeNameButton: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  changeNameText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
