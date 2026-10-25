import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api/client";
import { BoardingPass } from "../components/BoardingPass";
import { MapMarker } from "../components/MapView";
import { MapShell } from "../components/MapShell";
import { FamilyTools } from "../components/FamilyTools";
import { Avatar, Button, Card, Empty, Pill, Row, statusPill } from "../components/ui";
import { useT } from "../i18n";
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
  const { t, locale } = useT();
  const { rides, loading, refresh } = useActiveRides();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [kids, setKids] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.listRoutes().then(setRoutes).catch(() => {});
  }, [rides.length]);

  // Who the "Plan ahead" screen can be used for: yourself, or each linked child.
  useEffect(() => {
    if (!user) return;
    if (user.role === "student") setKids([{ id: user.id, name: user.name }]);
    else api.parentChildren().then((c) => setKids(c.map((k) => ({ id: k.id, name: k.name })))).catch(() => {});
  }, [user?.id, user?.linkedStudentIds?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const incidentText = (i: NonNullable<FamilyRideView["incident"]>) =>
    i.type === "delay" && i.delayMinutes
      ? t("incident.delay", { min: i.delayMinutes })
      : t(`incident.${i.type}` as any);

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
    Alert.alert(t("family.notRidingQ", { name }), t("family.notRidingWhy"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("status.skipped"),
        style: "destructive",
        onPress: async () => {
          try {
            await api.markNotRiding(ride.id, studentId);
            refresh();
          } catch (e: any) {
            Alert.alert(t("common.error"), e.message);
          }
        },
      },
    ]);
  }

  return (
    <>
      <MapShell
        title={ride ? (ride.direction === "to_school" ? t("family.toSchool") : t("family.toHome")) : "Wheelie"}
        chip={ride ? <Pill text={t("family.live")} tone="green" /> : undefined}
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

        {ride?.incident ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: ride.incident.type === "delay" ? colors.warningSoft : colors.dangerSoft,
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text style={{ fontWeight: "800", color: ride.incident.type === "delay" ? colors.warning : colors.danger }}>
              {incidentText(ride.incident)}
            </Text>
          </View>
        ) : null}

        {ride ? (
          <>
            {ride.mine.map((m) => {
              const dropped = m.status === "boarded" && !!m.droppedAt;
              const pill = dropped ? { text: t("status.dropped"), tone: "green" as const } : statusPill(m.status, t);
              return (
                <Card key={m.studentId}>
                  <Row>
                    <Avatar name={m.name} tone={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={font.h2}>{m.name}</Text>
                      <Text style={font.small}>{t("family.stop", { name: m.stopName })}</Text>
                    </View>
                    <Pill text={pill.text} tone={pill.tone} />
                  </Row>
                  {m.status === "pending" ? (
                    <Text style={font.body}>
                      {t("family.arrivesIn")} <Text style={{ fontWeight: "900", color: colors.primaryDark }}>{formatEta(m.etaSeconds)}</Text>
                    </Text>
                  ) : null}
                  {m.status === "boarded" && !dropped ? (
                    <Text style={{ color: colors.success, fontWeight: "700" }}>
                      {m.boardedAt ? t("family.checkedInAt", { time: time(m.boardedAt) }) : t("family.checkedIn")}
                    </Text>
                  ) : null}
                  {dropped ? (
                    <Text style={{ color: colors.success, fontWeight: "700" }}>
                      {t("family.droppedAt", { time: time(m.droppedAt!) })}
                    </Text>
                  ) : null}
                  {m.status === "missed" ? (
                    <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("family.missedMsg")}</Text>
                  ) : null}
                  {m.status === "pending" ? (
                    <Row>
                      {isStudent ? (
                        <Button title={t("family.showCode")} style={{ flex: 1 }} onPress={() => setPassOpen(true)} />
                      ) : null}
                      <Button
                        title={t("status.skipped")}
                        variant="outline"
                        style={{ flex: 1 }}
                        onPress={() => notRiding(m.studentId, m.name)}
                      />
                    </Row>
                  ) : null}
                </Card>
              );
            })}
            {!ride.busLocation ? <Text style={font.small}>{t("family.waitingGps")}</Text> : null}
          </>
        ) : loading ? null : (
          <Empty
            title={t("family.noBus")}
            hint={
              idleRoute
                ? t("family.noBusRoute", { name: idleRoute.name })
                : isStudent
                ? t("family.noStopStudent")
                : t("family.noStopParent")
            }
          />
        )}

        {kids.length ? (
          <Button
            title={t("plan.open")}
            variant="soft"
            onPress={() => setToolsOpen(true)}
          />
        ) : null}
      </MapShell>

      <FamilyTools visible={toolsOpen} onClose={() => setToolsOpen(false)} kids={kids} />

      <Modal visible={passOpen} animationType="slide" onRequestClose={() => setPassOpen(false)} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, padding: 20, justifyContent: "center", gap: 20 }}>
          <BoardingPass />
          <Button title={t("common.close")} variant="soft" onPress={() => setPassOpen(false)} />
        </SafeAreaView>
      </Modal>
    </>
  );
}
