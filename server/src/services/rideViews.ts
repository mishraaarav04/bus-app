import { routes } from "../data/store.js";
import type { GeoPoint, RideSession, Route, User } from "../types.js";
import { myRidersOnRoute, nameOf } from "./access.js";
import { distanceMeters } from "./geofence.js";

const DEFAULT_SPEED = 8;

/** Route as a given user is allowed to see it. Families never see other kids' IDs. */
export function scopeRoute(user: User, route: Route): Route {
  if (user.role === "student" || user.role === "parent") {
    const mine = new Set(myRidersOnRoute(user, route));
    return {
      ...route,
      driverId: undefined,
      companyId: undefined,
      stops: route.stops
        .filter((s) => s.studentIds.some((id) => mine.has(id)))
        .map((s) => ({ ...s, studentIds: s.studentIds.filter((id) => mine.has(id)) })),
    };
  }
  return route;
}

function progress(ride: RideSession, route: Route) {
  const total = route.stops.length;
  const completed = ride.completedStopIds.length;
  const skipped = route.stops.filter(
    (s) => ride.stopStates[s.id]?.status === "skipped"
  ).length;
  const lastRemaining = ride.remainingStopIds[ride.remainingStopIds.length - 1];
  const lastState = lastRemaining ? ride.stopStates[lastRemaining] : null;
  let etaToSchoolSec: number | null = null;
  if (ride.direction === "to_school" && ride.busLocation) {
    const speed = ride.avgSpeedMps ?? DEFAULT_SPEED;
    const lastStop = route.stops.find((s) => s.id === lastRemaining);
    if (lastStop && lastState?.etaSeconds != null) {
      etaToSchoolSec = Math.round(
        lastState.etaSeconds + distanceMeters(lastStop.location, route.schoolLocation) / speed
      );
    } else if (!lastStop) {
      etaToSchoolSec = Math.round(distanceMeters(ride.busLocation, route.schoolLocation) / speed);
    }
  }
  return { total, completed, skipped, remaining: ride.remainingStopIds.length, etaToSchoolSec };
}

export interface StaffRideView {
  kind: "staff";
  session: RideSession;
  route: Route;
  routeName: string;
  names: Record<string, string>;
  progress: ReturnType<typeof progress>;
  boardedCount: number;
  riderCount: number;
}

export interface FamilyRideView {
  kind: "family";
  id: string;
  routeId: string;
  routeName: string;
  direction: Route["direction"];
  startedAt: string;
  endedAt: string | null;
  busLocation: GeoPoint | null;
  schoolLocation: GeoPoint;
  geometry?: [number, number][];
  mine: {
    studentId: string;
    name: string;
    status: string;
    stopId: string;
    stopName: string;
    stopLocation: GeoPoint;
    etaSeconds: number | null;
    boardedAt: string | null;
  }[];
}

export type RideView = StaffRideView | FamilyRideView;

export function buildRideView(user: User, ride: RideSession): RideView | null {
  const route = routes.get(ride.routeId);
  if (!route) return null;

  if (user.role === "student" || user.role === "parent") {
    const mineIds = new Set(myRidersOnRoute(user, route));
    const mine: FamilyRideView["mine"] = [];
    for (const stop of route.stops) {
      for (const sid of stop.studentIds) {
        if (!mineIds.has(sid)) continue;
        const st = ride.stopStates[stop.id];
        mine.push({
          studentId: sid,
          name: nameOf(sid),
          status: st?.studentStatuses[sid] ?? "pending",
          stopId: stop.id,
          stopName: stop.name,
          stopLocation: stop.location,
          etaSeconds: st?.status === "skipped" ? null : st?.etaSeconds ?? null,
          boardedAt: ride.boardedAt?.[sid] ?? null,
        });
      }
    }
    return {
      kind: "family",
      id: ride.id,
      routeId: route.id,
      routeName: route.name,
      direction: ride.direction,
      startedAt: ride.startedAt,
      endedAt: ride.endedAt,
      busLocation: ride.busLocation,
      schoolLocation: route.schoolLocation,
      geometry: route.geometry,
      mine,
    };
  }

  const names: Record<string, string> = {};
  for (const s of route.stops) for (const id of s.studentIds) names[id] = nameOf(id);
  const riderCount = route.stops.reduce((n, s) => n + s.studentIds.length, 0);
  const boardedCount = Object.keys(ride.boardedAt ?? {}).length;
  return {
    kind: "staff",
    session: ride,
    route,
    routeName: route.name,
    names,
    progress: progress(ride, route),
    boardedCount,
    riderCount,
  };
}
