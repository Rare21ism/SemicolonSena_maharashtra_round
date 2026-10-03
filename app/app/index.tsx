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
import { useSession } from "../src/state/SessionContext";

export default function HomeScreen() {
  const router = useRouter();
  const {
    name,
    setName,
    serverUrl,
    setServerUrl,
  } = useSession();

  const [showConfig, setShowConfig] = useState(false);

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
          className="px-5 py-4 pb-12 max-w-[580px] w-full mx-auto"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Brand Header */}
          <View className="flex-row items-center justify-between mb-8" style={styles.topNav}>
            <View className="flex-row items-center gap-2.5" style={styles.brandRow}>
              <View className="w-8 h-8 rounded-lg bg-indigo-600 items-center justify-center shadow-lg" style={styles.logoBadge}>
                <Ionicons name="radio" size={18} color="#FFFFFF" />
              </View>
              <Text className="text-xl font-extrabold text-textPrimary tracking-tight" style={styles.brandTitle}>Roundtable</Text>
            </View>

          </View>

          {/* Hero Section (Section 8) */}
          <View className="items-center mb-8" style={styles.heroSection}>
            <View className="bg-indigo-500/10 border border-indigo-500/25 px-3.5 py-1 rounded-full mb-3.5" style={styles.heroTag}>
              <Text className="text-[10px] font-black text-indigo-400 tracking-widest" style={styles.heroTagText}>
                REAL-TIME MULTI-DEVICE MEETING CAPTIONS
              </Text>
            </View>

            <Text className="text-3xl font-extrabold text-center text-textPrimary leading-tight mb-3" style={styles.heroTitle}>
              Live captions that{"\n"}
              <Text className="text-indigo-400" style={styles.heroGradient}>know who's speaking.</Text>
            </Text>

            <Text className="text-sm text-center text-textMuted leading-relaxed max-w-[460px]" style={styles.heroSubtitle}>
              One conversation. Multiple devices. One clearer transcript.
              Roundtable combines audio from nearby phones and laptops to create
              low-latency, speaker-attributed subtitles for real meetings.
            </Text>
          </View>

          {/* Interactive Multi-Device Array Illustration */}
          <View className="w-full bg-bgCard border border-borderDefault rounded-2xl p-6 items-center mb-8 relative overflow-hidden" style={styles.illustrationCard}>
            <View style={styles.circleOrbitOuter}>
              <View style={styles.circleOrbitInner}>
                <View style={styles.centerTable}>
                  <Ionicons name="chatbubbles" size={24} color={colors.primaryLight} />
                  <Text style={styles.centerTableText}>FUSION</Text>
                </View>
              </View>

              {/* Surrounding Node 1: Jim */}
              <View style={[styles.nodeBubble, styles.nodeLaptop]}>
                <Ionicons name="laptop-outline" size={15} color="#8B5CF6" />
                <Text style={styles.nodeText}>Jim (Laptop)</Text>
              </View>

              {/* Surrounding Node 2: Pam */}
              <View style={[styles.nodeBubble, styles.nodePhoneA]}>
                <Ionicons name="phone-portrait-outline" size={15} color="#0284C7" />
                <Text style={styles.nodeText}>Pam (Phone)</Text>
              </View>

              {/* Surrounding Node 3: Dwight */}
              <View style={[styles.nodeBubble, styles.nodePhoneB]}>
                <Ionicons name="phone-portrait-outline" size={15} color="#10B981" />
                <Text style={styles.nodeText}>Dwight (Phone)</Text>
              </View>
            </View>

            <View style={styles.liveCaptionSnippet}>
              <View style={styles.snippetDot} />
              <Text style={styles.snippetSpeaker}>MICHAEL: </Text>
              <Text style={styles.snippetText} numberOfLines={1}>
                "HEEELOO! We are going to crush this quarter."
              </Text>
            </View>
          </View>

          {/* User Display Name & Primary Actions Card */}
          <View className="w-full bg-bgCard border border-borderDefault rounded-2xl p-6 mb-6 shadow-xl" style={styles.actionCard}>
            <Input
              label="YOUR DISPLAY NAME"
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

            <View style={styles.buttonStack}>
              <Button
                title="Create Meeting"
                variant="primary"
                size="lg"
                icon={<Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />}
                onPress={handleCreate}
              />

              <Button
                title="Join Meeting"
                variant="secondary"
                size="lg"
                icon={<Ionicons name="enter-outline" size={20} color={colors.textPrimary} />}
                onPress={handleJoin}
              />
            </View>

            {/* Server Config Toggle */}
            <TouchableOpacity
              style={styles.toggleConfig}
              onPress={() => setShowConfig(!showConfig)}
            >
              <Ionicons
                name={showConfig ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.toggleConfigText}>
                {showConfig ? "Hide server settings" : "Configure server endpoint"}
              </Text>
            </TouchableOpacity>

            {showConfig && (
              <View style={styles.configArea}>
                <Input
                  label="BACKEND URL"
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="http://localhost:8000"
                />
              </View>
            )}
          </View>

          {/* Feature Highlights Grid */}
          <View style={styles.featuresRow}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                <Ionicons name="hardware-chip-outline" size={18} color="#8B5CF6" />
              </View>
              <Text style={styles.featureTitle}>No Special Hardware</Text>
              <Text style={styles.featureDesc}>
                Uses everyday laptop and phone microphones placed on the table.
              </Text>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: "rgba(14, 165, 233, 0.15)" }]}>
                <Ionicons name="people-circle-outline" size={18} color="#0EA5E9" />
              </View>
              <Text style={styles.featureTitle}>Speaker Attributed</Text>
              <Text style={styles.featureDesc}>
                Separates simultaneous speech and attributes every sentence to who spoke it.
              </Text>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                <Ionicons name="flash-outline" size={18} color="#10B981" />
              </View>
              <Text style={styles.featureTitle}>Streaming Drafts</Text>
              <Text style={styles.featureDesc}>
                Instant partial captions stream in real time, followed by verified final text.
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 48,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  brandTitle: {
    ...typography.h3,
    letterSpacing: -0.3,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  heroTag: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    marginBottom: 12,
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  heroTitle: {
    ...typography.h1,
    textAlign: "center",
    lineHeight: 40,
    marginBottom: 12,
  },
  heroGradient: {
    color: colors.primaryLight,
  },
  heroSubtitle: {
    ...typography.body,
    textAlign: "center",
    maxWidth: 520,
    lineHeight: 24,
  },
  illustrationCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    position: "relative",
    overflow: "hidden",
  },
  circleOrbitOuter: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 12,
  },
  circleOrbitInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.35)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  centerTable: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  centerTableText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primaryLight,
    letterSpacing: 1,
  },
  nodeBubble: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    gap: 5,
  },
  nodeLaptop: {
    top: -10,
    alignSelf: "center",
  },
  nodePhoneA: {
    bottom: 20,
    left: -15,
  },
  nodePhoneB: {
    bottom: 20,
    right: -15,
  },
  nodeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  liveCaptionSnippet: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10, 15, 29, 0.9)",
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    marginTop: 8,
    maxWidth: "95%",
  },
  snippetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  snippetSpeaker: {
    fontSize: 11,
    fontWeight: "800",
    color: "#F97316",
  },
  snippetText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  actionCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: 28,
  },
  buttonStack: {
    gap: 12,
    marginTop: 14,
    marginBottom: 10,
  },
  toggleConfig: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  toggleConfigText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  configArea: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  featuresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  featureItem: {
    flex: 1,
    minWidth: 180,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
