import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { socket } from "../../api/socket";
import type { RideSession } from "../../types";

/**
 * Parent screen: read-only view of their own child's stop/ETA — never the
 * whole bus roster or every rider's status. (Per the privacy note from
 * earlier planning: broadcasting a full route roster to every parent leaks
 * presence info about other people's kids, so this is scoped to just the
 * linked student's stop.) Parents cannot activate anything here.
 */
export function ParentHomeScreen({ rideId }: { rideId: string | null }) {
  const { user } = useAuth();
  const [ride, setRide] = useState<RideSession | null>(null);
  const childId = user?.linkedStudentIds?.[0] ?? null;

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

  const childStopId = ride && childId
    ? Object.keys(ride.stopStates).find(
        (id) => ride.stopStates[id].studentStatuses[childId]
      )
    : null;
  const stopState = childStopId ? ride?.stopStates[childStopId] : null;
  const childStatus = childStopId && childId ? stopState?.studentStatuses[childId] : null;

  async function handleNotRiding() {
    if (!rideId || !childId) return;
    await api.markNotRiding(rideId, childId);
  }

  if (!childId) {
    return (
      <View style={styles.container}>
        <Text>No student linked to this account yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hi {user?.name ?? "Parent"}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your child's ride</Text>
        <Text>Status: {childStatus ?? "not started"}</Text>
        <Text>
          ETA:{" "}
          {stopState?.etaSeconds != null
            ? `${Math.round(stopState.etaSeconds / 60)} min`
            : "—"}
        </Text>
        {childStatus === "missed" && (
          <Text style={styles.warning}>
            Your child missed the bus at their stop.
          </Text>
        )}
        {childStatus === "boarded" && (
          <Text style={styles.success}>Your child boarded the bus.</Text>
        )}
      </View>

      <Pressable style={styles.secondaryButton} onPress={handleNotRiding}>
        <Text style={styles.secondaryButtonText}>
          My child isn't riding today
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Chat</Text>
      <Text style={styles.hint}>
        Message other parents on this route, or reach the driver/admin
        directly, from the Chat tab.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  cardTitle: { fontWeight: "700", marginBottom: 4 },
  warning: { color: "#dc2626", fontWeight: "600" },
  success: { color: "#16a34a", fontWeight: "600" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#999",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: { fontWeight: "600" },
  sectionLabel: { fontWeight: "700", marginTop: 12 },
  hint: { color: "#666", fontSize: 13 },
});
