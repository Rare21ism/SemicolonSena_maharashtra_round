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
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Header */}
          <View style={styles.topNav}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.brandTitle}>Roundtable</Text>
            </View>
          </View>

          {/* Main Hero & Product Intent */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>
              Everyone hears the conversation.
            </Text>

            <Text style={styles.heroSubtitle}>
              Live captioning for group discussions. Roundtable uses the microphones
              in the room to stream a single, clear transcript that identifies who is speaking.
            </Text>
          </View>

          {/* Visual Motif: Circular Roundtable Table */}
          <View style={styles.tableMotifCard}>
            <View style={styles.circleTableOuter}>
              <View style={styles.circleTableInner}>
                <Ionicons name="chatbubbles-outline" size={22} color={colors.primaryLight} />
                <Text style={styles.tableCenterLabel}>ROUNDTABLE</Text>
              </View>

              {/* Speaker positions */}
              <View style={[styles.speakerNode, styles.nodeTop]}>
                <View style={[styles.nodeDot, { backgroundColor: "#A855F7" }]} />
                <Text style={styles.nodeName}>Sarah</Text>
              </View>

              <View style={[styles.speakerNode, styles.nodeLeft]}>
                <View style={[styles.nodeDot, { backgroundColor: "#38BDF8" }]} />
                <Text style={styles.nodeName}>Priya</Text>
              </View>

              <View style={[styles.speakerNode, styles.nodeRight]}>
                <View style={[styles.nodeDot, { backgroundColor: "#34D399" }]} />
                <Text style={styles.nodeName}>Alex</Text>
              </View>
            </View>
          </View>

          {/* Action Card: Display Name & Actions */}
          <View style={styles.actionCard}>
            <Input
              label="YOUR NAME"
              placeholder="Enter your name"
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
                title="Start a Conversation"
                variant="primary"
                size="lg"
                icon={<Ionicons name="add" size={20} color="#FFFFFF" />}
                onPress={handleCreate}
              />

              <Button
                title="Join a Conversation"
                variant="secondary"
                size="lg"
                icon={<Ionicons name="enter-outline" size={18} color={colors.textPrimary} />}
                onPress={handleJoin}
              />
            </View>

            {/* Server Settings Toggle (Discreet) */}
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
                {showConfig ? "Hide server settings" : "Server settings"}
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
    paddingVertical: 24,
    paddingBottom: 48,
    maxWidth: 540,
    width: "100%",
    alignSelf: "center",
  },
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  heroTitle: {
    ...typography.h1,
    textAlign: "center",
    marginBottom: 12,
  },
  heroSubtitle: {
    ...typography.body,
    textAlign: "center",
    maxWidth: 460,
    lineHeight: 24,
  },
  tableMotifCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  circleTableOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  circleTableInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tableCenterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.primaryLight,
    letterSpacing: 1,
  },
  speakerNode: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    gap: 6,
  },
  nodeTop: {
    top: -12,
    alignSelf: "center",
  },
  nodeLeft: {
    bottom: 16,
    left: -20,
  },
  nodeRight: {
    bottom: 16,
    right: -20,
  },
  nodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nodeName: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  actionCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.xl,
    padding: spacing.lg,
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
    fontWeight: "500",
  },
  configArea: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});

