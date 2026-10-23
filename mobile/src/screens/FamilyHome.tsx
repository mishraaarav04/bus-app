import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api/client";
import { BoardingPass } from "../components/BoardingPass";
import { MapMarker } from "../components/MapView";
import { MapShell } from "../components/MapShell";
import { Avatar, Button, Card, Empty, Pill, Row, statusPill } from "../components/ui";
import { useActiveRides } from "../hooks/useActiveRides";
import { useAuth } from "../context/AuthContext";
import { FamilyRideView, Route } from "../types";
import { colors, font, formatEta } from "../theme";

const toneFor = (s: string) =>
  s === "boarded" ? "green" : s === "missed" ? "red" : s === "skipped" ? "gray" : "orange";

/**
 * Student and parent home. Shows only this family's riders: where the bus is
 * (live, only while the driver's ride is active), their stop, ETA and status.
 */
export function FamilyHome() {
  const { user } = useAuth();
  const { rides, loading, refresh } = useActiveRides();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [passOpen, setPassOpen] = useState(false);

  useEffect(() => {
    api.listRoutes().then(setRoutes).catch(() => {});
  }, [rides.length]);

  const family = rides.filter((r): r is FamilyRideView => r.kind === "family");
  const ride = family.find((r) => r.id === selected) ?? family[0] ?? null;
  const idleRoute = !ride ? routes[0] ?? null : null;
  const isStudent = user?.role === "student";

  const map = useMemo(() => {
    const markers: MapMarker[] = [];
    let line: [number, number][] | null = null;
    let fitKey = "none";
    if (ride) {
      markers.push({ id: "school", kind: "school", lat: ride.schoolLocation.lat, lng: ride.schoolLocation.lng });
      ride.mine.forEach((m) =>
        markers.push({ id: `stop-${m.stopId}`, kind: "stop", lat: m.stopLocation.lat, lng: m.stopLocation.lng, tone: toneFor(m.status) as any, label: m.name[0] })
      );
      if (ride.busLocation) markers.push({ id: "bus", kind: "bus", ...ride.busLocation });
      line = ride.geometry ?? null;
      fitKey = ride.id;
    } else if (idleRoute) {
      markers.push({ id: "school", kind: "school", lat: idleRoute.schoolLocation.lat, lng: idleRoute.schoolLocation.lng });
      idleRoute.stops.forEach((s) =>
        markers.push({ id: `stop-${s.id}`, kind: "stop", lat: s.location.lat, lng: s.location.lng, tone: "orange" })
      );
      line = idleRoute.geometry ?? null;
      fitKey = idleRoute.id;
    }
    return { markers, line, fitKey };
  }, [ride, idleRoute]);

  async function notRiding(studentId: string, name: string) {
    if (!ride) return;
    Alert.alert(`${name} isn't riding?`, "The driver's route skips the stop if nobody else is waiting there.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Not riding today",
        style: "destructive",
        onPress: async () => {
          try {
            await api.markNotRiding(ride.id, studentId);
            refresh();
          } catch (e: any) {
            Alert.alert("Couldn't update", e.message);
          }
        },
      },
    ]);
  }

  return (
    <>
      <MapShell
        title={ride ? (ride.direction === "to_school" ? "Heading to school" : "Heading home") : "Wheelie"}
        chip={ride ? <Pill text="Live" tone="green" /> : undefined}
        map={map}
      >
        {family.length > 1 ? (
          <Row style={{ flexWrap: "wrap" }}>
            {family.map((r) => (
              <Pressable key={r.id} onPress={() => setSelected(r.id)}>
                <Pill text={r.routeName} tone={r.id === ride?.id ? "orange" : "gray"} />
              </Pressable>
            ))}
          </Row>
        ) : null}

        {ride ? (
          <>
            {ride.mine.map((m) => {
              const pill = statusPill(m.status);
              return (
                <Card key={m.studentId}>
                  <Row>
                    <Avatar name={m.name} tone={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={font.h2}>{m.name}</Text>
                      <Text style={font.small}>Stop: {m.stopName}</Text>
                    </View>
                    <Pill text={pill.text} tone={pill.tone} />
                  </Row>
                  {m.status === "pending" ? (
                    <Text style={font.body}>
                      Bus arrives in <Text style={{ fontWeight: "900", color: colors.primaryDark }}>{formatEta(m.etaSeconds)}</Text>
                    </Text>
                  ) : null}
                  {m.status === "boarded" ? (
                    <Text style={{ color: colors.success, fontWeight: "700" }}>
                      Checked in{m.boardedAt ? ` at ${new Date(m.boardedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                    </Text>
                  ) : null}
                  {m.status === "missed" ? (
                    <Text style={{ color: colors.danger, fontWeight: "700" }}>The bus passed this stop before check-in.</Text>
                  ) : null}
                  {m.status === "pending" ? (
                    <Row>
                      {isStudent ? (
                        <Button title="Show boarding code" style={{ flex: 1 }} onPress={() => setPassOpen(true)} />
                      ) : null}
                      <Button
                        title="Not riding today"
                        variant="outline"
                        style={{ flex: 1 }}
                        onPress={() => notRiding(m.studentId, m.name)}
                      />
                    </Row>
                  ) : null}
                </Card>
              );
            })}
            {!ride.busLocation ? <Text style={font.small}>Waiting for the driver's first location update...</Text> : null}
          </>
        ) : loading ? null : (
          <Empty
            title="No bus running right now"
            hint={
              idleRoute
                ? `${idleRoute.name} is set up. Live tracking starts when the driver begins the ride and stops when it ends.`
                : isStudent
                ? "Your school hasn't assigned you to a stop yet."
                : "Once your child is assigned to a stop, their bus shows up here."
            }
          />
        )}
      </MapShell>

      <Modal visible={passOpen} animationType="slide" onRequestClose={() => setPassOpen(false)} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, padding: 20, justifyContent: "center", gap: 20 }}>
          <BoardingPass />
          <Button title="Close" variant="soft" onPress={() => setPassOpen(false)} />
        </SafeAreaView>
      </Modal>
    </>
  );
}
