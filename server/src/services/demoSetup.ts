// One-off helper: add a morning route that runs on real streets to a real school, and
// move Sam and Ava onto its stops. Everyone else stays where they are.
// Used by scripts/use-my-streets.ts.
// The road path comes from Mapbox Directions, so the preview follows real roads.

import { randomUUID } from "node:crypto";
import { db } from "../data/db.js";
import { findUserByEmail, rideSessions, routes } from "../data/store.js";
import type { BusSpec, GeoPoint } from "../types.js";
import { distanceMeters } from "./geofence.js";
import type { DirectionsResult, PlaceResult } from "./mapbox.js";

export interface Deps {
  geocode: (q: string, near?: GeoPoint) => Promise<PlaceResult[]>;
  directions: (coords: GeoPoint[], bus: BusSpec) => Promise<DirectionsResult>;
}
export interface Options {
  stops: string[]; // addresses, in driving order
  school: string;
  near?: GeoPoint; // helps the search pick the right town
  apply: boolean;
}
export interface Report {
  applied: boolean;
  places: { query: string; found: string; lat: number; lng: number; others: string[] }[];
  school: { name: string; address: string };
  route: { name: string; miles: number; minutes: number; replaced: boolean };
  assignments: { student: string; stop: string }[];
}

export class SetupError extends Error {}

const LEGACY_ROUTE_NAME = "Morning Run - St. Thomas Aquinas"; // an earlier run of this script
const MOVING = ["student@wheelie.demo", "student2@wheelie.demo"]; // Sam, Ava

async function find(deps: Deps, query: string, near?: GeoPoint) {
  const results = await deps.geocode(query, near);
  if (!results.length) throw new SetupError(`Couldn't find "${query}". Try adding the town and state.`);
  return results;
}

export async function relocateDemo(opts: Options, deps: Deps): Promise<Report> {
  const school = findUserByEmail("school@wheelie.demo");
  const company = findUserByEmail("company@wheelie.demo");
  const driver = findUserByEmail("driver@wheelie.demo");
  if (!school || !company || !driver) throw new SetupError("The demo accounts aren't in this database.");

  // Look everything up first so nothing changes if something can't be found.
  const queries = [...opts.stops, opts.school];
  const found: PlaceResult[][] = [];
  for (const q of queries) found.push(await find(deps, q, opts.near));
  // Several towns have a "Teaberry Drive". Take the match closest to where you said you are.
  const picks = found.map((f) => (opts.near ? [...f].sort((a, b) => distanceMeters(a, opts.near!) - distanceMeters(b, opts.near!))[0] : f[0]));
  const reference = opts.near ?? picks[picks.length - 1];
  const stray = picks.findIndex((p) => distanceMeters(p, reference) > 30_000);
  if (stray >= 0) {
    const list = picks.map((p, i) => `  ${queries[i]}  ->  ${p.address || p.name}`).join("\n");
    throw new SetupError(
      `"${queries[stray]}" was only found far from the others (${Math.round(distanceMeters(picks[stray], reference) / 1000)} km), so it is probably in another town. Here is what the search found:\n${list}\nAdd the town and state to that address in the script, for example "61 Teaberry Drive, Edison, NJ".`
    );
  }
  const stopPicks = picks.slice(0, opts.stops.length);
  const schoolPick = picks[picks.length - 1];

  const bus = company.busSpec ?? { heightM: 3.4, widthM: 2.6, weightT: 14 };
  const dir = await deps.directions([...stopPicks, schoolPick].map((p) => ({ lat: p.lat, lng: p.lng })), bus); // keeps the stops in the order given

  const kids = MOVING.map((e) => findUserByEmail(e)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  if (!kids.length) throw new SetupError("Sam and Ava's accounts aren't in this database.");

  const stopName = (i: number) => opts.stops[i].replace(/,.*$/, "").trim();
  const assignments = kids.map((k, i) => ({ student: k.name, stop: stopName(i % stopPicks.length) }));
  const schoolName = /aquinas/i.test(schoolPick.name) ? schoolPick.name : opts.school.replace(/,.*$/, "").trim();
  const ROUTE_NAME = `Morning Run - ${opts.school.replace(/,.*$/, "").trim()}`;
  const existing = [...routes.values()].find((r) => r.name === ROUTE_NAME || r.name === LEGACY_ROUTE_NAME);

  const report: Report = {
    applied: opts.apply,
    places: queries.map((q, i) => ({
      query: q,
      found: picks[i].address || picks[i].name,
      lat: picks[i].lat,
      lng: picks[i].lng,
      others: found[i].slice(1, 3).map((o) => o.address || o.name),
    })),
    school: { name: schoolName, address: schoolPick.address },
    route: { name: ROUTE_NAME, miles: Math.round((dir.distanceM / 1609.34) * 10) / 10, minutes: Math.round(dir.durationSec / 60), replaced: Boolean(existing) },
    assignments,
  };
  if (!opts.apply) return report;

  // ---- write ----
  // Sam and Ava leave their old stops; nobody else is touched.
  for (const r of routes.values()) {
    for (const s of r.stops) s.studentIds = s.studentIds.filter((id) => !kids.some((k) => k.id === id));
  }
  const route = existing ?? {
    id: randomUUID(),
    name: ROUTE_NAME,
    direction: "to_school" as const,
    schoolLocation: { lat: schoolPick.lat, lng: schoolPick.lng },
    stops: [],
  };
  Object.assign(route, {
    name: ROUTE_NAME,
    schoolLocation: { lat: schoolPick.lat, lng: schoolPick.lng },
    companyId: company.id,
    schoolId: school.id,
    driverId: driver.id,
    status: "sent" as const,
    vehicle: bus,
    stops: stopPicks.map((p, i) => ({
      id: randomUUID(),
      name: stopName(i),
      location: { lat: p.lat, lng: p.lng },
      order: i,
      studentIds: kids.filter((_, k) => k % stopPicks.length === i).map((k) => k.id),
      radiusMeters: 75,
    })),
    geometry: dir.geometry,
    totalDistanceM: Math.round(dir.distanceM),
    totalDurationSec: Math.round(dir.durationSec),
    clearanceChecked: true,
  });
  routes.set(route.id, route);

  // A ride or learned times left from older stops on this route no longer apply.
  for (const [id, ride] of rideSessions) if (ride.routeId === route.id) rideSessions.delete(id);
  db.prepare("DELETE FROM stop_times WHERE route_id = ?").run(route.id);
  return report;
}
