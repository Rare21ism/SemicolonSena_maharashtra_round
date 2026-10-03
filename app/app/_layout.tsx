import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View } from "react-native";

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0F172A" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#0F172A" },
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
          name="live"
          options={{
            title: "Live Session",
            headerShown: false,
          }}
        />
      </Stack>
    </View>
  );
}
