import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from "react-native";
import { colors, radii, spacing } from "../theme";

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  rightIcon,
  style,
  ...props
}) => {
  const getContainerStyle = () => {
    switch (variant) {
      case "primary":
        return styles.primary;
      case "secondary":
        return styles.secondary;
      case "outline":
        return styles.outline;
      case "ghost":
        return styles.ghost;
      case "danger":
        return styles.danger;
      default:
        return styles.primary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case "primary":
        return styles.primaryText;
      case "secondary":
        return styles.secondaryText;
      case "outline":
        return styles.outlineText;
      case "ghost":
        return styles.ghostText;
      case "danger":
        return styles.dangerText;
      default:
        return styles.primaryText;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case "sm":
        return styles.sizeSm;
      case "lg":
        return styles.sizeLg;
      default:
        return styles.sizeMd;
    }
  };

  const getTextSizeStyle = () => {
    switch (size) {
      case "sm":
        return styles.textSm;
      case "lg":
        return styles.textLg;
      default:
        return styles.textMd;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[
        styles.base,
        getSizeStyle(),
        getContainerStyle(),
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? "#FFFFFF" : colors.primaryLight}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconLeft}>{icon}</View>}
          <Text style={[styles.baseText, getTextSizeStyle(), getTextStyle()]}>
            {title}
          </Text>
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  sizeSm: {
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  sizeMd: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  sizeLg: {
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  baseText: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 13,
  },
  textMd: {
    fontSize: 15,
  },
  textLg: {
    fontSize: 16,
  },
  primary: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryText: {
    color: "#FFFFFF",
  },
  secondary: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  secondaryText: {
    color: colors.textPrimary,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.borderBright,
  },
  outlineText: {
    color: colors.textPrimary,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  ghostText: {
    color: colors.textSecondary,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  dangerText: {
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.45,
  },
});
