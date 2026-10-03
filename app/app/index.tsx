import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:8000";

export default function JoinScreen() {
  const router = useRouter();
  const [name, setName] = useState(`Device-${Math.floor(Math.random() * 900 + 100)}`);
  const [code, setCode] = useState("");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const handleCreateSession = async () => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter a device or participant name.");
      return;
    }

    setLoading(true);
    try {
      const base = serverUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${base}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      router.push({
        pathname: "/live",
        params: {
          code: data.code,
          name: name.trim(),
          serverUrl: base,
        },
      });
    } catch (err: any) {
      Alert.alert("Connection Failed", `Could not create session: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async () => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      Alert.alert("Invalid Code", "Please enter a valid 6-letter session code.");
      return;
    }
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter a device or participant name.");
      return;
    }

    setLoading(true);
    try {
      const base = serverUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${base}/sessions/${cleanCode}`);
      if (!res.ok) {
        throw new Error(`Session ${cleanCode} not found.`);
      }

      router.push({
        pathname: "/live",
        params: {
          code: cleanCode,
          name: name.trim(),
          serverUrl: base,
        },
      });
    } catch (err: any) {
      Alert.alert("Join Failed", err.message || "Failed to reach server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>RT</Text>
            </View>
            <Text style={styles.title}>Roundtable</Text>
            <Text style={styles.subtitle}>
              Ad-Hoc Microphone Array & Live Captions
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Your Name / Device</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alice's Phone"
              placeholderTextColor="#64748B"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>START OR JOIN</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleCreateSession}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>+ Create New Session</Text>
              )}
            </TouchableOpacity>

            <View style={styles.orRow}>
              <Text style={styles.orText}>— or join existing room —</Text>
            </View>

            <Text style={styles.label}>6-Letter Room Code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="ABCDEF"
              placeholderTextColor="#64748B"
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                (!code || loading) && styles.buttonDisabled,
              ]}
              onPress={handleJoinSession}
              disabled={!code || loading}
            >
              <Text style={styles.secondaryButtonText}>Join Room</Text>
            </TouchableOpacity>

            {/* Server Config Toggle */}
            <TouchableOpacity
              style={styles.toggleConfig}
              onPress={() => setShowConfig(!showConfig)}
            >
              <Text style={styles.toggleConfigText}>
                {showConfig ? "▾ Hide Server URL" : "▸ Configure Server URL"}
              </Text>
            </TouchableOpacity>

            {showConfig && (
              <View style={styles.configContainer}>
                <Text style={styles.label}>Server Base URL</Text>
                <TextInput
                  style={[styles.input, styles.configInput]}
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
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
    backgroundColor: "#0F172A",
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  logoBadgeText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#F8FAFC",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    marginTop: 6,
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#F8FAFC",
    fontSize: 16,
    marginBottom: 16,
  },
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 6,
    fontFamily: "monospace",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 1,
  },
  primaryButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  orRow: {
    alignItems: "center",
    marginVertical: 14,
  },
  orText: {
    fontSize: 12,
    color: "#64748B",
  },
  secondaryButton: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  toggleConfig: {
    marginTop: 20,
    alignItems: "center",
  },
  toggleConfigText: {
    fontSize: 12,
    color: "#64748B",
  },
  configContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  configInput: {
    fontSize: 13,
    paddingVertical: 8,
    fontFamily: "monospace",
  },
});
