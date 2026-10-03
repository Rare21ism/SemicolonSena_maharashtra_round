import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View } from "react-native";
import { SessionProvider } from "../src/state/SessionContext";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bgPrimary },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: colors.bgPrimary },
            animation: "fade",
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: "Roundtable",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="create"
            options={{
              title: "Create Session",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="join"
            options={{
              title: "Join Conversation",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="setup"
            options={{
              title: "Audio Setup",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="enroll"
            options={{
              title: "Voice Enrollment",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="waiting"
            options={{
              title: "Waiting Room",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="live"
            options={{
              title: "Live Session",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="ended"
            options={{
              title: "Conversation Summary",
              headerShown: false,
            }}
          />
        </Stack>
      </View>
    </SessionProvider>
  );
}
