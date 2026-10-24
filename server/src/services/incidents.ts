import { randomUUID } from "node:crypto";
import { db } from "../data/db.js";
import type { Incident, IncidentType, RideSession, Route } from "../types.js";

interface Row {
  id: string;
  ride_id: string;
  route_id: string;
  type: IncidentType;
  source: "driver" | "system";
  delay_minutes: number | null;
  note: string | null;
  created_at: number;
  resolved_at: number | null;
}

const toIncident = (r: Row): Incident => ({
  id: r.id,
  rideId: r.ride_id,
  routeId: r.route_id,
  type: r.type,
  source: r.source,
  delayMinutes: r.delay_minutes,
  note: r.note,
  createdAt: new Date(r.created_at).toISOString(),
  resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
});

export function createIncident(
  ride: RideSession,
  route: Route,
  input: { type: IncidentType; source: "driver" | "system"; delayMinutes?: number | null; note?: string | null }
): Incident {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO incidents (id, ride_id, route_id, company_id, school_id, type, source, delay_minutes, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ride.id,
    route.id,
    route.companyId ?? null,
    route.schoolId ?? null,
    input.type,
    input.source,
    input.delayMinutes ?? null,
    input.note ?? null,
    now
  );
  return toIncident(db.prepare("SELECT * FROM incidents WHERE id = ?").get(id) as Row);
}

export function getIncident(id: string): Incident | undefined {
  const r = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id) as Row | undefined;
  return r ? toIncident(r) : undefined;
}

export function resolveIncident(id: string) {
  db.prepare("UPDATE incidents SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL").run(Date.now(), id);
}

export function incidentsForRide(rideId: string): Incident[] {
  return (db.prepare("SELECT * FROM incidents WHERE ride_id = ? ORDER BY created_at DESC LIMIT 20").all(rideId) as Row[]).map(
    toIncident
  );
}

/** The newest driver-reported problem that hasn't been marked resolved. */
export function openDriverIncident(rideId: string): Incident | undefined {
  const r = db
    .prepare(
      `SELECT * FROM incidents WHERE ride_id = ? AND source = 'driver' AND resolved_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(rideId) as Row | undefined;
  return r ? toIncident(r) : undefined;
}

export function countIncidents(rideId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE ride_id = ?").get(rideId) as { n: number }).n;
}
