// Watches live bus positions for trouble the driver may not report:
// leaving the planned road, or sitting still away from any stop.
// State here is only short-term bookkeeping, so it isn't saved.

import { config } from "../config.js";
import { users } from "../data/store.js";
import type { GeoPoint, RideSession, Route } from "../types.js";
import { distanceMeters } from "./geofence.js";
import { distanceToPolylineMeters } from "./geometry.js";
import { createIncident, openDriverIncident } from "./incidents.js";
import { notifyUsers } from "./notify.js";
import { rideStaff } from "./rideBroadcast.js";

interface State {
  offStreak: number;
  offAlertAt: number;
  anchor: GeoPoint;
  anchorAt: number;
  stoppedAlerted: boolean;
}
const states = new Map<string, State>();

const OFF_STREAK_NEEDED = 3; // consecutive pings, so GPS jitter doesn't trigger it
const OFF_REALERT_MS = 10 * 60_000;
const MOVED_METERS = 40;

export function forgetRide(rideId: string) {
  states.delete(rideId);
}

export function monitorLocation(ride: RideSession, route: Route, now = Date.now()) {
  const loc = ride.busLocation;
  if (!loc || ride.endedAt) return;

  let st = states.get(ride.id);
  if (!st) {
    st = { offStreak: 0, offAlertAt: 0, anchor: loc, anchorAt: now, stoppedAlerted: false };
    states.set(ride.id, st);
  }

  // Close to the school or a stop that's still ahead is never "off route".
  const places: { p: GeoPoint; r: number }[] = [
    { p: route.schoolLocation, r: 250 },
    ...route.stops.map((s) => ({ p: s.location, r: Math.max(s.radiusMeters, 100) * 2 })),
  ];
  const nearAPlace = places.some(({ p, r }) => distanceMeters(loc, p) <= r);

  // ---- off route ------------------------------------------------------------
  // Hand-built demo routes have straight-line geometry, not roads, so skip them.
  if (route.geometry && route.geometry.length >= 2 && route.clearanceChecked) {
    const off = distanceToPolylineMeters(loc, route.geometry);
    st.offStreak = off > config.offRouteMeters && !nearAPlace ? st.offStreak + 1 : 0;
    if (st.offStreak >= OFF_STREAK_NEEDED && now - st.offAlertAt > OFF_REALERT_MS) {
      st.offAlertAt = now;
      raise(ride, route, "off_route", { m: Math.round(off / 10) * 10 });
    }
  }

  // ---- stopped ----------------------------------------------------------------
  if (distanceMeters(loc, st.anchor) > MOVED_METERS) {
    st.anchor = loc;
    st.anchorAt = now;
    st.stoppedAlerted = false;
  } else if (
    !st.stoppedAlerted &&
    now - st.anchorAt >= config.stationarySeconds * 1000 &&
    !nearAPlace &&
    !openDriverIncident(ride.id) // the driver already told everyone
  ) {
    st.stoppedAlerted = true;
    raise(ride, route, "stopped", { min: Math.round((now - st.anchorAt) / 60_000) });
  }
}

function raise(
  ride: RideSession,
  route: Route,
  type: "off_route" | "stopped",
  params: Record<string, number>
) {
  const incident = createIncident(ride, route, { type, source: "system", note: JSON.stringify(params) });
  // Company, school and the driver (so they know the office has noticed).
  const recipients = rideStaff(ride, route).filter((id) => users.has(id));
  notifyUsers(recipients, {
    kind: type,
    params: { route: route.name, ...params },
    data: { rideId: ride.id, incidentId: incident.id },
  });
}
