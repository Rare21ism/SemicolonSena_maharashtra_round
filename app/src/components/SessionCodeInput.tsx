import React, { useRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii, spacing } from "../theme";

interface SessionCodeInputProps {
  value: string;
  onChangeText: (text: string) => void;
  disabled?: boolean;
}

export const SessionCodeInput: React.FC<SessionCodeInputProps> = ({
  value,
  onChangeText,
  disabled = false,
}) => {
  const inputRef = useRef<TextInput>(null);
  const cleanCode = (value || "").slice(0, 6).toUpperCase();

  const handleCellPress = () => {
    inputRef.current?.focus();
  };

  const cells = [0, 1, 2, 3, 4, 5];

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        value={cleanCode}
        onChangeText={(text) => {
          const upper = text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
          onChangeText(upper);
        }}
        maxLength={6}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="default"
        style={styles.hiddenInput}
        editable={!disabled}
      />

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleCellPress}
        style={styles.cellsRow}
      >
        {cells.map((index) => {
          const char = cleanCode[index] || "";
          const isCurrent = cleanCode.length === index;
          const isFilled = Boolean(char);

          return (
            <View
              key={index}
              style={[
                styles.cell,
                isFilled && styles.cellFilled,
                isCurrent && styles.cellCurrent,
              ]}
            >
              <Text style={styles.cellText}>{char}</Text>
            </View>
          );
        })}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
    alignItems: "center",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  cellsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  cell: {
    width: 46,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.bgInput,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  cellFilled: {
    borderColor: "rgba(99, 102, 241, 0.4)",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  cellCurrent: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  cellText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    fontFamily: "monospace",
  },
});
