import React, { useState } from "react";
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { colors, radius, shadow } from "../theme";

export const COLLAPSED_HEIGHT = 190;

/** Life360-style bottom sheet that floats over the map. Tap the handle to expand. */
export function Sheet({
  children,
  onHeightChange,
}: {
  children: React.ReactNode;
  onHeightChange?: (h: number) => void;
}) {
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const h = expanded ? Math.round(height * 0.62) : COLLAPSED_HEIGHT;

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    onHeightChange?.(next ? Math.round(height * 0.62) : COLLAPSED_HEIGHT);
  }

  return (
    <View style={[styles.sheet, { height: h }]}>
      <Pressable onPress={toggle} hitSlop={16} style={styles.handleWrap}>
        <View style={styles.handle} />
      </Pressable>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow,
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.primaryTint },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
});
