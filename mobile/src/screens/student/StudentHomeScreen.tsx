import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { socket } from "../../api/socket";
import { useLocationSharing } from "../../hooks/useLocationSharing";
import type { RideSession } from "../../types";

/**
 * Student screen: activate/deactivate the ride (shares this student's
 * location), see their own stop's ETA and boarding/missed status, and the
 * "I'm not riding today" button that triggers the live reroute on the
 * server if theirs is the last rider at that stop.
 */
export function StudentHomeScreen({ rideId }: { rideId: string | null }) {
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [ride, setRide] = useState<RideSession | null>(null);

  useLocationSharing(active, (loc) => {
    if (!user) return;
    socket.emit("ride:student-location", { studentId: user.id, ...loc });
    api.pushStudentLocation(user.id, loc.lat, loc.lng).catch(() => {});
  });

  useEffect(() => {
    if (!rideId) return;
    socket.connect();
    socket.emit("ride:join", { rideId });
    socket.on("ride:update", (session: RideSession) => setRide(session));
    api.getRide(rideId).then((s) => setRide(s as RideSession)).catch(() => {});
    return () => {
      socket.off("ride:update");
    };
  }, [rideId]);

  const myStopId = ride
    ? Object.keys(ride.stopStates).find(
        (id) => user && ride.stopStates[id].studentStatuses[user.id]
      )
    : null;
  const myStopState = myStopId ? ride?.stopStates[myStopId] : null;
  const myStatus = myStopId && user ? myStopState?.studentStatuses[user.id] : null;

  async function handleNotRiding() {
    if (!rideId || !user) return;
    await api.markNotRiding(rideId, user.id);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hi {user?.name ?? "Student"}</Text>

      <Pressable
        style={[styles.button, active && styles.buttonActive]}
        onPress={() => setActive((a) => !a)}
      >
        <Text style={styles.buttonText}>
          {active ? "Deactivate ride" : "Activate ride"}
        </Text>
      </Pressable>
      <Text style={styles.hint}>
        Activating shares your location until the bus reaches your stop or the
        school, so boarding is tracked automatically.
      </Text>

      {ride && myStopState && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your stop</Text>
          <Text>Status: {myStatus ?? "n/a"}</Text>
          <Text>
            ETA:{" "}
            {myStopState.etaSeconds != null
              ? `${Math.round(myStopState.etaSeconds / 60)} min`
              : "—"}
          </Text>
          {myStatus === "missed" && (
            <Text style={styles.warning}>You missed the bus at this stop.</Text>
          )}
        </View>
      )}

      <Pressable style={styles.secondaryButton} onPress={handleNotRiding}>
        <Text style={styles.secondaryButtonText}>
          I'm not riding today
        </Text>
      </Pressable>
      <Text style={styles.hint}>
        If no one else is waiting at your stop, the driver's route skips it
        automatically and everyone behind you gets an earlier ETA.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  button: {
    backgroundColor: "#16a34a",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonActive: { backgroundColor: "#dc2626" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#999",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: { fontWeight: "600" },
  hint: { color: "#666", fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  cardTitle: { fontWeight: "700", marginBottom: 4 },
  warning: { color: "#dc2626", fontWeight: "600" },
});
