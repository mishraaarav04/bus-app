import { Router } from "express";
import { rideSessions, routes, users } from "../data/store.js";
import { requireAuth, requireRole } from "../security/auth.js";
import { absenceSchema } from "../schemas.js";
import { addAbsence, lastAllowedDate, removeAbsence, upcomingAbsences } from "../services/absences.js";
import { broadcastRide } from "../services/rideBroadcast.js";
import { markStudentNotRiding } from "../services/routing.js";
import { onAbsencePlanned } from "../services/rideEvents.js";
import { isValidDate, todayLocal } from "../services/time.js";
import type { User } from "../types.js";

export const absencesRouter = Router();
absencesRouter.use("/absences", requireAuth, requireRole("student", "parent"));

/** The students this account may plan absences for: themselves, or their linked children. */
const mine = (u: User): string[] => (u.role === "student" ? [u.id] : u.linkedStudentIds ?? []);

absencesRouter.get("/absences", (req, res) => {
  const ids = mine(req.user!);
  res.json(
    upcomingAbsences(ids).map((a) => ({ ...a, studentName: users.get(a.studentId)?.name ?? "Student" }))
  );
});

absencesRouter.post("/absences", (req, res) => {
  const parsed = absenceSchema.safeParse(req.body);
  if (!parsed.success || !isValidDate(parsed.data.date)) return res.status(400).json({ error: "Pick a valid date." });
  const { studentId, date, direction } = parsed.data;
  if (!mine(req.user!).includes(studentId)) return res.status(403).json({ error: "That isn't your student." });
  if (date < todayLocal()) return res.status(400).json({ error: "That date has already passed." });
  if (date > lastAllowedDate()) return res.status(400).json({ error: "You can plan up to 60 days ahead." });

  addAbsence(studentId, date, direction, req.user!.id);
  onAbsencePlanned(studentId, req.user!.id, date, direction);

  // If a matching run is already underway today, apply it right away.
  if (date === todayLocal()) {
    for (const ride of rideSessions.values()) {
      const route = routes.get(ride.routeId);
      if (!route || ride.endedAt || !route.stops.some((s) => s.studentIds.includes(studentId))) continue;
      if (direction !== "both" && direction !== ride.direction) continue;
      markStudentNotRiding(ride, route, studentId);
      broadcastRide(ride);
    }
  }
  res.status(201).json({ ok: true });
});

absencesRouter.delete("/absences", (req, res) => {
  const parsed = absenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  if (!mine(req.user!).includes(parsed.data.studentId)) return res.status(403).json({ error: "That isn't your student." });
  removeAbsence(parsed.data.studentId, parsed.data.date, parsed.data.direction);
  res.json({ ok: true });
});
