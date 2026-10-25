// What happens around a ride: who gets told, and what gets recorded.
// The route handlers call these so the rules live in one place.

import { config } from "../config.js";
import { rideSessions, users } from "../data/store.js";
import type { BoardingStatus, Incident, RideSession, Route } from "../types.js";
import { archiveRide } from "./history.js";
import { recordFinish } from "./learning.js";
import { notifyUsers } from "./notify.js";
import { familyOf, parentsOf, rideStaff } from "./rideBroadcast.js";

const firstName = (id: string) => (users.get(id)?.name ?? "Student").split(" ")[0] || "Student";
const stopOf = (route: Route, studentId: string) => route.stops.find((s) => s.studentIds.includes(studentId));

/** Students on the run whose status is one of `statuses`. */
export function ridersWith(ride: RideSession, route: Route, statuses: BoardingStatus[]): string[] {
  const out: string[] = [];
  for (const stop of route.stops) {
    for (const sid of stop.studentIds) {
      if (statuses.includes(ride.stopStates[stop.id]?.studentStatuses[sid] ?? "pending")) out.push(sid);
    }
  }
  return out;
}

const familiesOfAll = (ids: string[]) => ids.flatMap(familyOf);

export function onRideStarted(ride: RideSession, route: Route) {
  const riding = ridersWith(ride, route, ["pending", "boarded"]);
  notifyUsers(familiesOfAll(riding), {
    kind: "ride_started",
    params: { route: route.name },
    data: { rideId: ride.id },
  });
}

/** Called on every location update: sends "arriving soon" once per stop. */
export function checkApproaching(ride: RideSession, route: Route) {
  const notified = new Set(ride.approachNotified ?? []);
  const waitingStatus: BoardingStatus = ride.direction === "to_school" ? "pending" : "boarded";
  let changed = false;

  for (const stopId of ride.remainingStopIds) {
    const state = ride.stopStates[stopId];
    const stop = route.stops.find((s) => s.id === stopId);
    if (!stop || !state || state.etaSeconds == null || notified.has(stopId)) continue;
    if (state.etaSeconds > config.approachSeconds) continue;

    notified.add(stopId);
    changed = true;
    const min = Math.max(1, Math.round(state.etaSeconds / 60));
    for (const sid of stop.studentIds) {
      if (state.studentStatuses[sid] !== waitingStatus) continue;
      notifyUsers(familyOf(sid), {
        kind: "approaching",
        params: { name: firstName(sid), stop: stop.name, min },
        data: { rideId: ride.id, studentId: sid },
      });
    }
  }
  if (changed) ride.approachNotified = [...notified];
}

const WHEN: Record<string, Record<string, string>> = {
  en: { to_school: "to school", to_home: "home", both: "both ways" },
  es: { to_school: "a la escuela", to_home: "a casa", both: "ida y vuelta" },
  pt: { to_school: "para a escola", to_home: "para casa", both: "ida e volta" },
};

/**
 * A student (or another parent) marked a child "not riding" on a live run.
 * The other adults in the family hear about it right away.
 */
export function onNotRiding(ride: RideSession, route: Route, studentId: string, actorId: string) {
  const actor = users.get(actorId);
  const who = actorId === studentId ? firstName(studentId) : (actor?.name ?? "A parent").split(" ")[0];
  notifyUsers(
    parentsOf(studentId).filter((id) => id !== actorId),
    {
      kind: "not_riding",
      params: { name: firstName(studentId), who, route: route.name },
      data: { rideId: ride.id, studentId },
    }
  );
}

/** A day off the bus was planned ahead of time. */
export function onAbsencePlanned(studentId: string, actorId: string, date: string, direction: string) {
  const actor = users.get(actorId);
  const who = actorId === studentId ? firstName(studentId) : (actor?.name ?? "A parent").split(" ")[0];
  const targets = parentsOf(studentId).filter((id) => id !== actorId);
  for (const id of new Set(targets)) {
    const lang = users.get(id)?.lang ?? "en";
    notifyUsers([id], {
      kind: "absence_planned",
      params: {
        name: firstName(studentId),
        who,
        date: new Date(`${date}T12:00:00`).toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" }),
        when: (WHEN[lang] ?? WHEN.en)[direction] ?? direction,
      },
      data: { studentId, date, direction },
    });
  }
}

export function onBoarded(ride: RideSession, route: Route, studentId: string) {
  notifyUsers(parentsOf(studentId), {
    kind: "boarded",
    params: { name: firstName(studentId), route: route.name },
    at: ride.boardedAt?.[studentId],
    data: { rideId: ride.id, studentId },
  });
}

export function onMissed(ride: RideSession, route: Route, studentIds: string[]) {
  for (const sid of studentIds) {
    notifyUsers(familyOf(sid), {
      kind: "missed",
      params: { name: firstName(sid), stop: stopOf(route, sid)?.name ?? "" },
      data: { rideId: ride.id, studentId: sid },
    });
  }
}

export function onDropoff(ride: RideSession, route: Route, studentId: string) {
  const drop = ride.droppedAt?.[studentId];
  if (!drop) return;
  const stop = route.stops.find((s) => s.id === drop.stopId);
  notifyUsers(parentsOf(studentId), {
    kind: "dropped",
    bodyKey: drop.handedTo ? "dropped_to_b" : undefined,
    params: { name: firstName(studentId), stop: stop?.name ?? "", who: drop.handedTo ?? "" },
    at: drop.at,
    data: { rideId: ride.id, studentId },
  });
}

/** Staff and families hear about a problem the driver reported. */
export function onIncident(ride: RideSession, route: Route, incident: Incident) {
  const kind = incident.type; // delay | breakdown | accident | other
  const params = { route: route.name, min: incident.delayMinutes ?? 0 };
  const bodyKey = kind === "delay" && !incident.delayMinutes ? "delay_generic_b" : undefined;
  const riding = ridersWith(ride, route, ["pending", "boarded"]);
  const staff = rideStaff(ride, route).filter((id) => id !== ride.driverId);
  notifyUsers([...familiesOfAll(riding), ...staff], {
    kind,
    bodyKey,
    params,
    data: { rideId: ride.id, incidentId: incident.id },
  });
}

export function onIncidentResolved(ride: RideSession, route: Route) {
  const riding = ridersWith(ride, route, ["pending", "boarded"]);
  const staff = rideStaff(ride, route).filter((id) => id !== ride.driverId);
  notifyUsers([...familiesOfAll(riding), ...staff], {
    kind: "resolved",
    params: { route: route.name },
    data: { rideId: ride.id },
  });
}

/** Ride is over: record arrivals, tell families, save the permanent record. */
export function onRideEnded(ride: RideSession, route: Route, missed: string[]) {
  onMissed(ride, route, missed);

  // To-school run: everyone aboard when it ends has arrived at school.
  if (ride.direction === "to_school") {
    ride.droppedAt = ride.droppedAt ?? {};
    for (const sid of ridersWith(ride, route, ["boarded"])) {
      if (ride.droppedAt[sid]) continue;
      ride.droppedAt[sid] = { at: ride.endedAt ?? new Date().toISOString(), stopId: null };
      notifyUsers(parentsOf(sid), {
        kind: "arrived",
        params: { name: firstName(sid), route: route.name },
        at: ride.droppedAt[sid].at,
        data: { rideId: ride.id, studentId: sid },
      });
    }
  }

  recordFinish(ride, route);
  archiveRide(ride, route);
}

/** The ride is on track to finish later than usual. Families and staff get an early heads-up. */
export function onDelayForecast(ride: RideSession, route: Route, minutes: number) {
  const riding = ridersWith(ride, route, ["pending", "boarded"]);
  const staff = rideStaff(ride, route).filter((id) => id !== ride.driverId);
  notifyUsers([...familiesOfAll(riding), ...staff], {
    kind: "delay_forecast",
    params: { route: route.name, min: minutes },
    data: { rideId: ride.id },
  });
}

// Finished rides stay in memory briefly so a family's screen can show "arrived",
// then drop out (their permanent record is in the history tables).
const KEEP_ENDED_MS = 30 * 60_000;
export function sweepEndedRides(now = Date.now()) {
  for (const [id, ride] of rideSessions) {
    if (ride.endedAt && now - Date.parse(ride.endedAt) > KEEP_ENDED_MS) rideSessions.delete(id);
  }
}
