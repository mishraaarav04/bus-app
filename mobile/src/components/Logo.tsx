import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function Logo({ size = 64, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="bus" size={size * 0.55} color={colors.white} />
      </View>
      {showName ? (
        <Text style={{ fontSize: size * 0.5, fontWeight: "900", color: colors.ink, letterSpacing: -1 }}>
          Route<Text style={{ color: colors.primary }}>IQ</Text>
        </Text>
      ) : null}
    </View>
  );
}
