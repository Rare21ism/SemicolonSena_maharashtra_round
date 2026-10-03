import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, getSpeakerColor, radii } from "../theme";

interface ParticipantAvatarProps {
  name: string;
  speakerId?: number | null;
  color?: string;
  isSpeaking?: boolean;
  size?: number;
}

export const ParticipantAvatar: React.FC<ParticipantAvatarProps> = ({
  name,
  speakerId = null,
  color,
  isSpeaking = false,
  size = 40,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  const derivedColor = color || getSpeakerColor(speakerId).color;
  const initial = (name || "Participant").trim().charAt(0).toUpperCase();

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isSpeaking) {
      animation = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.35,
              duration: 700,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 700,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.15,
              duration: 700,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.6,
              duration: 700,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
      pulseOpacity.setValue(0);
    }

    return () => {
      animation?.stop();
    };
  }, [isSpeaking, pulseAnim, pulseOpacity]);

  return (
    <View style={[styles.wrapper, { width: size + 16, height: size + 16 }]}>
      {/* Speaking Pulse Ring */}
      {isSpeaking && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              borderColor: derivedColor,
              transform: [{ scale: pulseAnim }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}

      {/* Main Avatar Bubble */}
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: derivedColor,
            borderColor: "rgba(255, 255, 255, 0.2)",
          },
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.44 }]}>
          {initial}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 2,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  initial: {
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
