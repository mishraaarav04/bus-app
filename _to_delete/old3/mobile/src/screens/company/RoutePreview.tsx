import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { WheelieMap, MapMarker } from "../../components/MapView";
import { Pill, Row } from "../../components/ui";
import { colors, font, formatDuration, formatMiles, mToFt } from "../../theme";
import { Route } from "../../types";

export function RoutePreview({ route, height = 280 }: { route: Route; height?: number }) {
  const state = useMemo(() => {
    const markers: MapMarker[] = [
      { id: "school", kind: "school", lat: route.schoolLocation.lat, lng: route.schoolLocation.lng },
      ...route.stops.map((s) => ({
        id: s.id,
        kind: "stop" as const,
        lat: s.location.lat,
        lng: s.location.lng,
        label: String(s.order + 1),
      })),
    ];
    return { markers, line: route.geometry ?? null, fitKey: route.id, bottomPadding: 20 };
  }, [route]);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ height, borderRadius: 24, overflow: "hidden" }}>
        <WheelieMap state={state} />
      </View>
      <Row style={{ flexWrap: "wrap" }}>
        {route.totalDurationSec ? <Pill text={formatDuration(route.totalDurationSec)} tone="orange" /> : null}
        {route.totalDistanceM ? <Pill text={formatMiles(route.totalDistanceM)} tone="orange" /> : null}
        <Pill text={`${route.stops.length} stops`} tone="gray" />
        {route.clearanceChecked && route.vehicle ? (
          <Pill text={`Fits ${mToFt(route.vehicle.heightM)} ft bus`} tone="green" />
        ) : null}
        <Pill text={route.status === "sent" ? "Sent to school" : "Draft"} tone={route.status === "sent" ? "green" : "amber"} />
      </Row>
      {route.clearanceChecked ? (
        <Text style={font.small}>
          Mapbox routes around roads it knows are too low, narrow or weight-limited for your bus. Coverage varies by
          area, so still check low bridges on your own before sending drivers out.
        </Text>
      ) : (
        <Text style={[font.small, { color: colors.warning }]}>Hand-built route — clearance wasn't checked.</Text>
      )}
    </View>
  );
}
