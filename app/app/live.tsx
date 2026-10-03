import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { CaptionMessage, DeviceInfo } from "@roundtable/protocol";

import { createAudioSource } from "../src/audio";
import { CaptionLine } from "../src/components/CaptionLine";
import { ConnectionBadge } from "../src/components/ConnectionBadge";
import { SpeakerChip } from "../src/components/SpeakerChip";
import { ConnectionStatus, RoundtableClient } from "../src/net/ws";

export default function LiveScreen() {
  // Prevent screen sleep during live session
  useKeepAwake();

  const router = useRouter();
  const params = useLocalSearchParams<{
    code: string;
    name: string;
    serverUrl?: string;
  }>();

  const code = (params.code || "ROOM").toUpperCase();
  const name = params.name || "Participant";
  const serverUrl =
    params.serverUrl ||
    process.env.EXPO_PUBLIC_SERVER_URL ||
    "http://localhost:8000";

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [rttMs, setRttMs] = useState<number | undefined>(undefined);
  const [offsetMs, setOffsetMs] = useState<number | undefined>(undefined);
  const [myDeviceIdx, setMyDeviceIdx] = useState<number | null>(null);
  const [roster, setRoster] = useState<DeviceInfo[]>([]);
  const [captions, setCaptions] = useState<CaptionMessage[]>([]);

  const clientRef = useRef<RoundtableClient | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // 1. Initialize client
    const client = new RoundtableClient({
      serverUrl,
      sessionId: code,
      name,
      onStatusChange: (newStatus) => setStatus(newStatus),
      onJoined: (msg) => setMyDeviceIdx(msg.device_idx),
      onClockSync: (offset, rtt) => {
        setOffsetMs(offset);
        setRttMs(rtt);
      },
      onRoster: (devices) => setRoster(devices),
      onCaption: (caption) => {
        setCaptions((prev) => {
          const index = prev.findIndex((c) => c.line_id === caption.line_id);
          if (index !== -1) {
            // Update existing line
            const updated = [...prev];
            updated[index] = caption;
            return updated;
          } else {
            // Append new line
            return [...prev, caption];
          }
        });
      },
    });

    clientRef.current = client;
    client.connect();

    // 2. Initialize audio capture
    const audioSource = createAudioSource();
    audioSource.onChunk((pcm, ts) => {
      client.sendAudioFrame(pcm, ts);
    });
    audioSource.start().catch((err) => {
      console.warn("Failed to start audio source:", err);
    });

    return () => {
      audioSource.stop();
      client.disconnect();
    };
  }, [code, name, serverUrl]);

  // Helper map for speaker info lookup
  const speakerMap = new Map<number, DeviceInfo>();
  roster.forEach((dev) => speakerMap.set(dev.device_idx, dev));

  const handleLeave = () => {
    clientRef.current?.disconnect();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
            <Text style={styles.leaveButtonText}>← Leave</Text>
          </TouchableOpacity>
          <View style={styles.codePill}>
            <Text style={styles.codePillLabel}>ROOM</Text>
            <Text style={styles.codePillText}>{code}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <ConnectionBadge status={status} rttMs={rttMs} offsetMs={offsetMs} />
        </View>
      </View>

      {/* Connected Roster Bar */}
      <View style={styles.rosterContainer}>
        <Text style={styles.rosterTitle}>
          ACTIVE DEVICES ({roster.length})
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rosterScroll}
        >
          {roster.map((dev) => (
            <View key={dev.device_idx} style={styles.rosterChipWrapper}>
              <SpeakerChip
                speakerId={dev.device_idx}
                name={`${dev.name}${
                  dev.device_idx === myDeviceIdx ? " (You)" : ""
                }`}
                color={dev.color}
              />
            </View>
          ))}
          {roster.length === 0 && (
            <Text style={styles.rosterEmptyText}>Connecting devices...</Text>
          )}
        </ScrollView>
      </View>

      {/* Live Captions Feed */}
      <View style={styles.feedContainer}>
        {captions.length === 0 ? (
          <View style={styles.emptyFeed}>
            <View style={styles.emptyPulse} />
            <Text style={styles.emptyFeedTitle}>Listening for audio...</Text>
            <Text style={styles.emptyFeedSubtitle}>
              Speak or stream synthetic frames from joined devices to see live
              captions here.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={captions}
            keyExtractor={(item) => item.line_id}
            renderItem={({ item }) => {
              const speakerInfo = item.speaker_id
                ? speakerMap.get(item.speaker_id)
                : undefined;
              return (
                <CaptionLine
                  caption={item}
                  speakerName={speakerInfo?.name}
                  speakerColor={speakerInfo?.color}
                />
              );
            }}
            contentContainerStyle={styles.captionsList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}
      </View>

      {/* Mic Status Footer */}
      <View style={styles.footer}>
        <View style={styles.micIndicator}>
          <View style={styles.micPulseDot} />
          <Text style={styles.micText}>
            Mic: 16 kHz Mono Streaming (Stub Active)
          </Text>
        </View>
        {myDeviceIdx !== null && (
          <Text style={styles.deviceTag}>Device #{myDeviceIdx}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  leaveButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#1E293B",
  },
  leaveButtonText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  codePillLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#3B82F6",
  },
  codePillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#93C5FD",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  rosterContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#131C2E",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  rosterTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  rosterScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rosterChipWrapper: {
    marginRight: 6,
  },
  rosterEmptyText: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
  },
  feedContainer: {
    flex: 1,
    backgroundColor: "#0B1120",
  },
  captionsList: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyFeed: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyPulse: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderWidth: 2,
    borderColor: "#3B82F6",
    marginBottom: 16,
  },
  emptyFeedTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#E2E8F0",
    marginBottom: 8,
  },
  emptyFeedSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0F172A",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  micIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  micPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  micText: {
    fontSize: 12,
    color: "#94A3B8",
  },
  deviceTag: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "monospace",
  },
});
