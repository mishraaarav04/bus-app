import type { GeoPoint, Route, RideSession } from "../types.js";
import { distanceMeters } from "./geofence.js";
import { learnedLegs, legSeconds, startMinuteOf } from "./learning.js";

/**
 * Arrival estimates.
 *
 * Baseline: straight-line distance from the bus through the remaining stops at an
 * average speed. It works from the very first ride.
 *
 * Learned: once a route has a few finished rides, the time between each pair of
 * stops comes from what the bus actually did at about this time of day (waiting
 * at stops and traffic included). The first stretch, from the bus to the next
 * stop, uses the learned leg scaled by how much of it is left.
 *
 * Stops with no history yet fall back to the baseline one at a time.
 */
const DEFAULT_AVG_SPEED_MPS = 8; // ~18 mph average with stop-and-go traffic
const PROBE_WITHIN_SEC = 600;

export interface Estimates {
  baseline: Map<string, number>;
  learned: Map<string, number>;
  /** True if at least one leg came from history. */
  usedHistory: boolean;
}

export function estimate(session: RideSession, route: Route, avgSpeedMps: number): Estimates {
  const baseline = new Map<string, number>();
  const learned = new Map<string, number>();
  const out: Estimates = { baseline, learned, usedHistory: false };
  if (!session.busLocation) return out;

  const stopsById = new Map(route.stops.map((s) => [s.id, s]));
  const legs = learnedLegs(route, startMinuteOf(session));
  const lastArrived = Object.entries(session.arrivedAt ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];

  let bCursor: GeoPoint = session.busLocation;
  let lCursor: GeoPoint = session.busLocation;
  let bSum = 0;
  let lSum = 0;
  let prev: string | undefined = lastArrived;
  let first = true;

  for (const stopId of session.remainingStopIds) {
    const stop = stopsById.get(stopId);
    if (!stop) continue;
    const base = distanceMeters(bCursor, stop.location) / avgSpeedMps;
    bSum += base;
    baseline.set(stopId, Math.round(bSum));
    bCursor = stop.location;

    let leg = distanceMeters(lCursor, stop.location) / avgSpeedMps;
    const known = legSeconds(legs, prev, stopId);
    if (known != null) {
      out.usedHistory = true;
      leg = known;
      if (first) {
        const from = prev ? stopsById.get(prev)?.location : undefined;
        const whole = from ? distanceMeters(from, stop.location) : 0;
        const left = distanceMeters(session.busLocation, stop.location);
        if (whole > 50) leg = Math.max(5, known * Math.min(1, left / whole));
      }
    }
    lSum += leg;
    learned.set(stopId, Math.round(lSum));
    lCursor = stop.location;
    prev = stopId;
    first = false;
  }
  return out;
}

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

  const est = estimate(session, route, avgSpeedMps);
  for (const stopId of session.remainingStopIds) {
    const eta = est.learned.get(stopId);
    if (eta != null && session.stopStates[stopId]) session.stopStates[stopId].etaSeconds = eta;
  }

  // Keep one prediction per stop, made when it was within ~10 minutes, to score it on arrival.
  const next = session.remainingStopIds[0];
  const pred = next ? est.learned.get(next) : undefined;
  const base = next ? est.baseline.get(next) : undefined;
  if (next && pred != null && base != null && pred <= PROBE_WITHIN_SEC) {
    session.etaProbe = session.etaProbe ?? {};
    if (!session.etaProbe[next]) session.etaProbe[next] = { at: Date.now(), pred, base };
  }
}
