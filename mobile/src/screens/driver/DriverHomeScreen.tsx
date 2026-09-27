import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { socket } from "../../api/socket";
import { useLocationSharing } from "../../hooks/useLocationSharing";
import type { Route, RideSession } from "../../types";

/**
 * Driver screen: pick today's route, activate the ride (starts sharing bus
 * location to everyone on the route), and step through stops. Departing a
 * stop is a manual button here — wiring automatic "bus left the geofence"
 * detection to this same advancePastStop() server logic is a small
 * follow-up once you're testing with a real device outdoors.
 */
export function DriverHomeScreen({
  rideId,
  onRideStarted,
}: {
  rideId: string | null;
  onRideStarted: (id: string) => void;
}) {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [ride, setRide] = useState<RideSession | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    api.listRoutes().then((r) => setRoutes(r as Route[])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!rideId) return;
    socket.connect();
    socket.emit("ride:join", { rideId });
    socket.on("ride:update", (session: RideSession) => setRide(session));
    return () => {
      socket.off("ride:update");
    };
  }, [rideId]);

  useLocationSharing(active, (loc) => {
    if (!rideId) return;
    socket.emit("ride:driver-location", { rideId, ...loc });
  });

  async function handleStart() {
    if (!selectedRouteId || !user) return;
    const session = await api.startRide({
      routeId: selectedRouteId,
      driverId: user.id,
    });
    onRideStarted((session as RideSession).id);
    setActive(true);
  }

  const route = routes.find((r) => r.id === selectedRouteId);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hi {user?.name ?? "Driver"}</Text>

      {!rideId && (
        <>
          <Text style={styles.sectionLabel}>Choose a route</Text>
          <FlatList
            data={routes}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.routeItem,
                  selectedRouteId === item.id && styles.routeItemSelected,
                ]}
                onPress={() => setSelectedRouteId(item.id)}
              >
                <Text>{item.name}</Text>
              </Pressable>
            )}
          />
          <Pressable
            style={[styles.button, !selectedRouteId && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={!selectedRouteId}
          >
            <Text style={styles.buttonText}>Activate ride</Text>
          </Pressable>
        </>
      )}

      {rideId && ride && (
        <>
          <Text style={styles.sectionLabel}>Remaining stops</Text>
          <FlatList
            data={ride.remainingStopIds}
            keyExtractor={(id) => id}
            renderItem={({ item: stopId }) => {
              const stop = route?.stops.find((s) => s.id === stopId);
              const state = ride.stopStates[stopId];
              return (
                <View style={styles.stopRow}>
                  <Text style={styles.stopName}>{stop?.name ?? stopId}</Text>
                  <Text>{state.status}</Text>
                  <Pressable
                    style={styles.departButton}
                    onPress={() => api.departStop(ride.id, stopId)}
                  >
                    <Text style={styles.departButtonText}>Depart</Text>
                  </Pressable>
                </View>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  sectionLabel: { fontWeight: "700", marginTop: 8 },
  routeItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 8,
  },
  routeItemSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  button: {
    backgroundColor: "#16a34a",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  stopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    marginBottom: 6,
  },
  stopName: { fontWeight: "600" },
  departButton: {
    backgroundColor: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  departButtonText: { color: "#fff", fontSize: 12 },
});
