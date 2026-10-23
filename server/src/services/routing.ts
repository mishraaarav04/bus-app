import type {
  Route,
  Stop,
  RideSession,
  StopRideState,
  BoardingStatus,
} from "../types.js";
import { distanceMeters, isWithinGeofence } from "./geofence.js";
import { recomputeEtas } from "./eta.js";

/**
 * Speed that makes our straight-line ETA model add up to the Mapbox drive time
 * for the whole run. Falls back to the default model when the route has no
 * Mapbox timing (demo/hand-built routes).
 */
function calibratedSpeed(route: Route): number | undefined {
  if (!route.totalDurationSec || route.totalDurationSec <= 0) return undefined;
  const ordered = [...route.stops].sort((a, b) => a.order - b.order).map((s) => s.location);
  const path =
    route.direction === "to_school"
      ? [...ordered, route.schoolLocation]
      : [route.schoolLocation, ...ordered];
  let meters = 0;
  for (let i = 1; i < path.length; i++) meters += distanceMeters(path[i - 1], path[i]);
  if (meters <= 0) return undefined;
  return Math.min(25, Math.max(2, meters / route.totalDurationSec));
}

/**
 * Builds a fresh live ride session from a planned route. Every stop starts
 * "pending" with every assigned student "pending".
 */
export function startRideSession(
  id: string,
  route: Route,
  driverId: string
): RideSession {
  const stopStates: Record<string, StopRideState> = {};
  for (const stop of route.stops) {
    const studentStatuses: Record<string, BoardingStatus> = {};
    for (const studentId of stop.studentIds) {
      studentStatuses[studentId] = "pending";
    }
    stopStates[stop.id] = {
      stopId: stop.id,
      status: "pending",
      studentStatuses,
      etaSeconds: null,
    };
  }

  return {
    id,
    routeId: route.id,
    driverId,
    direction: route.direction,
    startedAt: new Date().toISOString(),
    endedAt: null,
    busLocation: null,
    remainingStopIds: [...route.stops]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id),
    stopStates,
    completedStopIds: [],
    avgSpeedMps: calibratedSpeed(route),
    boardedAt: {},
  };
}

/**
 * A student tapped in on the driver's phone. Marks them boarded wherever they
 * are in the plan (a late tap after "missed" still counts - they're on the bus).
 */
export function checkInStudent(
  session: RideSession,
  route: Route,
  studentId: string
): { ok: boolean; alreadyBoarded: boolean; stopId: string | null } {
  const stop = route.stops.find((s) => s.studentIds.includes(studentId));
  const state = stop && session.stopStates[stop.id];
  if (!stop || !state) return { ok: false, alreadyBoarded: false, stopId: null };

  if (state.studentStatuses[studentId] === "boarded") {
    return { ok: true, alreadyBoarded: true, stopId: stop.id };
  }
  state.studentStatuses[studentId] = "boarded";
  session.boardedAt = { ...(session.boardedAt ?? {}), [studentId]: new Date().toISOString() };

  if (session.remainingStopIds.includes(stop.id) && state.status !== "skipped") {
    const stillPending = stop.studentIds.some((id) => state.studentStatuses[id] === "pending");
    // Only the stop being served right now flips to boarded; the driver's
    // "depart" still decides when the stop is finished.
    if (!stillPending && state.status === "pending" && session.busLocation) {
      if (isWithinGeofence(session.busLocation, stop.location, stop.radiusMeters)) {
        state.status = "boarded";
      }
    }
  }
  return { ok: true, alreadyBoarded: false, stopId: stop.id };
}

export function endRide(session: RideSession): void {
  if (session.endedAt) return;
  session.endedAt = new Date().toISOString();
  // Anyone still waiting when the ride ends is simply recorded as missed.
  for (const stopId of session.remainingStopIds) {
    const st = session.stopStates[stopId];
    for (const [sid, status] of Object.entries(st.studentStatuses)) {
      if (status === "pending") st.studentStatuses[sid] = "missed";
    }
  }
  session.busLocation = null; // location sharing is over - don't keep a stale position
}

/**
 * The reroute-on-skip feature: a student (or their parent) flags that they
 * are NOT riding this trip. If that empties out a still-upcoming stop (no
 * other student at that stop still pending), the stop is pulled out of the
 * live route immediately — the bus's plan skips straight to the next stop —
 * and ETAs are recomputed so everyone downstream sees the earlier arrival.
 *
 * If other students at the same stop are still riding, the stop stays on
 * the route; only that student's own status is marked "skipped".
 */
export function markStudentNotRiding(
  session: RideSession,
  route: Route,
  studentId: string
): { rerouted: boolean; skippedStopId: string | null } {
  const stop = route.stops.find((s) => s.studentIds.includes(studentId));
  if (!stop) return { rerouted: false, skippedStopId: null };

  const stopState = session.stopStates[stop.id];
  if (!stopState || !session.remainingStopIds.includes(stop.id)) {
    // Stop already passed/completed — nothing to reroute.
    return { rerouted: false, skippedStopId: null };
  }

  stopState.studentStatuses[studentId] = "skipped";

  const anyoneElseStillPending = stop.studentIds.some(
    (id) => id !== studentId && stopState.studentStatuses[id] === "pending"
  );

  if (anyoneElseStillPending) {
    // Stop still needed for another rider — no reroute, just record it.
    return { rerouted: false, skippedStopId: null };
  }

  // Nobody left waiting at this stop: pull it out of the live route.
  stopState.status = "skipped";
  stopState.skippedReason = "no_riders";
  session.remainingStopIds = session.remainingStopIds.filter(
    (id) => id !== stop.id
  );

  recomputeEtas(session, route);
  return { rerouted: true, skippedStopId: stop.id };
}

/**
 * Called on every bus location update. Detects boarding (student device
 * enters the stop's geofence while the stop is still next-up) and detects
 * a missed bus (bus has moved on past the stop's geofence while a student
 * was never marked boarded).
 */
export function evaluateGeofences(
  session: RideSession,
  route: Route,
  studentLocations: Record<string, { lat: number; lng: number }>
): void {
  if (!session.busLocation) return;
  const stopsById = new Map(route.stops.map((s) => [s.id, s]));

  for (const stopId of [...session.remainingStopIds]) {
    const stop = stopsById.get(stopId);
    const stopState = session.stopStates[stopId];
    if (!stop || !stopState) continue;

    const busAtStop = isWithinGeofence(
      session.busLocation,
      stop.location,
      stop.radiusMeters
    );

    for (const studentId of stop.studentIds) {
      if (stopState.studentStatuses[studentId] !== "pending") continue;
      const studentLoc = studentLocations[studentId];
      if (
        studentLoc &&
        isWithinGeofence(studentLoc, stop.location, stop.radiusMeters) &&
        busAtStop
      ) {
        stopState.studentStatuses[studentId] = "boarded";
      }
    }

    const stillPending = stop.studentIds.some(
      (id) => stopState.studentStatuses[id] === "pending"
    );

    if (busAtStop) {
      stopState.status = stillPending ? "pending" : "boarded";
    }
  }
}

/**
 * Called when the bus departs a stop's geofence (or the driver advances the
 * route manually). Anyone still "pending" at that stop is marked "missed",
 * the stop moves to completed, and ETAs are recomputed for what's left.
 */
export function advancePastStop(
  session: RideSession,
  route: Route,
  stopId: string
): void {
  const stopState = session.stopStates[stopId];
  if (!stopState || !session.remainingStopIds.includes(stopId)) return;

  for (const [studentId, status] of Object.entries(stopState.studentStatuses)) {
    if (status === "pending") {
      stopState.studentStatuses[studentId] = "missed";
    }
  }

  const anyMissed = Object.values(stopState.studentStatuses).includes(
    "missed"
  );
  stopState.status = anyMissed ? "missed" : "boarded";

  session.remainingStopIds = session.remainingStopIds.filter(
    (id) => id !== stopId
  );
  session.completedStopIds.push(stopId);

  recomputeEtas(session, route);
}

export function updateBusLocation(
  session: RideSession,
  route: Route,
  location: { lat: number; lng: number }
): void {
  session.busLocation = location;
  recomputeEtas(session, route);
}
