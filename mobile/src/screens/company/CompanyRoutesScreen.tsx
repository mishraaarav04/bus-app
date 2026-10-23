import React, { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { Button, Card, Empty, ErrorText, Pill, Row } from "../../components/ui";
import { useActiveRides } from "../../hooks/useActiveRides";
import { colors, font, formatDuration, formatMiles } from "../../theme";
import { CompanyOverview, Route } from "../../types";
import { RouteBuilder } from "./RouteBuilder";
import { RoutePreview } from "./RoutePreview";

export function CompanyRoutesScreen() {
  const { rides } = useActiveRides();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [building, setBuilding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([api.listRoutes(), api.companyOverview()]);
      setRoutes(r);
      setOverview(o);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const running = new Set(rides.map((r) => (r.kind === "staff" ? r.session.routeId : r.routeId)));
  const open = routes.find((r) => r.id === openId) ?? null;
  const schoolName = (id?: string) => overview?.schools.find((s) => s.id === id)?.name ?? "School";
  const driverName = (id?: string) => overview?.drivers.find((d) => d.id === id)?.name;

  async function assign(driverId: string | null) {
    if (!open) return;
    try {
      await api.assignDriver(open.id, driverId);
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't assign", e.message);
    }
  }

  async function send() {
    if (!open) return;
    try {
      await api.sendRoute(open.id);
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't send", e.message);
    }
  }

  function remove() {
    if (!open) return;
    Alert.alert("Delete this route?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteRoute(open.id);
            setOpenId(null);
            await load();
          } catch (e: any) {
            Alert.alert("Couldn't delete", e.message);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={font.title}>Routes</Text>
          <Button title="+ New route" onPress={() => setBuilding(true)} style={{ minHeight: 44 }} />
        </Row>
        <ErrorText text={error} />
        {routes.length === 0 ? (
          <Empty title="No routes yet" hint="Add a school in Team, then tap New route and just enter the stops." />
        ) : (
          routes.map((r) => (
            <Pressable key={r.id} onPress={() => setOpenId(r.id)}>
              <Card>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{r.name}</Text>
                    <Text style={font.small}>
                      {schoolName(r.schoolId)} · {r.stops.length} stops
                      {r.totalDurationSec ? ` · ${formatDuration(r.totalDurationSec)} · ${formatMiles(r.totalDistanceM)}` : ""}
                    </Text>
                    <Text style={font.small}>Driver: {driverName(r.driverId) ?? "not assigned"}</Text>
                  </View>
                  <View style={{ gap: 6, alignItems: "flex-end" }}>
                    {running.has(r.id) ? <Pill text="Running" tone="green" /> : null}
                    <Pill text={r.status === "sent" ? "Sent" : "Draft"} tone={r.status === "sent" ? "orange" : "amber"} />
                  </View>
                </Row>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal visible={building} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBuilding(false)}>
        {overview ? <RouteBuilder overview={overview} onClose={() => setBuilding(false)} onChanged={load} /> : null}
      </Modal>

      <Modal visible={Boolean(open)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpenId(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
          {open ? (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={font.title}>{open.name}</Text>
              <Text style={font.small}>{schoolName(open.schoolId)}</Text>
              <RoutePreview route={open} />

              <Text style={font.h3}>Stops</Text>
              {open.stops.map((s) => (
                <Row key={s.id}>
                  <Pill text={String(s.order + 1)} tone="orange" />
                  <Text style={font.body}>{s.name}</Text>
                </Row>
              ))}

              <Text style={font.h3}>Driver</Text>
              {overview?.drivers.length ? (
                <Row style={{ flexWrap: "wrap" }}>
                  {overview.drivers.map((d) => (
                    <Pressable key={d.id} onPress={() => assign(open.driverId === d.id ? null : d.id)}>
                      <Pill text={d.name} tone={open.driverId === d.id ? "orange" : "gray"} />
                    </Pressable>
                  ))}
                </Row>
              ) : (
                <Text style={font.small}>No drivers yet. Share your driver code from the Team tab.</Text>
              )}

              {open.status !== "sent" ? (
                <Button title={`Send to ${schoolName(open.schoolId)}`} onPress={send} />
              ) : null}
              <Button title="Delete route" variant="outline" onPress={remove} />
              <Button title="Close" variant="soft" onPress={() => setOpenId(null)} />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
