import type { GeoPoint, Route, RideSession } from "../types.js";
import { distanceMeters } from "./geofence.js";

/**
 * Rudimentary ETA model: no traffic/maps API (deliberately out of scope for
 * this build — swap in a real routing provider later). We just walk the bus's
 * current position through the remaining stops in order and accumulate
 * straight-line distance / average speed. It's good enough to demonstrate
 * "removing a stop makes downstream ETAs earlier" without external services.
 */
const DEFAULT_AVG_SPEED_MPS = 8; // ~18 mph average with stop-and-go traffic

export function recomputeEtas(
  session: RideSession,
  route: Route,
  avgSpeedMps: number = session.avgSpeedMps ?? DEFAULT_AVG_SPEED_MPS
): void {
  if (!session.busLocation) {
    for (const stopId of session.remainingStopIds) {
      session.stopStates[stopId].etaSeconds = null;
    }
    return;
  }

  const stopsById = new Map(route.stops.map((s) => [s.id, s]));
  let cursor: GeoPoint = session.busLocation;
  let cumulativeSeconds = 0;

  for (const stopId of session.remainingStopIds) {
    const stop = stopsById.get(stopId);
    if (!stop) continue;
    const legMeters = distanceMeters(cursor, stop.location);
    cumulativeSeconds += legMeters / avgSpeedMps;
    session.stopStates[stopId].etaSeconds = Math.round(cumulativeSeconds);
    cursor = stop.location;
  }
}
