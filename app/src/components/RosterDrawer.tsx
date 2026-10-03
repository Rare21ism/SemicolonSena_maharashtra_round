import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DeviceInfo } from "@roundtable/protocol";
import { colors, radii, spacing, typography } from "../theme";
import { ParticipantCard } from "./ParticipantCard";

interface RosterDrawerProps {
  visible: boolean;
  onClose: () => void;
  roster: DeviceInfo[];
  myDeviceIdx: number | null;
  activeSpeakerId?: number | null;
}

export const RosterDrawer: React.FC<RosterDrawerProps> = ({
  visible,
  onClose,
  roster,
  myDeviceIdx,
  activeSpeakerId,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.bottomSheetWrapper}>
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.title}>PEOPLE HERE</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{roster.length}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>
              People currently connected in this conversation
            </Text>

            {/* Participant List */}
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {roster.map((device) => {
                const isSelf = device.device_idx === myDeviceIdx;
                const isSpeaking = device.device_idx === activeSpeakerId;

                return (
                  <ParticipantCard
                    key={device.device_idx}
                    device={device}
                    isSelf={isSelf}
                    isSpeaking={isSpeaking}
                    statusText={isSpeaking ? "Speaking" : "Connected"}
                    connectionQuality="good"
                  />
                );
              })}

              {roster.length === 0 && (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>Waiting for people to join…</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.footerNote}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={styles.footerText}>
                Microphones active & contributing
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  bottomSheetWrapper: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    maxHeight: 460,
    paddingBottom: 20,
  },
  container: {
    padding: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    ...typography.label,
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primaryLight,
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  scrollArea: {
    maxHeight: 300,
  },
  emptyWrap: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.sm,
  },
  footerText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});

