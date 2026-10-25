import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../api/client";
import { MapShell } from "../../components/MapShell";
import { MapMarker } from "../../components/MapView";
import { Card, Empty, Pill, Row } from "../../components/ui";
import { useActiveRides } from "../../hooks/useActiveRides";
import { colors, font, formatEta, formatMiles } from "../../theme";
import { Route, StaffRideView } from "../../types";

function incidentLabel(i: { type: string; delayMinutes: number | null }): string {
  switch (i.type) {
    case "delay":
      return i.delayMinutes ? `Delayed ~${i.delayMinutes} min` : "Delayed";
    case "breakdown":
      return "Bus breakdown";
    case "accident":
      return "Accident reported";
    case "off_route":
      return "Off route";
    case "stopped":
      return "Stopped for a while";
    default:
      return "Driver reported a problem";
  }
}

function ProgressBar({ value }: { value: number }) {
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.primarySoft, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: 10, backgroundColor: colors.primary }} />
    </View>
  );
}

/**
 * School view: routes the bus company sent over, and how far along each running
 * bus is. School accounts only ever see their own school's routes.
 */
export function AdminDashboardScreen() {
  const { rides } = useActiveRides();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.listRoutes().then(setRoutes).catch(() => {});
  }, [rides.length]);

  const live = new Map<string, StaffRideView>();
  rides.forEach((r) => r.kind === "staff" && live.set(r.session.routeId, r));

  const focus = routes.find((r) => r.id === selected) ?? routes.find((r) => live.has(r.id)) ?? routes[0] ?? null;

  const map = useMemo(() => {
    const markers: MapMarker[] = [];
    if (!focus) return { markers, line: null, fitKey: "none" };
    markers.push({ id: "school", kind: "school", lat: focus.schoolLocation.lat, lng: focus.schoolLocation.lng });
    const ride = live.get(focus.id);
    focus.stops.forEach((s) => {
      const st = ride?.session.stopStates[s.id];
      const tone = st?.status === "skipped" ? "gray" : ride?.session.completedStopIds.includes(s.id) ? "green" : "orange";
      markers.push({ id: s.id, kind: "stop", lat: s.location.lat, lng: s.location.lng, label: String(s.order + 1), tone });
    });
    // Every running bus on the map, not just the focused route.
    live.forEach((r, routeId) => {
      if (r.session.busLocation) markers.push({ id: `bus-${routeId}`, kind: "bus", ...r.session.busLocation });
    });
    return { markers, line: focus.geometry ?? null, fitKey: focus.id };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, rides]);

  return (
    <MapShell
      title="School"
      chip={live.size ? <Pill text={`${live.size} bus${live.size > 1 ? "es" : ""} running`} tone="green" /> : undefined}
      map={map}
    >
      <Text style={font.h2}>Routes</Text>
      {routes.length === 0 ? (
        <Empty title="No routes yet" hint="Routes appear here once your bus company sends them to you." />
      ) : (
        routes.map((r) => {
          const ride = live.get(r.id);
          const p = ride?.progress;
          return (
            <Pressable key={r.id} onPress={() => setSelected(r.id)}>
              <Card style={focus?.id === r.id ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{r.name}</Text>
                    <Text style={font.small}>
                      {r.stops.length} stops · {r.direction === "to_school" ? "to school" : "to home"}
                      {r.totalDistanceM ? ` · ${formatMiles(r.totalDistanceM)}` : ""}
                    </Text>
                  </View>
                  <Pill text={ride ? "Running" : "Not running"} tone={ride ? "green" : "gray"} />
                </Row>
                {(() => {
                  // The driver's own report, or an automatic alert (off route / stopped) still open.
                  const inc = ride?.incident ?? ride?.alerts?.find((a) => !a.resolvedAt);
                  return inc ? <Pill text={incidentLabel(inc)} tone={inc.type === "delay" ? "amber" : "red"} /> : null;
                })()}
                {ride && p ? (
                  <>
                    <ProgressBar value={p.total ? (p.completed + p.skipped) / p.total : 0} />
                    <Row style={{ flexWrap: "wrap" }}>
                      <Pill text={`${p.completed + p.skipped}/${p.total} stops`} tone="orange" />
                      <Pill text={`${ride.boardedCount}/${ride.riderCount} aboard`} tone="green" />
                      {p.etaToSchoolSec != null ? <Pill text={`Arrives in ${formatEta(p.etaToSchoolSec)}`} tone="gray" /> : null}
                    </Row>
                  </>
                ) : null}
              </Card>
            </Pressable>
          );
        })
      )}
    </MapShell>
  );
}
