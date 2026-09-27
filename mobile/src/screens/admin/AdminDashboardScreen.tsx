import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { api } from "../../api/client";
import type { Route } from "../../types";

/**
 * Admin screen: overview of routes/buses. Kept intentionally light for the
 * rudimentary build — a real admin dashboard (contacting drivers/parents
 * with notifications, live map of every active bus) is more naturally a
 * web dashboard; this mobile view covers roster/route visibility only.
 */
export function AdminDashboardScreen() {
  const [routes, setRoutes] = useState<Route[]>([]);

  useEffect(() => {
    api.listRoutes().then((r) => setRoutes(r as Route[])).catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Routes</Text>
      <FlatList
        data={routes}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.hint}>{item.stops.length} stops · {item.direction}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.hint}>No routes yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  cardTitle: { fontWeight: "700" },
  hint: { color: "#666", fontSize: 13 },
});
