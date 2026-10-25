// What the history says: who will probably ride today, what looks unusual,
// where routes could be tightened, and how good our arrival estimates are.
// Everything here is plain statistics on the app's own records. The numbers are
// scoped to one bus company or one school, and nothing leaves the server.

import { config } from "../config.js";
import { db } from "../data/db.js";
import { routes, users } from "../data/store.js";
import type { Route, User } from "../types.js";
import { distanceMeters } from "./geofence.js";
import { median } from "./learning.js";
import { addDays, todayLocal } from "./time.js";

export type Scope = { col: "company_id" | "school_id"; id: string };
export const scopeOf = (u: User): Scope => (u.role === "company" ? { col: "company_id", id: u.id } : { col: "school_id", id: u.id });

export function routesInScope(scope: Scope): Route[] {
  return [...routes.values()].filter(
    (r) => r.status === "sent" && (scope.col === "company_id" ? r.companyId === scope.id : r.schoolId === scope.id)
  );
}

const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- ridership forecast --------------------------------------------------------

export interface RouteForecast {
  routeId: string;
  routeName: string;
  direction: "to_school" | "to_home";
  startTime: string | null;
  assigned: number;
  expected: number;
  plannedAbsences: number;
  unlikely: number; // students who rarely ride this day
  basedOnRides: number;
}

/** How many students will probably ride on `date`, from each student's own pattern on that weekday. */
export function forecastRidership(scope: Scope, date = todayLocal()): RouteForecast[] {
  const dow = dowOf(date);
  const since = addDays(date, -84);
  const events = db
    .prepare(
      `SELECT student_id AS sid, route_id AS rid, local_date AS d, status FROM boarding_events
       WHERE ${scope.col} = ? AND local_date >= ? AND local_date < ?`
    )
    .all(scope.id, since, date) as { sid: string; rid: string; d: string; status: string }[];
  const absences = db.prepare("SELECT student_id AS sid, direction FROM absences WHERE date = ?").all(date) as { sid: string; direction: string }[];

  const out: RouteForecast[] = [];
  for (const route of routesInScope(scope)) {
    const rides = new Set(events.filter((e) => e.rid === route.id).map((e) => e.d)).size;
    let expected = 0;
    let assigned = 0;
    let planned = 0;
    let unlikely = 0;
    for (const stop of route.stops) {
      for (const sid of stop.studentIds) {
        assigned++;
        const away = absences.some((a) => a.sid === sid && (a.direction === "both" || a.direction === route.direction));
        if (away) {
          planned++;
          continue;
        }
        const mine = events.filter((e) => e.sid === sid && e.rid === route.id && dowOf(e.d) === dow && e.status !== "skipped");
        // A student with no history is assumed to ride; a little history is pulled toward "rides".
        const boarded = mine.filter((e) => e.status === "boarded").length;
        const p = (boarded + 2) / (mine.length + 2.4);
        expected += p;
        if (mine.length >= 4 && p < 0.35) unlikely++;
      }
    }
    out.push({
      routeId: route.id,
      routeName: route.name,
      direction: route.direction,
      startTime: route.startTime ?? null,
      assigned,
      expected: round1(expected),
      plannedAbsences: planned,
      unlikely,
      basedOnRides: rides,
    });
  }
  return out.sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99") || a.routeName.localeCompare(b.routeName));
}

// ---- unusual things ------------------------------------------------------------

export interface Anomaly {
  id: string;
  kind: "slow_ride" | "late_trend" | "stopped_riding" | "incident_cluster";
  routeId: string;
  routeName: string;
  title: string;
  detail: string;
  /** Student involved, for the dashboard only. Never sent to an outside service. */
  studentId?: string;
}

const mad = (xs: number[], m: number) => median(xs.map((x) => Math.abs(x - m)));

export function findAnomalies(scope: Scope, today = todayLocal()): Anomaly[] {
  const out: Anomaly[] = [];
  const hist = db
    .prepare(
      `SELECT ride_id, route_id, route_name, direction, local_date, late_start_min, (ended_at - started_at)/60000.0 AS mins, incidents
       FROM ride_history WHERE ${scope.col} = ? AND local_date >= ? ORDER BY ended_at DESC`
    )
    .all(scope.id, addDays(today, -90)) as any[];

  const byRoute = new Map<string, any[]>();
  for (const h of hist) {
    const k = `${h.route_id}|${h.direction}`;
    byRoute.set(k, [...(byRoute.get(k) ?? []), h]);
  }

  for (const rows of byRoute.values()) {
    const { route_name: name, route_id: rid } = rows[0];
    // 1) A ride that took much longer than this route usually does.
    const base = rows.filter((r) => r.mins > 1);
    if (base.length >= 6) {
      const m = median(base.map((r) => r.mins));
      const spread = Math.max(3, 1.4826 * mad(base.map((r) => r.mins), m) * 2.5);
      for (const r of base.filter((x) => x.local_date >= addDays(today, -7))) {
        if (r.mins > m + spread) {
          out.push({
            id: `slow:${r.ride_id}`, kind: "slow_ride", routeId: rid, routeName: name,
            title: `${name} ran long on ${r.local_date}`,
            detail: `It took ${Math.round(r.mins)} min. It usually takes about ${Math.round(m)} min.`,
          });
        }
      }
    }
    // 2) Starting later and later.
    const lates = rows.filter((r) => r.late_start_min != null).map((r) => r.late_start_min as number);
    if (lates.length >= 8) {
      const recent = lates.slice(0, 5);
      const before = lates.slice(5, 15);
      const a = recent.reduce((s, x) => s + x, 0) / recent.length;
      const b = before.reduce((s, x) => s + x, 0) / before.length;
      if (a >= 5 && a - b >= 3) {
        out.push({
          id: `late:${rid}`, kind: "late_trend", routeId: rid, routeName: name,
          title: `${name} is starting later`,
          detail: `The last 5 runs started about ${Math.round(a)} min late, up from ${Math.max(0, Math.round(b))} min before.`,
        });
      }
    }
    // 3) Several incidents in two weeks.
    const recentInc = rows.filter((r) => r.local_date >= addDays(today, -14)).reduce((s, r) => s + (r.incidents ?? 0), 0);
    if (recentInc >= 3) {
      out.push({
        id: `inc:${rid}`, kind: "incident_cluster", routeId: rid, routeName: name,
        title: `${name} has had ${recentInc} problems in two weeks`,
        detail: "Delays, stops or off-route alerts keep coming up on this route. It may be worth a look at the route or the stops.",
      });
    }
  }

  // 4) A student who always rode and suddenly stopped.
  const ev = db
    .prepare(
      `SELECT student_id AS sid, student_name AS name, route_id AS rid, route_name AS rname, status
       FROM boarding_events WHERE ${scope.col} = ? AND local_date >= ? ORDER BY ended_at DESC`
    )
    .all(scope.id, addDays(today, -120)) as any[];
  const perStudent = new Map<string, any[]>();
  for (const e of ev) perStudent.set(e.sid, [...(perStudent.get(e.sid) ?? []), e]);
  for (const [sid, rows] of perStudent) {
    const recent = rows.slice(0, 3);
    const before = rows.slice(3, 23).filter((r) => r.status !== "skipped");
    if (recent.length === 3 && recent.every((r) => r.status === "missed") && before.length >= 8) {
      const rate = before.filter((r) => r.status === "boarded").length / before.length;
      if (rate >= 0.8) {
        out.push({
          id: `gone:${sid}`, kind: "stopped_riding", routeId: rows[0].rid, routeName: rows[0].rname, studentId: sid,
          title: `${rows[0].name} has missed the last 3 rides`,
          detail: `They normally ride about ${Math.round(rate * 100)}% of the time, and no absence was planned. Worth a check with the family.`,
        });
      }
    }
  }
  return out;
}

// ---- route suggestions -----------------------------------------------------------

export interface Suggestion {
  id: string;
  kind: "merge_stops" | "overlap" | "consolidate" | "overloaded";
  routeIds: string[];
  title: string;
  detail: string;
}

const studentsOn = (r: Route) => r.stops.reduce((n, s) => n + s.studentIds.length, 0);
const centroid = (r: Route) => ({
  lat: r.stops.reduce((s, x) => s + x.location.lat, 0) / Math.max(1, r.stops.length),
  lng: r.stops.reduce((s, x) => s + x.location.lng, 0) / Math.max(1, r.stops.length),
});

/** Ideas for tightening routes. They are suggestions only; a person decides. */
export function suggestRoutes(scope: Scope): Suggestion[] {
  const rs = routesInScope(scope);
  const out: Suggestion[] = [];
  const seats = config.busSeats;

  for (const r of rs) {
    const n = studentsOn(r);
    if (n > seats * 0.95) {
      out.push({
        id: `over:${r.id}`, kind: "overloaded", routeIds: [r.id],
        title: `${r.name} is close to full`,
        detail: `${n} students are assigned and a bus seats ${seats}. Moving some riders to a nearby route would help.`,
      });
    }
    // Two stops of the same route a short walk apart.
    for (let i = 0; i < r.stops.length; i++) {
      for (let j = i + 1; j < r.stops.length; j++) {
        const a = r.stops[i], b = r.stops[j];
        const d = distanceMeters(a.location, b.location);
        if (d < 250 && a.studentIds.length + b.studentIds.length <= 8) {
          out.push({
            id: `merge:${a.id}:${b.id}`, kind: "merge_stops", routeIds: [r.id],
            title: `Merge "${a.name}" and "${b.name}" on ${r.name}`,
            detail: `They are ${Math.round(d / 10) * 10} m apart and together serve ${a.studentIds.length + b.studentIds.length} students. One stop would save a stop's worth of time on every run.`,
          });
        }
      }
    }
  }

  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.schoolId !== b.schoolId || a.direction !== b.direction) continue;
      // Both buses stop at nearly the same place.
      for (const sa of a.stops) {
        const sb = b.stops.find((x) => distanceMeters(sa.location, x.location) < 150);
        if (sb && sa.studentIds.length && sb.studentIds.length) {
          out.push({
            id: `overlap:${sa.id}:${sb.id}`, kind: "overlap", routeIds: [a.id, b.id],
            title: `${a.name} and ${b.name} both stop near "${sa.name}"`,
            detail: `${sa.studentIds.length + sb.studentIds.length} students use these two stops. Serving them from one route could shorten the other.`,
          });
          break;
        }
      }
      // Two light routes close together could share a bus.
      const total = studentsOn(a) + studentsOn(b);
      if (total > 0 && total <= seats * 0.7 && distanceMeters(centroid(a), centroid(b)) < 3000) {
        out.push({
          id: `combine:${a.id}:${b.id}`, kind: "consolidate", routeIds: [a.id, b.id],
          title: `${a.name} and ${b.name} could share one bus`,
          detail: `Together they carry ${total} students, about ${Math.round((total / seats) * 100)}% of a ${seats}-seat bus, and their stops are within 3 km of each other.`,
        });
      }
    }
  }
  return out;
}

// ---- how good are the arrival estimates? --------------------------------------------

export interface EtaAccuracy {
  samples: number;
  /** Average miss in seconds when predicting a stop ~10 minutes out. */
  learnedErrorSec: number | null;
  baselineErrorSec: number | null;
  improvementPct: number | null;
}

export function etaAccuracy(scope: Scope, days = 30): EtaAccuracy {
  const rows = db
    .prepare(`SELECT predicted_sec AS p, baseline_sec AS b, actual_sec AS a FROM eta_probes WHERE ${scope.col} = ? AND created_at >= ?`)
    .all(scope.id, Date.now() - days * 86_400_000) as { p: number; b: number; a: number }[];
  if (rows.length < 5) return { samples: rows.length, learnedErrorSec: null, baselineErrorSec: null, improvementPct: null };
  const avg = (f: (r: (typeof rows)[0]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  const learned = avg((r) => Math.abs(r.p - r.a));
  const base = avg((r) => Math.abs(r.b - r.a));
  return {
    samples: rows.length,
    learnedErrorSec: Math.round(learned),
    baselineErrorSec: Math.round(base),
    improvementPct: base > 0 ? Math.round(((base - learned) / base) * 100) : null,
  };
}

export const userName = (id: string) => users.get(id)?.name ?? "A student";
