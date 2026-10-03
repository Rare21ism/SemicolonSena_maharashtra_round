import React, { useState } from "react";
import {
  Clipboard,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "../theme";
import { Button } from "./Button";

interface QRCodeCardProps {
  code: string;
  sessionName?: string;
  onShare?: () => void;
}

export const QRCodeCard: React.FC<QRCodeCardProps> = ({
  code,
  sessionName,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate deterministic visual matrix for the QR placeholder pattern
  const matrixSize = 13;
  const qrPattern = Array.from({ length: matrixSize }, (_, row) =>
    Array.from({ length: matrixSize }, (_, col) => {
      // Corner alignment boxes (standard QR pattern corners)
      const inTopLeft = row < 4 && col < 4;
      const inTopRight = row < 4 && col >= matrixSize - 4;
      const inBottomLeft = row >= matrixSize - 4 && col < 4;

      if (inTopLeft || inTopRight || inBottomLeft) {
        const r = inBottomLeft ? row - (matrixSize - 4) : row;
        const c = inTopRight ? col - (matrixSize - 4) : col;
        return r === 0 || r === 3 || c === 0 || c === 3 || (r === 1 && c === 1) || (r === 2 && c === 2);
      }

      // Hash with code characters
      const charCode = code.charCodeAt((row * 3 + col) % code.length) || 65;
      return (charCode + row * col) % 3 === 0 || (row + col) % 4 === 0;
    })
  );

  return (
    <View style={styles.card}>
      {sessionName && (
        <View style={styles.header}>
          <Text style={styles.sessionName} numberOfLines={1}>
            {sessionName}
          </Text>
          <Text style={styles.shareSubtitle}>
            Share this code with everyone joining the conversation
          </Text>
        </View>
      )}

      {/* Prominent Room Code Box */}
      <View style={styles.codeContainer}>
        <Text style={styles.codeLabel}>ROOM CODE</Text>
        <Text style={styles.codeText}>{code}</Text>
      </View>

      {/* High-contrast QR Container */}
      <View style={styles.qrOuterWrapper}>
        <View style={styles.qrContainer}>
          {qrPattern.map((row, rIdx) => (
            <View key={rIdx} style={styles.qrRow}>
              {row.map((active, cIdx) => (
                <View
                  key={cIdx}
                  style={[
                    styles.qrPixel,
                    active ? styles.qrPixelFilled : styles.qrPixelEmpty,
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.qrCenterBadge}>
          <Text style={styles.qrCenterText}>RT</Text>
        </View>
      </View>

      <Text style={styles.scanNotice}>Scan QR code or enter code manually</Text>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Button
          title={copied ? "Copied to clipboard!" : "Copy Room Code"}
          variant={copied ? "secondary" : "primary"}
          size="sm"
          icon={
            <Ionicons
              name={copied ? "checkmark-circle" : "copy-outline"}
              size={16}
              color={copied ? colors.success : "#FFFFFF"}
            />
          }
          onPress={handleCopy}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.lg,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  shareSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
  },
  codeContainer: {
    alignItems: "center",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 28,
    marginBottom: spacing.md,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primaryLight,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  codeText: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textPrimary,
    fontFamily: "monospace",
    letterSpacing: 4,
  },
  qrOuterWrapper: {
    position: "relative",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.sm,
  },
  qrContainer: {
    width: 140,
    height: 140,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  qrRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  qrPixel: {
    flex: 1,
    margin: 0.5,
    borderRadius: 1,
  },
  qrPixelFilled: {
    backgroundColor: "#0F172A",
  },
  qrPixelEmpty: {
    backgroundColor: "#FFFFFF",
  },
  qrCenterBadge: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  qrCenterText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  scanNotice: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: spacing.md,
  },
  actionRow: {
    width: "100%",
  },
  actionBtn: {
    width: "100%",
  },
});

