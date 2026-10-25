// Learns how long each stretch of each route really takes, from past rides.
// No outside service: it reads the `stop_times` table that every ride fills in.
//
// A "leg" is the time between the bus reaching one stop and reaching the next.
// It includes the time spent waiting at the first stop, which is exactly what a
// parent wants in an arrival time.

import { db } from "../data/db.js";
import type { RideSession, Route } from "../types.js";
import { localParts } from "./time.js";

export const MIN_SAMPLES = 3;
const KEEP_SAMPLES = 25; // newest rides count most
const TIME_WINDOW_MIN = 90; // compare with rides that started at a similar time of day

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export const startMinuteOf = (ride: RideSession) => localParts(new Date(ride.startedAt)).minutes;
const legKey = (from: string, to: string) => `${from}|${to}`;

// ---- recording --------------------------------------------------------------

const insertLeg = db.prepare(
  `INSERT OR IGNORE INTO stop_times (ride_id, route_id, direction, from_stop_id, to_stop_id, start_min, local_date, leg_sec, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertProbe = db.prepare(
  `INSERT OR IGNORE INTO eta_probes (ride_id, stop_id, route_id, company_id, school_id, predicted_sec, baseline_sec, actual_sec, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

function saveLeg(ride: RideSession, route: Route, from: string, to: string, seconds: number, now: number) {
  if (seconds < 5 || seconds > 3600) return; // a pause or a GPS gap, not a real leg
  insertLeg.run(ride.id, route.id, ride.direction, from, to, startMinuteOf(ride), localParts(new Date(ride.startedAt)).date, Math.round(seconds), now);
  cache.delete(route.id);
}

/** The bus just reached `stopId`. Remember how long it took from the stop before. */
export function recordStopArrival(ride: RideSession, route: Route, stopId: string, now = Date.now()) {
  ride.arrivedAt = ride.arrivedAt ?? {};
  if (ride.arrivedAt[stopId] != null) return;

  const before = Object.entries(ride.arrivedAt).sort((a, b) => b[1] - a[1])[0];
  ride.arrivedAt[stopId] = now;
  if (before) saveLeg(ride, route, before[0], stopId, (now - before[1]) / 1000, now);

  // Score the prediction we made ~10 minutes out (see eta.ts).
  const probe = ride.etaProbe?.[stopId];
  if (probe) {
    const actual = (now - probe.at) / 1000;
    if (actual >= 5) {
      insertProbe.run(ride.id, stopId, route.id, route.companyId ?? null, route.schoolId ?? null, Math.round(probe.pred), Math.round(probe.base), Math.round(actual), now);
    }
    delete ride.etaProbe![stopId];
  }
}

/** The ride is over: the last stop to the school (or the end) is one more leg. */
export function recordFinish(ride: RideSession, route: Route, now = Date.now()) {
  const last = Object.entries(ride.arrivedAt ?? {}).sort((a, b) => b[1] - a[1])[0];
  if (last) saveLeg(ride, route, last[0], "end", (now - last[1]) / 1000, now);
}

// ---- reading ----------------------------------------------------------------

interface Learned {
  at: number;
  legs: Map<string, number>;
}
const cache = new Map<string, Learned>();
const CACHE_MS = 60_000;

/** Typical seconds for each (from stop -> to stop) leg, for rides starting around `startMin`. */
export function learnedLegs(route: Route, startMin: number): Map<string, number> {
  const hit = cache.get(route.id);
  const bucket = Math.round(startMin / 30);
  if (hit && Date.now() - hit.at < CACHE_MS && (hit as any).bucket === bucket) return hit.legs;

  const rows = db
    .prepare(
      `SELECT from_stop_id AS f, to_stop_id AS t, leg_sec AS s, start_min AS m FROM stop_times
       WHERE route_id = ? AND direction = ? ORDER BY created_at DESC LIMIT 2000`
    )
    .all(route.id, route.direction) as { f: string; t: string; s: number; m: number }[];

  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (Math.abs(r.m - startMin) > TIME_WINDOW_MIN) continue;
    const k = legKey(r.f, r.t);
    const g = groups.get(k) ?? [];
    if (g.length < KEEP_SAMPLES) g.push(r.s);
    groups.set(k, g);
  }
  const legs = new Map<string, number>();
  for (const [k, g] of groups) if (g.length >= MIN_SAMPLES) legs.set(k, median(g));

  const entry: Learned & { bucket?: number } = { at: Date.now(), legs };
  (entry as any).bucket = bucket;
  cache.set(route.id, entry);
  return legs;
}

export const legSeconds = (legs: Map<string, number>, from: string | undefined, to: string): number | undefined =>
  from ? legs.get(legKey(from, to)) : undefined;

/** How long this route usually takes from start to finish (median of recent rides), or null if we don't know yet. */
export function typicalRide(route: Route, startMin: number): { seconds: number; rides: number } | null {
  const rows = db
    .prepare(
      `SELECT (ended_at - started_at) / 1000 AS s, started_at FROM ride_history
       WHERE route_id = ? AND direction = ? ORDER BY ended_at DESC LIMIT 30`
    )
    .all(route.id, route.direction) as { s: number; started_at: number }[];
  const near = rows.filter((r) => Math.abs(localParts(new Date(r.started_at)).minutes - startMin) <= TIME_WINDOW_MIN && r.s > 60 && r.s < 4 * 3600);
  if (near.length < 4) return null;
  return { seconds: median(near.map((r) => r.s)), rides: near.length };
}

export const forgetLearning = (routeId: string) => cache.delete(routeId);
