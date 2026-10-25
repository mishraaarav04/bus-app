import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../data/db.js";
import { findStudentByTag, rideSessions, routes as routeStore, users } from "../data/store.js";
import {
  requireAuth,
  requireRole,
  signBoardingToken,
  signLocationToken,
  verifyBoardingToken,
  verifyLocationToken,
} from "../security/auth.js";
import {
  checkinSchema,
  departSchema,
  dropoffSchema,
  endRideSchema,
  incidentSchema,
  locationSchema,
  notRidingSchema,
  startRideSchema,
} from "../schemas.js";
import { absentTodayOnRoute } from "../services/absences.js";
import { activeRideFor, activeRidesFor, canViewRide, myRidersOnRoute } from "../services/access.js";
import { audit } from "../services/audit.js";
import { distanceMeters } from "../services/geofence.js";
import { createIncident, getIncident, openDriverIncident, resolveIncident } from "../services/incidents.js";
import { monitorLocation, forgetRide } from "../services/monitor.js";
import { checkDelayForecast, forgetForecast } from "../services/delayForecast.js";
import { broadcastRide } from "../services/rideBroadcast.js";
import {
  checkApproaching,
  onBoarded,
  onNotRiding,
  onDropoff,
  onIncident,
  onIncidentResolved,
  onMissed,
  onRideEnded,
  onRideStarted,
} from "../services/rideEvents.js";
import { buildRideView } from "../services/rideViews.js";
import {
  advancePastStop,
  checkInStudent,
  endRide,
  evaluateGeofences,
  markStudentNotRiding,
  startRideSession,
  updateBusLocation,
} from "../services/routing.js";
import { config } from "../config.js";
import type { RideSession, Route } from "../types.js";

export const ridesRouter = Router();

/** Applies a bus position. Shared by REST and the socket so both obey the same rules. */
export function applyDriverLocation(ride: RideSession, loc: { lat: number; lng: number }) {
  const route = routeStore.get(ride.routeId);
  if (!route || ride.endedAt) return false;
  updateBusLocation(ride, route, loc);
  evaluateGeofences(ride, route, {}); // students don't share location; boarding is by tap
  checkApproaching(ride, route);
  monitorLocation(ride, route);
  checkDelayForecast(ride, route);
  broadcastRide(ride);
  return true;
}

function ownRide(req: Request, res: Response): { ride: RideSession; route: Route } | null {
  const ride = rideSessions.get(req.params.id);
  const route = ride && routeStore.get(ride.routeId);
  if (!ride || !route || ride.driverId !== req.user!.id) {
    res.status(404).json({ error: "Ride not found." });
    return null;
  }
  return { ride, route };
}

// ---- location ---------------------------------------------------------------

// The phone's background task can't safely hold a full sign-in, so it posts with
// a narrow token that only works for this one ride's location. Normal access
// tokens are accepted too.
function authForLocation(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const loc = token ? verifyLocationToken(token) : null;
  if (loc) {
    const user = users.get(loc.driverId);
    if (!user || user.role !== "driver" || loc.rideId !== req.params.id) {
      return res.status(401).json({ error: "Please sign in again." });
    }
    req.user = user;
    return next();
  }
  return requireAuth(req, res, () => requireRole("driver")(req, res, next));
}

ridesRouter.post("/rides/:id/location", authForLocation, (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid location." });
  if (!applyDriverLocation(own.ride, parsed.data)) return res.status(409).json({ error: "Ride has ended." });
  res.json({ ok: true });
});

// Everything below needs a normal sign-in. (Scoped by path so routers mounted
// after this one aren't affected.)
ridesRouter.use(["/rides", "/students/me/boarding-token"], requireAuth);

// Driver activates a ride: this is when location sharing begins.
ridesRouter.post("/rides/start", requireRole("driver"), (req, res) => {
  const parsed = startRideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a route." });
  const route = routeStore.get(parsed.data.routeId);
  if (!route || route.driverId !== req.user!.id || route.status !== "sent") {
    return res.status(404).json({ error: "Route not found." });
  }
  const existing = activeRideFor(route.id);
  if (existing) {
    return res.json({ ...buildRideView(req.user!, existing), locationToken: signLocationToken(req.user!.id, existing.id) });
  }
  const busy = [...rideSessions.values()].find((r) => !r.endedAt && r.driverId === req.user!.id);
  if (busy) return res.status(409).json({ error: "You already have a ride running. End it first." });

  const ride = startRideSession(randomUUID(), route, req.user!.id);
  rideSessions.set(ride.id, ride);

  // Anyone with a planned absence today is skipped, using the same reroute logic.
  for (const sid of absentTodayOnRoute(route)) markStudentNotRiding(ride, route, sid);

  onRideStarted(ride, route);
  audit(req.user!, { action: "ride.start", targetType: "ride", targetId: ride.id, companyId: route.companyId, schoolId: route.schoolId, meta: { route: route.name } }, req);
  broadcastRide(ride, "ride:started");
  res.status(201).json({ ...buildRideView(req.user!, ride), locationToken: signLocationToken(req.user!.id, ride.id) });
});

// Every live ride this user is allowed to see (scoped to what their role may know).
ridesRouter.get("/rides/active", (req, res) => {
  const views = activeRidesFor(req.user!)
    .map((r) => buildRideView(req.user!, r))
    .filter(Boolean);
  res.json(views);
});

ridesRouter.get("/rides/:id", (req, res) => {
  const ride = rideSessions.get(req.params.id);
  if (!ride || !canViewRide(req.user!, ride)) return res.status(404).json({ error: "Ride not found." });
  res.json(buildRideView(req.user!, ride));
});

// Used when the app is reopened mid-ride so background sharing can continue.
ridesRouter.post("/rides/:id/location-token", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });
  res.json({ locationToken: signLocationToken(req.user!.id, own.ride.id) });
});

// Student or parent flags "not riding today" - this is what triggers the live reroute.
ridesRouter.post("/rides/:id/not-riding", requireRole("student", "parent"), (req, res) => {
  const ride = rideSessions.get(req.params.id);
  const route = ride && routeStore.get(ride.routeId);
  if (!ride || !route || !canViewRide(req.user!, ride)) {
    return res.status(404).json({ error: "Ride not found." });
  }
  if (ride.endedAt) return res.status(409).json({ error: "Ride has ended." });

  const parsed = notRidingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  if (!myRidersOnRoute(req.user!, route).includes(parsed.data.studentId)) {
    return res.status(403).json({ error: "That isn't your student." });
  }
  const result = markStudentNotRiding(ride, route, parsed.data.studentId);
  onNotRiding(ride, route, parsed.data.studentId, req.user!.id);
  broadcastRide(ride);
  res.json({ rerouted: result.rerouted });
});

ridesRouter.post("/rides/:id/depart-stop", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  const parsed = departSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid stop." });
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });
  const missed = advancePastStop(own.ride, own.route, parsed.data.stopId);
  onMissed(own.ride, own.route, missed);
  broadcastRide(own.ride);
  res.json(buildRideView(req.user!, own.ride));
});

// ---- problems and delays ------------------------------------------------------

ridesRouter.post("/rides/:id/incidents", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });
  const parsed = incidentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose what's happening." });

  // Stops an accidental double-tap from alerting everyone twice.
  const last = db
    .prepare("SELECT created_at FROM incidents WHERE ride_id = ? AND source = 'driver' ORDER BY created_at DESC LIMIT 1")
    .get(own.ride.id) as { created_at: number } | undefined;
  if (last && Date.now() - last.created_at < 30_000) {
    return res.status(429).json({ error: "You just sent an alert. Wait a moment before sending another." });
  }

  const incident = createIncident(own.ride, own.route, {
    type: parsed.data.type,
    source: "driver",
    delayMinutes: parsed.data.delayMinutes ?? null,
    note: parsed.data.note ?? null,
  });
  onIncident(own.ride, own.route, incident);
  broadcastRide(own.ride);
  res.status(201).json(incident);
});

ridesRouter.post("/rides/:id/incidents/:incidentId/resolve", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  const incident = getIncident(req.params.incidentId);
  if (!incident || incident.rideId !== own.ride.id) return res.status(404).json({ error: "Alert not found." });
  if (!incident.resolvedAt) {
    resolveIncident(incident.id);
    if (!openDriverIncident(own.ride.id)) onIncidentResolved(own.ride, own.route);
    broadcastRide(own.ride);
  }
  res.json({ ok: true });
});

// ---- drop-off ---------------------------------------------------------------------

ridesRouter.post("/rides/:id/dropoff", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });
  const parsed = dropoffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const { studentId, handedTo } = parsed.data;

  const stop = own.route.stops.find((s) => s.studentIds.includes(studentId));
  const status = stop && own.ride.stopStates[stop.id]?.studentStatuses[studentId];
  if (!stop || status !== "boarded") return res.status(409).json({ error: "That student isn't on the bus." });
  if (own.ride.droppedAt?.[studentId]) return res.json({ ok: true, alreadyDropped: true });

  const student = users.get(studentId);
  if (own.ride.direction === "to_home" && student?.requiresAdultPickup && !handedTo) {
    return res.status(400).json({
      code: "needs_handoff",
      error: `Name the adult who received ${student.name.split(" ")[0]}.`,
      authorizedPickups: student.authorizedPickups ?? [],
    });
  }

  own.ride.droppedAt = {
    ...(own.ride.droppedAt ?? {}),
    [studentId]: {
      at: new Date().toISOString(),
      stopId: own.ride.direction === "to_home" ? stop.id : null,
      ...(handedTo ? { handedTo } : {}),
    },
  };
  onDropoff(own.ride, own.route, studentId);
  broadcastRide(own.ride);

  // Tell the driver if the adult isn't one the parent listed (it's recorded either way).
  const listed = student?.authorizedPickups ?? [];
  const unlisted =
    Boolean(handedTo) && listed.length > 0 && !listed.some((n) => n.toLowerCase() === handedTo!.toLowerCase());
  res.json({ ok: true, warning: unlisted ? { code: "unlisted_adult" } : undefined });
});

// End of ride: location sharing stops and the bus disappears from family maps.
ridesRouter.post("/rides/:id/end", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  const parsed = endRideSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  if (own.ride.endedAt) return res.json(buildRideView(req.user!, own.ride));

  // Safety net against leaving a child on the bus.
  if (!parsed.data.force) {
    const aboard: string[] = [];
    for (const stop of own.route.stops) {
      for (const sid of stop.studentIds) {
        if (own.ride.stopStates[stop.id]?.studentStatuses[sid] === "boarded" && !own.ride.droppedAt?.[sid]) aboard.push(sid);
      }
    }
    const names = aboard.map((id) => users.get(id)?.name ?? "Student");
    if (aboard.length && own.ride.direction === "to_home") {
      return res.status(409).json({
        code: "students_aboard",
        error: `${aboard.length} student${aboard.length > 1 ? "s are" : " is"} still on the bus.`,
        students: names,
      });
    }
    if (
      aboard.length &&
      own.ride.direction === "to_school" &&
      own.ride.busLocation &&
      distanceMeters(own.ride.busLocation, own.route.schoolLocation) > 500
    ) {
      return res.status(409).json({
        code: "far_from_school",
        error: "The bus isn't at the school yet and students are aboard.",
        students: names,
      });
    }
  }

  const missed = endRide(own.ride);
  forgetRide(own.ride.id);
  forgetForecast(own.ride.id);
  onRideEnded(own.ride, own.route, missed);
  audit(req.user!, { action: "ride.end", targetType: "ride", targetId: own.ride.id, companyId: own.route.companyId, schoolId: own.route.schoolId, meta: { route: own.route.name, forced: Boolean(parsed.data.force) } }, req);
  broadcastRide(own.ride);
  res.json(buildRideView(req.user!, own.ride));
});

// ---- tap-in -----------------------------------------------------------------

// Student's phone asks for a short-lived code to show as a QR. A screenshot
// of it stops working after under a minute, so it can't be passed around.
ridesRouter.get("/students/me/boarding-token", requireRole("student"), (req, res) => {
  res.json({ token: signBoardingToken(req.user!.id), expiresInSec: config.boardingTokenTtlSec });
});

const saveScan = (rideId: string, scanId: string | undefined, status: number, body: unknown) => {
  if (!scanId) return;
  db.prepare("INSERT OR IGNORE INTO scans (ride_id, scan_id, result, created_at) VALUES (?, ?, ?, ?)").run(
    rideId,
    scanId,
    JSON.stringify({ status, body }),
    Date.now()
  );
};

// Driver's phone reports a scan (QR from a student's phone, or an NFC card id).
ridesRouter.post("/rides/:id/checkin", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });

  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Nothing to check in." });
  const { token, tagId, scanId, studentId: manualId } = parsed.data;

  // A retried or offline-queued scan is only ever counted once.
  if (scanId) {
    const prev = db.prepare("SELECT result FROM scans WHERE ride_id = ? AND scan_id = ?").get(own.ride.id, scanId) as
      | { result: string }
      | undefined;
    if (prev) {
      const saved = JSON.parse(prev.result) as { status: number; body: object };
      return res.status(saved.status).json({ ...saved.body, duplicate: true });
    }
  }
  const reply = (status: number, body: object) => {
    saveScan(own.ride.id, scanId, status, body);
    return res.status(status).json(body);
  };

  const now = Date.now();
  let scannedAt = now;
  if (parsed.data.scannedAt) {
    scannedAt = Date.parse(parsed.data.scannedAt);
    if (scannedAt > now + 120_000 || scannedAt < now - 12 * 3600_000) {
      return reply(400, { code: "expired", error: "That scan is too old. Ask the student to show the code again." });
    }
  }

  let studentId: string | null = null;
  if (token) {
    studentId = verifyBoardingToken(token, parsed.data.scannedAt ? scannedAt : undefined);
    if (!studentId) {
      return reply(400, { code: "expired", error: "That code expired. Ask the student to refresh it." });
    }
  } else if (tagId) {
    studentId = findStudentByTag(tagId)?.id ?? null;
  } else if (manualId) {
    // The driver ticks the student off by hand (no phone or card). Only students
    // who are on this driver's route can be checked in this way.
    const onThisRoute = own.route.stops.some((s) => s.studentIds.includes(manualId));
    studentId = onThisRoute ? manualId : null;
  }
  const student = studentId ? users.get(studentId) : undefined;
  if (!student || student.role !== "student") {
    return reply(404, { code: "unknown_student", error: "Student not recognized." });
  }

  const result = checkInStudent(own.ride, own.route, student.id, new Date(Math.min(scannedAt, now)));
  if (!result.ok) {
    // Tell the driver where this student is supposed to be.
    const other = [...routeStore.values()].find(
      (r) =>
        r.id !== own.route.id &&
        r.status === "sent" &&
        r.companyId === own.route.companyId &&
        r.stops.some((s) => s.studentIds.includes(student.id))
    );
    return reply(409, {
      code: other ? "wrong_route" : "not_assigned",
      error: other
        ? `${student.name} isn't on this bus. They ride: ${other.name}.`
        : `${student.name} isn't assigned to any route.`,
      assignedRoute: other?.name,
    });
  }

  let warning: { code: string; message: string } | undefined;
  const stop = own.route.stops.find((s) => s.id === result.stopId)!;
  if (!result.alreadyBoarded) {
    if (result.previous === "skipped") {
      warning = { code: "was_not_riding", message: `${student.name} was marked "not riding today".` };
    } else if (result.previous === "missed") {
      warning = { code: "was_missed", message: `${student.name} had been marked as missed. They're now on board.` };
    } else if (
      own.ride.direction === "to_school" &&
      own.ride.remainingStopIds.includes(stop.id) &&
      own.ride.busLocation &&
      distanceMeters(own.ride.busLocation, stop.location) > Math.max(stop.radiusMeters * 3, 250)
    ) {
      warning = { code: "wrong_stop", message: `${student.name} usually gets on at ${stop.name}.` };
    }
    onBoarded(own.ride, own.route, student.id);
    if (manualId) {
      audit(req.user!, { action: "checkin.manual", targetType: "student", targetId: student.id, companyId: own.route.companyId, schoolId: own.route.schoolId, meta: { route: own.route.name, student: student.name } }, req);
    }
    broadcastRide(own.ride);
  }
  return reply(200, { name: student.name, alreadyBoarded: result.alreadyBoarded, warning });
});
