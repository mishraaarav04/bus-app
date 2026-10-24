// Permanent record of a finished ride: one summary row plus one row per
// assigned student. Reports, CSV exports and a family's ride history read these.

import { db } from "../data/db.js";
import { users } from "../data/store.js";
import type { RideSession, Route } from "../types.js";
import { countIncidents } from "./incidents.js";
import { hhmmToMinutes, localParts } from "./time.js";

export function archiveRide(ride: RideSession, route: Route) {
  const ended = new Date(ride.endedAt ?? Date.now());
  const started = new Date(ride.startedAt);
  const local = localParts(started);

  let late: number | null = null;
  if (route.startTime) late = Math.max(-120, Math.round(local.minutes - hhmmToMinutes(route.startTime)));

  const driver = users.get(ride.driverId);
  const insertEvent = db.prepare(
    `INSERT INTO boarding_events (ride_id, student_id, student_name, route_id, route_name, school_id, company_id,
       direction, local_date, stop_name, status, boarded_at, dropped_at, handed_to, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let riders = 0;
  let boarded = 0;
  let missed = 0;
  let skipped = 0;
  let dropped = 0;

  db.transaction(() => {
    for (const stop of route.stops) {
      for (const sid of stop.studentIds) {
        const status = ride.stopStates[stop.id]?.studentStatuses[sid] ?? "pending";
        const boardedAt = ride.boardedAt?.[sid];
        const drop = ride.droppedAt?.[sid];
        riders++;
        if (status === "boarded") boarded++;
        else if (status === "missed") missed++;
        else if (status === "skipped") skipped++;
        if (drop) dropped++;
        insertEvent.run(
          ride.id,
          sid,
          users.get(sid)?.name ?? "Student",
          route.id,
          route.name,
          route.schoolId ?? null,
          route.companyId ?? null,
          ride.direction,
          local.date,
          stop.name,
          status,
          boardedAt ? Date.parse(boardedAt) : null,
          drop ? Date.parse(drop.at) : null,
          drop?.handedTo ?? null,
          ended.getTime()
        );
      }
    }

    db.prepare(
      `INSERT OR REPLACE INTO ride_history (ride_id, route_id, route_name, school_id, company_id, driver_id, driver_name,
         direction, started_at, ended_at, local_date, scheduled_start, late_start_min, stops_total, stops_skipped,
         riders, boarded, missed, skipped, dropped, incidents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ride.id,
      route.id,
      route.name,
      route.schoolId ?? null,
      route.companyId ?? null,
      ride.driverId,
      driver?.name ?? null,
      ride.direction,
      started.getTime(),
      ended.getTime(),
      local.date,
      route.startTime ?? null,
      late,
      route.stops.length,
      route.stops.filter((s) => ride.stopStates[s.id]?.status === "skipped").length,
      riders,
      boarded,
      missed,
      skipped,
      dropped,
      countIncidents(ride.id)
    );
  })();
}
