import { Router } from "express";
import { routes as routeStore, rideSessions, studentLocations } from "../data/store.js";
import {
  startRideSession,
  markStudentNotRiding,
  evaluateGeofences,
  advancePastStop,
  updateBusLocation,
} from "../services/routing.js";
import { randomUUID } from "node:crypto";

export const ridesRouter = Router();

// Driver activates a ride for a route.
ridesRouter.post("/rides/start", (req, res) => {
  const { routeId, driverId } = req.body ?? {};
  const route = routeStore.get(routeId);
  if (!route) return res.status(404).json({ error: "route not found" });

  const session = startRideSession(randomUUID(), route, driverId);
  rideSessions.set(session.id, session);
  res.json(session);
});

// Driver (or anyone with the session) pushes a bus location update.
ridesRouter.post("/rides/:id/location", (req, res) => {
  const session = rideSessions.get(req.params.id);
  const route = session && routeStore.get(session.routeId);
  if (!session || !route) return res.status(404).json({ error: "not found" });

  const { lat, lng } = req.body ?? {};
  updateBusLocation(session, route, { lat, lng });
  evaluateGeofences(session, route, Object.fromEntries(studentLocations));
  res.json(session);
});

// Student device pushes its own location (used for boarding detection).
ridesRouter.post("/students/:studentId/location", (req, res) => {
  const { lat, lng } = req.body ?? {};
  studentLocations.set(req.params.studentId, { lat, lng });
  res.json({ ok: true });
});

// The feature you asked for: a student/parent flags "not riding today" —
// this is what triggers the live reroute if it empties out their stop.
ridesRouter.post("/rides/:id/not-riding", (req, res) => {
  const session = rideSessions.get(req.params.id);
  const route = session && routeStore.get(session.routeId);
  if (!session || !route) return res.status(404).json({ error: "not found" });

  const { studentId } = req.body ?? {};
  const result = markStudentNotRiding(session, route, studentId);
  res.json({ session, ...result });
});

// Driver marks a stop as departed (also happens automatically once geofence
// exit logic is wired to real GPS — manual endpoint for the rudimentary demo).
ridesRouter.post("/rides/:id/depart-stop", (req, res) => {
  const session = rideSessions.get(req.params.id);
  const route = session && routeStore.get(session.routeId);
  if (!session || !route) return res.status(404).json({ error: "not found" });

  const { stopId } = req.body ?? {};
  advancePastStop(session, route, stopId);
  res.json(session);
});

ridesRouter.get("/rides/:id", (req, res) => {
  const session = rideSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  res.json(session);
});
