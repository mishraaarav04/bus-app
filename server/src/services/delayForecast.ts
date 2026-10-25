// Predicts that a ride will finish late before it does, by comparing how long
// it is on track to take with how long this route usually takes.

import { config } from "../config.js";
import type { RideSession, Route } from "../types.js";
import { distanceMeters } from "./geofence.js";
import { openDriverIncident } from "./incidents.js";
import { learnedLegs, legSeconds, startMinuteOf, typicalRide } from "./learning.js";
import { onDelayForecast } from "./rideEvents.js";

const CHECK_EVERY_MS = 15_000;
const MIN_ELAPSED_SEC = 180; // too early in the ride to say
const REALERT_EXTRA_MIN = 5; // tell families again only if it gets this much worse
const MAX_ALERTS = 2;
const lastCheck = new Map<string, number>();
const alertCount = new Map<string, number>();

export function forgetForecast(rideId: string) {
  lastCheck.delete(rideId);
  alertCount.delete(rideId);
}

/** Minutes behind the usual time this ride is predicted to finish (negative = ahead), or null if unknown. */
export function predictedDelayMinutes(ride: RideSession, route: Route, now = Date.now()): number | null {
  if (!ride.busLocation || ride.endedAt) return null;
  const startMin = startMinuteOf(ride);
  const typical = typicalRide(route, startMin);
  if (!typical) return null;

  const elapsed = (now - Date.parse(ride.startedAt)) / 1000;
  if (elapsed < MIN_ELAPSED_SEC) return null;

  const lastId = ride.remainingStopIds[ride.remainingStopIds.length - 1];
  const lastStop = route.stops.find((s) => s.id === lastId);
  let remaining: number;
  if (lastStop) {
    const eta = ride.stopStates[lastId]?.etaSeconds;
    if (eta == null) return null;
    const tail = legSeconds(learnedLegs(route, startMin), lastId, "end");
    remaining = eta + (tail ?? distanceMeters(lastStop.location, route.schoolLocation) / (ride.avgSpeedMps ?? 8));
  } else {
    remaining = distanceMeters(ride.busLocation, route.schoolLocation) / (ride.avgSpeedMps ?? 8);
  }
  return Math.round((elapsed + remaining - typical.seconds) / 60);
}

export function checkDelayForecast(ride: RideSession, route: Route, now = Date.now()) {
  if (now - (lastCheck.get(ride.id) ?? 0) < CHECK_EVERY_MS) return;
  lastCheck.set(ride.id, now);

  const delay = predictedDelayMinutes(ride, route, now);
  ride.delayForecastMin = delay == null ? undefined : Math.max(0, delay);
  if (delay == null || delay < config.delayForecastMinutes) return;
  if (openDriverIncident(ride.id)) return; // the driver already told everyone

  const told = ride.delayAlertedMin;
  const count = alertCount.get(ride.id) ?? 0;
  if (count >= MAX_ALERTS) return;
  if (told != null && delay < told + REALERT_EXTRA_MIN) return;

  ride.delayAlertedMin = delay;
  alertCount.set(ride.id, count + 1);
  onDelayForecast(ride, route, delay);
}
