import React from "react";
import {
  Modal,
  Platform,
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
  devices: DeviceInfo[];
  myDeviceIdx: number | null;
  activeSpeakerId?: number | null;
  isMobile?: boolean;
}

export const RosterDrawer: React.FC<RosterDrawerProps> = ({
  visible,
  onClose,
  devices,
  myDeviceIdx,
  activeSpeakerId,
  isMobile = false,
}) => {
  const content = (
    <View style={[styles.container, isMobile ? styles.containerMobile : styles.containerDesktop]}>
      {/* Drawer Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>PARTICIPANTS</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{devices.length}</Text>
          </View>
        </View>

        {isMobile && (
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.subtitle}>
        Microphones active in the ad-hoc array
      </Text>

      {/* Participant List */}
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {devices.map((device) => {
          const isSelf = device.device_idx === myDeviceIdx;
          const isSpeaking = device.device_idx === activeSpeakerId;

          return (
            <ParticipantCard
              key={device.device_idx}
              device={device}
              isSelf={isSelf}
              isSpeaking={isSpeaking}
              statusText={isSpeaking ? "Speaking" : "Listening"}
              connectionQuality="good"
            />
          );
        })}

        {devices.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Waiting for devices to join...</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Summary / Mic Info */}
      <View style={styles.footerNote}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.success} />
        <Text style={styles.footerText}>
          Coordinated array active · 16 kHz PCM
        </Text>
      </View>
    </View>
  );

  if (isMobile) {
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
            {content}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  // Desktop side panel
  if (!visible) return null;
  return <View style={styles.desktopPanelWrapper}>{content}</View>;
};

const styles = StyleSheet.create({
  desktopPanelWrapper: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDefault,
    backgroundColor: colors.bgSecondary,
    height: "100%",
  },
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
    maxHeight: "80%",
    paddingBottom: 24,
  },
  container: {
    flex: 1,
    padding: spacing.md,
  },
  containerMobile: {
    flex: 0,
    maxHeight: 480,
  },
  containerDesktop: {
    height: "100%",
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
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
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
    flex: 1,
  },
  emptyWrap: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
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
