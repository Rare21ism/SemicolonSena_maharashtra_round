import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../src/theme";
import { Button } from "../src/components/Button";
import { Input } from "../src/components/Input";
import { RoundtableSpatialMotif } from "../src/components/RoundtableSpatialMotif";
import { useSession } from "../src/state/SessionContext";

export default function HomeScreen() {
  const router = useRouter();
  const { name, setName, serverUrl, setServerUrl } = useSession();
  const [showConfig, setShowConfig] = useState(false);
  const viewportWidth = useWindowDimensions().width;
  const isWide = viewportWidth >= 900;
  const isCompact = viewportWidth < 520;

  const handleCreate = () => {
    router.push("/create");
  };

  const handleJoin = () => {
    router.push("/join");
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
            { width: Math.min(1120, viewportWidth), boxSizing: "border-box" },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Editorial Header */}
          <View
            style={[
              styles.pageGutter,
              { width: Math.max(0, Math.min(1120, viewportWidth) - 48) },
            ]}
          >
        <View style={[styles.topNav, isCompact && styles.topNavCompact]}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="mic-outline" size={18} color="#FBF9F5" />
              </View>
              <Text style={styles.brandTitle}>ROUNDTABLE</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE SPEECH TRANSCRIPTION</Text>
            </View>
          </View>

          <View style={[styles.heroRow, isWide && styles.heroRowWide]}>
            <View style={[styles.heroSection, isWide && styles.heroSectionWide]}>
              <Text style={styles.kickerLabel}>GROUP CONVERSATION CAPTIONS</Text>
              <Text
                style={[
                  styles.heroTitle,
                  isWide && styles.heroTitleWide,
                  isCompact && styles.heroTitleCompact,
                ]}
              >
                {isCompact ? (
                  <>EVERY VOICE.{"\n"}ONE{"\n"}CONVERSATION.</>
                ) : (
                  <>EVERY VOICE.{"\n"}ONE CONVERSATION.</>
                )}
              </Text>
              <Text style={styles.heroSubtitle}>
                Phones and laptops listen from around the room, bringing speech together in one shared, speaker-aware transcript.
              </Text>
            </View>

            <View style={[styles.motifContainer, isWide && styles.motifContainerWide]}>
              <RoundtableSpatialMotif />
            </View>
          </View>

          {/* Action Card: Display Name & Actions */}
          <View
            style={[
              styles.actionCard,
              { width: Math.max(0, Math.min(650, viewportWidth - 96)) },
            ]}
          >
            <Input
              label="YOUR NAME"
              placeholder="Enter your full name"
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

            <View style={styles.buttonStack}>
              <Button
                title="Start a Conversation"
                variant="primary"
                size="lg"
                icon={<Ionicons name="add" size={18} color="#FBF9F5" />}
                disabled={!name.trim()}
                onPress={handleCreate}
              />

              <Button
                title="Join a Conversation"
                variant="secondary"
                size="lg"
                icon={<Ionicons name="arrow-forward-outline" size={16} color={colors.textPrimary} />}
                onPress={handleJoin}
              />
            </View>

            {/* Server Settings Toggle (Discreet) */}
            <TouchableOpacity
              style={styles.toggleConfig}
              onPress={() => setShowConfig(!showConfig)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showConfig ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.toggleConfigText}>
                {showConfig ? "Hide server endpoint" : "Server endpoint configuration"}
              </Text>
            </TouchableOpacity>

            {showConfig && (
              <View style={styles.configArea}>
                <Input
                  label="SERVER ENDPOINT"
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="http://localhost:8000"
                />
              </View>
            )}
          </View>

          <View style={styles.storySection}>
            <Text style={styles.storyKicker}>FROM ROOM TO TRANSCRIPT</Text>
            <Text style={styles.storyTitle}>One conversation, heard together.</Text>
            <View style={[styles.steps, isWide && styles.stepsWide]}>
              <View style={styles.stepItem}>
                <Text style={styles.stepNumber}>01</Text>
                <Text style={styles.stepTitle}>Bring a device</Text>
                <Text style={styles.stepCopy}>Each person joins from a phone or laptop.</Text>
              </View>
              <View style={styles.stepItem}>
                <Text style={styles.stepNumber}>02</Text>
                <Text style={styles.stepTitle}>Let the room speak</Text>
                <Text style={styles.stepCopy}>Connected microphones contribute live audio.</Text>
              </View>
              <View style={styles.stepItem}>
                <Text style={styles.stepNumber}>03</Text>
                <Text style={styles.stepTitle}>Follow along</Text>
                <Text style={styles.stepCopy}>Speech appears as shared captions with speaker labels.</Text>
              </View>
            </View>
            <Text style={styles.useCases}>
              TEAM DISCUSSIONS <Text style={styles.useCaseDivider}>·</Text> CLASSROOMS <Text style={styles.useCaseDivider}>·</Text> GROUP STUDY
            </Text>
          </View>
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
    paddingVertical: 28,
    paddingBottom: 72,
    maxWidth: 1120,
    alignSelf: "center",
  },
  pageGutter: {
    paddingHorizontal: 24,
  },
  topNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  topNavCompact: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    maxWidth: "100%",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  heroSection: {
    alignItems: "flex-start",
    marginBottom: 24,
    width: "100%",
  },
  heroRow: {
    width: "100%",
  },
  heroRowWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 48,
    marginTop: 18,
  },
  heroSectionWide: {
    flex: 1,
    marginBottom: 0,
    width: "auto",
  },
  kickerLabel: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 8,
  },
  heroTitle: {
    ...typography.display1,
    textAlign: "left",
    marginBottom: 16,
    width: "100%",
    maxWidth: "100%",
  },
  heroTitleWide: {
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.3,
  },
  heroTitleCompact: {
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -1,
  },
  heroSubtitle: {
    ...typography.body,
    textAlign: "left",
    color: colors.textSecondary,
    maxWidth: 480,
    width: "100%",
    fontSize: 16,
    lineHeight: 25,
  },
  motifContainer: {
    paddingVertical: 12,
    marginBottom: 28,
  },
  motifContainerWide: {
    flex: 1,
    marginBottom: 0,
  },
  actionCard: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 650,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.lg,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonStack: {
    gap: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  toggleConfig: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  toggleConfigText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  configArea: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  storySection: {
    marginTop: 52,
    paddingTop: 28,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
  },
  storyKicker: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: 10,
  },
  storyTitle: {
    ...typography.h2,
    fontSize: 30,
    lineHeight: 38,
    maxWidth: 520,
    marginBottom: 26,
  },
  steps: {
    gap: 0,
  },
  stepsWide: {
    flexDirection: "row",
  },
  stepItem: {
    flex: 1,
    paddingVertical: 18,
    paddingRight: 24,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  stepNumber: {
    ...typography.code,
    color: colors.accentTerracotta,
    marginBottom: 16,
  },
  stepTitle: {
    ...typography.h3,
    marginBottom: 6,
  },
  stepCopy: {
    ...typography.body,
    maxWidth: 270,
  },
  useCases: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: 28,
    letterSpacing: 1.2,
  },
  useCaseDivider: {
    color: colors.accentTerracotta,
  },
});
