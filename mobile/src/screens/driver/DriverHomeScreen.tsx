import React, { useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api } from "../../api/client";
import { getSocket } from "../../api/socket";
import { MapShell } from "../../components/MapShell";
import { MapMarker } from "../../components/MapView";
import { ScannerModal } from "../../components/ScannerModal";
import { Button, Card, Empty, ErrorText, Pill, Row, statusPill } from "../../components/ui";
import { useActiveRides } from "../../hooks/useActiveRides";
import { useLocationSharing } from "../../hooks/useLocationSharing";
import { colors, font, formatDuration, formatEta, formatMiles } from "../../theme";
import { Route, StaffRideView } from "../../types";

/**
 * Driver home. Starting a ride turns on location sharing; ending it turns it
 * off again (and the bus disappears from every family's map).
 */
export function DriverHomeScreen() {
  const { rides, refresh } = useActiveRides();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);

  const ride = (rides.find((r) => r.kind === "staff") as StaffRideView | undefined) ?? null;
  const rideId = ride?.session.id ?? null;

  useEffect(() => {
    api.listRoutes().then(setRoutes).catch((e) => setError(e.message));
  }, [rideId]);

  // GPS runs only while a ride is active.
  useLocationSharing(Boolean(rideId), (loc) => {
    setMe(loc);
    if (!rideId) return;
    const socket = getSocket();
    if (socket?.connected) socket.emit("ride:driver-location", { rideId, ...loc });
    else api.pushLocation(rideId, loc.lat, loc.lng).catch(() => {});
  });

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

  function end() {
    if (!rideId) return;
    Alert.alert("End this ride?", "Your location stops being shared with families and the school.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "End ride",
        style: "destructive",
        onPress: async () => {
          try {
            await api.endRide(rideId);
            setMe(null);
            await refresh();
          } catch (e: any) {
            Alert.alert("Couldn't end ride", e.message);
          }
        },
      },
    ]);
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

  async function onScan(token: string) {
    if (!rideId) throw new Error("Start a ride first.");
    const r = await api.checkin(rideId, token);
    return r.alreadyBoarded ? `${r.name} is already checked in` : `${r.name} checked in`;
  }

  return (
    <>
      <MapShell title="Wheelie driver" chip={ride ? <Pill text="Sharing location" tone="green" /> : undefined} map={map}>
        {ride ? (
          <>
            <Card>
              <Text style={font.h2}>{ride.routeName}</Text>
              <Row style={{ flexWrap: "wrap" }}>
                <Pill text={`${ride.boardedCount}/${ride.riderCount} checked in`} tone="green" />
                <Pill text={`${ride.progress.completed}/${ride.progress.total} stops`} tone="orange" />
                {ride.progress.etaToSchoolSec != null ? (
                  <Pill text={`School in ${formatEta(ride.progress.etaToSchoolSec)}`} tone="gray" />
                ) : null}
              </Row>
              <Button title="Scan student" onPress={() => setScanning(true)} />
            </Card>

            <Text style={font.h3}>Stops</Text>
            {[...ride.route.stops]
              .sort((a, b) => a.order - b.order)
              .map((stop) => {
                const st = ride.session.stopStates[stop.id];
                const remaining = ride.session.remainingStopIds.includes(stop.id);
                const kids = stop.studentIds.map((id) => ({
                  id,
                  name: ride.names[id] ?? "Student",
                  status: st?.studentStatuses[id] ?? "pending",
                }));
                return (
                  <Card key={stop.id} style={!remaining ? { opacity: 0.6 } : undefined}>
                    <Row>
                      <View style={{ flex: 1 }}>
                        <Text style={font.h3}>
                          {stop.order + 1}. {stop.name}
                        </Text>
                        {remaining && st?.etaSeconds != null ? (
                          <Text style={font.small}>ETA {formatEta(st.etaSeconds)}</Text>
                        ) : null}
                      </View>
                      {st?.status === "skipped" ? (
                        <Pill text="Skipped - nobody riding" tone="gray" />
                      ) : remaining ? (
                        <Button
                          title="Depart"
                          variant="soft"
                          style={{ minHeight: 40, paddingHorizontal: 16 }}
                          onPress={() => api.departStop(ride.session.id, stop.id).catch((e) => Alert.alert("Error", e.message))}
                        />
                      ) : (
                        <Pill text="Done" tone="green" />
                      )}
                    </Row>
                    {kids.map((k) => {
                      const p = statusPill(k.status);
                      return (
                        <Row key={k.id} style={{ justifyContent: "space-between" }}>
                          <Text style={font.body}>{k.name}</Text>
                          <Pill text={p.text} tone={p.tone} />
                        </Row>
                      );
                    })}
                  </Card>
                );
              })}
            <Button title="End ride" variant="danger" onPress={end} />
          </>
        ) : (
          <>
            <Text style={font.h2}>Your routes</Text>
            <Text style={font.small}>
              Starting a ride shares your location with families and the school until you end it.
            </Text>
            <ErrorText text={error} />
            {routes.length === 0 ? (
              <Empty title="No routes yet" hint="Your bus company will assign a route to you." />
            ) : (
              routes.map((r) => (
                <Card key={r.id}>
                  <Text style={font.h3}>{r.name}</Text>
                  <Text style={font.small}>
                    {r.stops.length} stops · {r.direction === "to_school" ? "to school" : "to home"}
                    {r.totalDurationSec ? ` · ${formatDuration(r.totalDurationSec)} · ${formatMiles(r.totalDistanceM)}` : ""}
                  </Text>
                  <Button title="Start ride" onPress={() => start(r.id)} loading={starting === r.id} />
                </Card>
              ))
            )}
          </>
        )}
      </MapShell>
      <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScan={onScan} />
    </>
  );
}
