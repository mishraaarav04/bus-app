import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow } from "../theme";
import { COLLAPSED_HEIGHT, Sheet } from "./Sheet";
import { MapState, WheelieMap } from "./MapView";

/** Full-bleed map with a floating title chip and a Life360-style bottom sheet. */
export function MapShell({
  title,
  chip,
  map,
  children,
}: {
  title: string;
  chip?: React.ReactNode;
  map: Omit<MapState, "bottomPadding">;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [sheetH, setSheetH] = useState(COLLAPSED_HEIGHT);
  return (
    <View style={styles.root}>
      <WheelieMap state={{ ...map, bottomPadding: sheetH }} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.titleChip}>
          <View style={styles.dot} />
          <Text style={styles.titleText}>{title}</Text>
        </View>
        {chip}
      </View>
      <Sheet onHeightChange={setSheetH}>{children}</Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primarySoft },
  top: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...shadow,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  titleText: { fontWeight: "900", fontSize: 16, color: colors.ink },
});
