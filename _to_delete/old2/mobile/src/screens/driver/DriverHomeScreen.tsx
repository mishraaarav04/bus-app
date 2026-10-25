import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AppState, Pressable, Text, View } from "react-native";
import { api, ApiError } from "../../api/client";
import { getSocket } from "../../api/socket";
import { MapShell } from "../../components/MapShell";
import { MapMarker } from "../../components/MapView";
import { PageModal } from "../../components/PageModal";
import { ScannerModal } from "../../components/ScannerModal";
import { Button, Card, Empty, ErrorText, Field, Pill, Row, statusPill } from "../../components/ui";
import { useActiveRides } from "../../hooks/useActiveRides";
import { useLocationSharing } from "../../hooks/useLocationSharing";
import { useT } from "../../i18n";
import { flushScans, pendingScans, submitScan } from "../../scanQueue";
import { colors, font, formatDuration, formatEta, formatMiles } from "../../theme";
import { Route, StaffRideView } from "../../types";

type ProblemType = "delay" | "breakdown" | "accident" | "other";
const DELAY_CHOICES = [5, 10, 15, 30];

/**
 * Driver home. Starting a ride turns on location sharing; ending it turns it
 * off again (and the bus disappears from every family's map).
 */
export function DriverHomeScreen({ debugOpen }: { debugOpen?: "scanner" | "problem" | "handoff" } = {}) {
  const { t } = useT();
  const { rides, refresh } = useActiveRides();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(debugOpen === "scanner");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [queued, setQueued] = useState(0);

  // "Report a problem"
  const [problemOpen, setProblemOpen] = useState(debugOpen === "problem");
  const [problem, setProblem] = useState<ProblemType>("delay");
  const [delayMin, setDelayMin] = useState(10);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [problemError, setProblemError] = useState<string | null>(null);

  // Hand-off to an adult at drop-off
  const [handoff, setHandoff] = useState<{ id: string; name: string; authorized: string[] } | null>(
    debugOpen === "handoff" ? { id: "debug", name: "Sample Student", authorized: ["Grandma", "Aunt Rosa"] } : null
  );
  const [handoffName, setHandoffName] = useState("");

  const ride = (rides.find((r) => r.kind === "staff") as StaffRideView | undefined) ?? null;
  const rideId = ride?.session.id ?? null;

  useEffect(() => {
    api.listRoutes().then(setRoutes).catch((e) => setError(e.message));
  }, [rideId]);

  // GPS runs only while a ride is active. In a development build it also keeps
  // going while the phone is locked; in Expo Go it falls back to foreground only.
  const sharing = useLocationSharing(
    Boolean(rideId),
    (loc) => {
      setMe(loc);
      if (!rideId) return;
      const socket = getSocket();
      if (socket?.connected) socket.emit("ride:driver-location", { rideId, ...loc });
      else api.pushLocation(rideId, loc.lat, loc.lng).catch(() => {});
    },
    rideId
      ? {
          rideId,
          getToken: () => api.locationToken(rideId).then((r) => r.locationToken),
          notification: { title: t("driver.bgTitle"), body: t("driver.bgBody") },
        }
      : undefined
  );

  // Send scans that were saved while offline, now and whenever we're back in the app.
  const flush = useCallback(async () => {
    if ((await pendingScans()) > 0) {
      await flushScans();
      await refresh();
    }
    setQueued(await pendingScans());
  }, [refresh]);

  useEffect(() => {
    void flush();
    const timer = setInterval(() => void flush(), 20_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && void flush());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [flush]);

  async function start(routeId: string) {
    setError(null);
    setStarting(routeId);
    try {
      await api.startRide(routeId);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(null);
    }
  }

  async function finish(force: boolean) {
    if (!rideId) return;
    try {
      await api.endRide(rideId, force);
      setMe(null);
      await refresh();
    } catch (e) {
      // The server refuses to end a ride while children may still be aboard.
      if (e instanceof ApiError && (e.code === "students_aboard" || e.code === "far_from_school")) {
        const names: string[] = e.body?.students ?? [];
        Alert.alert(
          e.code === "students_aboard" ? t("driver.aboardTitle") : t("driver.farTitle"),
          `${names.join(", ")}\n\n${t("driver.aboardBody")}`,
          [
            { text: t("driver.keepGoing"), style: "cancel" },
            { text: t("driver.endAnyway"), style: "destructive", onPress: () => void finish(true) },
          ]
        );
        return;
      }
      Alert.alert(t("driver.endFailed"), (e as Error).message);
    }
  }

  function end() {
    Alert.alert(t("driver.endQ"), t("driver.endWhy"), [
      { text: t("driver.keepGoing"), style: "cancel" },
      { text: t("driver.endRide"), style: "destructive", onPress: () => void finish(false) },
    ]);
  }

  async function sendProblem() {
    if (!rideId) return;
    setSending(true);
    setProblemError(null);
    try {
      await api.reportIncident(rideId, {
        type: problem,
        delayMinutes: problem === "delay" ? delayMin : undefined,
        note: note.trim() || undefined,
      });
      setProblemOpen(false);
      setNote("");
      await refresh();
    } catch (e: any) {
      setProblemError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function backOnRoad() {
    if (!rideId || !ride?.incident) return;
    try {
      await api.resolveIncident(rideId, ride.incident.id);
      await refresh();
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
  }

  async function dropOff(studentId: string, name: string, handedTo?: string) {
    if (!rideId) return;
    try {
      const r = await api.dropoff(rideId, studentId, handedTo);
      setHandoff(null);
      setHandoffName("");
      if (r.warning?.code === "unlisted_adult") Alert.alert(t("driver.unlistedTitle"), t("driver.unlistedBody", { name: handedTo ?? "" }));
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "needs_handoff") {
        setHandoff({ id: studentId, name, authorized: e.body?.authorizedPickups ?? [] });
        return;
      }
      Alert.alert(t("common.error"), (e as Error).message);
    }
  }

  function askDropOff(studentId: string, name: string) {
    const flags = ride?.studentFlags?.[studentId];
    if (flags?.requiresAdultPickup) {
      setHandoff({ id: studentId, name, authorized: flags.authorizedPickups });
    } else {
      void dropOff(studentId, name);
    }
  }

  const map = useMemo(() => {
    const markers: MapMarker[] = [];
    if (ride) {
      const r = ride.route;
      markers.push({ id: "school", kind: "school", lat: r.schoolLocation.lat, lng: r.schoolLocation.lng });
      [...r.stops]
        .sort((a, b) => a.order - b.order)
        .forEach((s) => {
          const st = ride.session.stopStates[s.id];
          const tone = st?.status === "skipped" ? "gray" : ride.session.completedStopIds.includes(s.id) ? "green" : "orange";
          markers.push({ id: s.id, kind: "stop", lat: s.location.lat, lng: s.location.lng, label: String(s.order + 1), tone });
        });
      const bus = me ?? ride.session.busLocation;
      if (bus) markers.push({ id: "bus", kind: "bus", ...bus });
      return { markers, line: r.geometry ?? null, fitKey: ride.session.id };
    }
    const first = routes[0];
    if (first) {
      markers.push({ id: "school", kind: "school", lat: first.schoolLocation.lat, lng: first.schoolLocation.lng });
      first.stops.forEach((s) =>
        markers.push({ id: s.id, kind: "stop", lat: s.location.lat, lng: s.location.lng, label: String(s.order + 1) })
      );
      return { markers, line: first.geometry ?? null, fitKey: first.id };
    }
    return { markers, line: null, fitKey: "none" };
  }, [ride, routes, me]);

  async function onScan(data: string): Promise<{ text: string; tone: "ok" | "warn" }> {
    if (!rideId) throw new Error(t("driver.startFirst"));
    try {
      const out = await submitScan(rideId, { token: data });
      if (out.kind === "queued") {
        setQueued(await pendingScans());
        return { text: t("scan.queued"), tone: "warn" };
      }
      const r = out.result;
      const w = r.warning;
      if (w) {
        const text =
          w.code === "was_not_riding"
            ? t("scan.wasNotRiding", { name: r.name })
            : w.code === "was_missed"
            ? t("scan.wasMissed", { name: r.name })
            : w.code === "wrong_stop"
            ? t("scan.wrongStop", { name: r.name })
            : w.message;
        return { text, tone: "warn" };
      }
      return { text: r.alreadyBoarded ? t("scan.already", { name: r.name }) : t("scan.ok", { name: r.name }), tone: "ok" };
    } catch (e) {
      // Turn the server's reason into the driver's language where we know the code.
      if (e instanceof ApiError) {
        const route = e.body?.assignedRoute as string | undefined;
        if (e.code === "expired") throw new Error(t("scan.expired"));
        if (e.code === "unknown_student") throw new Error(t("scan.unknown"));
        if (e.code === "wrong_route") throw new Error(t("scan.wrongRoute", { route: route ?? "" }));
        if (e.code === "not_assigned") throw new Error(t("scan.notAssigned"));
      }
      throw e;
    }
  }

  const incidentText = ride?.incident
    ? ride.incident.type === "delay" && ride.incident.delayMinutes
      ? t("incident.delay", { min: ride.incident.delayMinutes })
      : t(`incident.${ride.incident.type}` as any)
    : null;

  return (
    <>
      <MapShell
        title={t("driver.title")}
        chip={ride ? <Pill text={sharing.background ? t("driver.sharingBg") : t("driver.sharing")} tone="green" /> : undefined}
        map={map}
      >
        {ride ? (
          <>
            {!sharing.background && sharing.permissionGranted !== false ? (
              <Text style={font.small}>{t("driver.fgOnly")}</Text>
            ) : null}
            {sharing.permissionGranted === false ? (
              <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("driver.noGps")}</Text>
            ) : null}
            {queued > 0 ? <Pill text={t("driver.queued", { n: queued })} tone="amber" /> : null}

            {ride.incident ? (
              <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
                <Text style={{ fontWeight: "800", color: colors.warning }} accessibilityRole="alert">
                  {incidentText}
                  {ride.incident.source === "system" ? ` (${t("driver.auto")})` : ""}
                </Text>
                <Button title={t("driver.backOnRoad")} variant="outline" onPress={backOnRoad} />
              </Card>
            ) : null}

            <Card>
              <Text style={font.h2}>{ride.routeName}</Text>
              <Row style={{ flexWrap: "wrap" }}>
                <Pill text={t("driver.checkedIn", { a: ride.boardedCount, b: ride.riderCount })} tone="green" />
                <Pill text={t("driver.stopsDone", { a: ride.progress.completed, b: ride.progress.total })} tone="orange" />
                {ride.progress.etaToSchoolSec != null ? (
                  <Pill text={t("driver.schoolIn", { eta: formatEta(ride.progress.etaToSchoolSec) })} tone="gray" />
                ) : null}
              </Row>
              <Button title={t("driver.scan")} onPress={() => setScanning(true)} />
              <Button
                title={ride.incident ? t("driver.updateProblem") : t("driver.reportProblem")}
                variant="outline"
                onPress={() => setProblemOpen(true)}
              />
            </Card>

            <Text style={font.h3}>{t("driver.stops")}</Text>
            {[...ride.route.stops]
              .sort((a, b) => a.order - b.order)
              .map((stop) => {
                const st = ride.session.stopStates[stop.id];
                const remaining = ride.session.remainingStopIds.includes(stop.id);
                const kids = stop.studentIds.map((id) => ({
                  id,
                  name: ride.names[id] ?? t("common.student"),
                  status: st?.studentStatuses[id] ?? "pending",
                  dropped: !!ride.session.droppedAt?.[id],
                }));
                return (
                  <Card key={stop.id} style={!remaining ? { opacity: 0.6 } : undefined}>
                    <Row>
                      <View style={{ flex: 1 }}>
                        <Text style={font.h3}>
                          {stop.order + 1}. {stop.name}
                        </Text>
                        {remaining && st?.etaSeconds != null ? (
                          <Text style={font.small}>{t("driver.eta", { eta: formatEta(st.etaSeconds) })}</Text>
                        ) : null}
                      </View>
                      {st?.status === "skipped" ? (
                        <Pill text={t("driver.skipped")} tone="gray" />
                      ) : remaining ? (
                        <Button
                          title={t("driver.depart")}
                          variant="soft"
                          style={{ minHeight: 40, paddingHorizontal: 16 }}
                          onPress={() => api.departStop(ride.session.id, stop.id).catch((e) => Alert.alert(t("common.error"), e.message))}
                        />
                      ) : (
                        <Pill text={t("driver.done")} tone="green" />
                      )}
                    </Row>
                    {kids.map((k) => {
                      const p = k.dropped ? { text: t("status.dropped"), tone: "green" as const } : statusPill(k.status, t);
                      const canDrop = ride.session.direction === "to_home" && k.status === "boarded" && !k.dropped;
                      return (
                        <Row key={k.id} style={{ justifyContent: "space-between" }}>
                          <View style={{ flex: 1 }}>
                            <Text style={font.body}>{k.name}</Text>
                            {ride.studentFlags?.[k.id]?.requiresAdultPickup ? (
                              <Text style={font.small}>{t("driver.adultOnly")}</Text>
                            ) : null}
                          </View>
                          {canDrop ? (
                            <Button
                              title={t("driver.dropOff")}
                              variant="soft"
                              style={{ minHeight: 40, paddingHorizontal: 14 }}
                              onPress={() => askDropOff(k.id, k.name)}
                            />
                          ) : (
                            <Pill text={p.text} tone={p.tone} />
                          )}
                        </Row>
                      );
                    })}
                  </Card>
                );
              })}
            <Button title={t("driver.endRide")} variant="danger" onPress={end} />
          </>
        ) : (
          <>
            <Text style={font.h2}>{t("driver.yourRoutes")}</Text>
            <Text style={font.small}>{t("driver.startHint")}</Text>
            {queued > 0 ? <Pill text={t("driver.queued", { n: queued })} tone="amber" /> : null}
            <ErrorText text={error} />
            {routes.length === 0 ? (
              <Empty title={t("driver.noRoutes")} hint={t("driver.noRoutesHint")} />
            ) : (
              routes.map((r) => (
                <Card key={r.id}>
                  <Text style={font.h3}>{r.name}</Text>
                  <Text style={font.small}>
                    {t("driver.stopCount", { n: r.stops.length })} · {r.direction === "to_school" ? t("plan.toSchool") : t("plan.toHome")}
                    {r.startTime ? ` · ${r.startTime}` : ""}
                    {r.totalDurationSec ? ` · ${formatDuration(r.totalDurationSec)} · ${formatMiles(r.totalDistanceM)}` : ""}
                  </Text>
                  <Button title={t("driver.startRide")} onPress={() => start(r.id)} loading={starting === r.id} />
                </Card>
              ))
            )}
          </>
        )}
      </MapShell>

      <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScan={onScan} />

      <PageModal
        visible={problemOpen}
        title={t("problem.title")}
        onClose={() => setProblemOpen(false)}
        footer={<Button title={t("problem.send")} onPress={sendProblem} loading={sending} />}
      >
        <Text style={font.small}>{t("problem.hint")}</Text>
        <Row style={{ flexWrap: "wrap" }}>
          {(["delay", "breakdown", "accident", "other"] as ProblemType[]).map((p) => (
            <Pressable key={p} onPress={() => setProblem(p)} accessibilityRole="button" accessibilityState={{ selected: p === problem }}>
              <Pill text={t(`problem.${p}` as any)} tone={p === problem ? "orange" : "gray"} />
            </Pressable>
          ))}
        </Row>
        {problem === "delay" ? (
          <>
            <Text style={font.h3}>{t("problem.howLong")}</Text>
            <Row style={{ flexWrap: "wrap" }}>
              {DELAY_CHOICES.map((m) => (
                <Pressable key={m} onPress={() => setDelayMin(m)} accessibilityRole="button" accessibilityState={{ selected: m === delayMin }}>
                  <Pill text={t("problem.minutes", { n: m })} tone={m === delayMin ? "orange" : "gray"} />
                </Pressable>
              ))}
            </Row>
          </>
        ) : null}
        <Field label={t("problem.note")} value={note} onChangeText={setNote} maxLength={200} multiline />
        <ErrorText text={problemError} />
      </PageModal>

      <PageModal
        visible={!!handoff}
        title={t("handoff.title")}
        onClose={() => setHandoff(null)}
        footer={
          <Button
            title={t("handoff.confirm")}
            disabled={!handoffName.trim()}
            onPress={() => handoff && dropOff(handoff.id, handoff.name, handoffName.trim())}
          />
        }
      >
        <Text style={font.body}>{t("handoff.body", { name: handoff?.name ?? "" })}</Text>
        {handoff?.authorized.length ? (
          <>
            <Text style={font.small}>{t("handoff.authorized")}</Text>
            <Row style={{ flexWrap: "wrap" }}>
              {handoff.authorized.map((n) => (
                <Pressable key={n} onPress={() => setHandoffName(n)} accessibilityRole="button">
                  <Pill text={n} tone={handoffName === n ? "orange" : "gray"} />
                </Pressable>
              ))}
            </Row>
          </>
        ) : null}
        <Field label={t("handoff.name")} value={handoffName} onChangeText={setHandoffName} maxLength={60} />
      </PageModal>
    </>
  );
}
