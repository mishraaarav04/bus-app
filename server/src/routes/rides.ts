import { Router } from "express";
import { randomUUID } from "node:crypto";
import { findStudentByTag, rideSessions, routes as routeStore, users } from "../data/store.js";
import {
  requireAuth,
  requireRole,
  signBoardingToken,
  verifyBoardingToken,
} from "../security/auth.js";
import {
  checkinSchema,
  departSchema,
  locationSchema,
  notRidingSchema,
  startRideSchema,
} from "../schemas.js";
import { activeRideFor, activeRidesFor, canViewRide, myRidersOnRoute } from "../services/access.js";
import { broadcastRide } from "../services/rideBroadcast.js";
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
ridesRouter.use(requireAuth);

/** Applies a bus position. Shared by REST and the socket so both obey the same rules. */
export function applyDriverLocation(ride: RideSession, loc: { lat: number; lng: number }) {
  const route = routeStore.get(ride.routeId);
  if (!route || ride.endedAt) return false;
  updateBusLocation(ride, route, loc);
  evaluateGeofences(ride, route, {}); // students don't share location; boarding is by tap
  broadcastRide(ride);
  return true;
}

function ownRide(req: any, res: any): { ride: RideSession; route: Route } | null {
  const ride = rideSessions.get(req.params.id);
  const route = ride && routeStore.get(ride.routeId);
  if (!ride || !route || ride.driverId !== req.user.id) {
    res.status(404).json({ error: "Ride not found." });
    return null;
  }
  return { ride, route };
}

// Driver activates a ride: this is when location sharing begins.
ridesRouter.post("/rides/start", requireRole("driver"), (req, res) => {
  const parsed = startRideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a route." });
  const route = routeStore.get(parsed.data.routeId);
  if (!route || route.driverId !== req.user!.id || route.status !== "sent") {
    return res.status(404).json({ error: "Route not found." });
  }
  const existing = activeRideFor(route.id);
  if (existing) return res.json(buildRideView(req.user!, existing));

  const ride = startRideSession(randomUUID(), route, req.user!.id);
  rideSessions.set(ride.id, ride);
  broadcastRide(ride, "ride:started");
  res.status(201).json(buildRideView(req.user!, ride));
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

ridesRouter.post("/rides/:id/location", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid location." });
  if (!applyDriverLocation(own.ride, parsed.data)) return res.status(409).json({ error: "Ride has ended." });
  res.json({ ok: true });
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
  broadcastRide(ride);
  res.json({ rerouted: result.rerouted });
});

ridesRouter.post("/rides/:id/depart-stop", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  const parsed = departSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid stop." });
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });
  advancePastStop(own.ride, own.route, parsed.data.stopId);
  broadcastRide(own.ride);
  res.json(buildRideView(req.user!, own.ride));
});

// End of ride: location sharing stops and the bus disappears from family maps.
ridesRouter.post("/rides/:id/end", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  endRide(own.ride);
  broadcastRide(own.ride);
  res.json(buildRideView(req.user!, own.ride));
});

// ---- tap-in -----------------------------------------------------------------

// Student's phone asks for a short-lived code to show as a QR. A screenshot
// of it stops working after under a minute, so it can't be passed around.
ridesRouter.get("/students/me/boarding-token", requireRole("student"), (req, res) => {
  res.json({ token: signBoardingToken(req.user!.id), expiresInSec: config.boardingTokenTtlSec });
});

// Driver's phone reports a scan (QR from a student's phone, or an NFC card id).
ridesRouter.post("/rides/:id/checkin", requireRole("driver"), (req, res) => {
  const own = ownRide(req, res);
  if (!own) return;
  if (own.ride.endedAt) return res.status(409).json({ error: "Ride has ended." });

  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Nothing to check in." });

  let studentId: string | null = null;
  if (parsed.data.token) {
    studentId = verifyBoardingToken(parsed.data.token);
    if (!studentId) return res.status(400).json({ error: "That code expired. Ask the student to refresh it." });
  } else if (parsed.data.tagId) {
    studentId = findStudentByTag(parsed.data.tagId)?.id ?? null;
  }
  const student = studentId ? users.get(studentId) : undefined;
  if (!student || student.role !== "student") {
    return res.status(404).json({ error: "Student not recognized." });
  }

  const result = checkInStudent(own.ride, own.route, student.id);
  if (!result.ok) return res.status(404).json({ error: `${student.name} isn't on this bus's route.` });

  if (!result.alreadyBoarded) broadcastRide(own.ride);
  res.json({ name: student.name, alreadyBoarded: result.alreadyBoarded });
});
