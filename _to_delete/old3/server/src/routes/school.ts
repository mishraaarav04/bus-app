import { Router } from "express";
import express from "express";
import { routes as routeStore, users } from "../data/store.js";
import { requireAuth, requireRole } from "../security/auth.js";
import { assignStudentSchema, rosterSchema } from "../schemas.js";
import { activeRideFor } from "../services/access.js";
import { audit } from "../services/audit.js";
import { importRoster, RosterError } from "../services/roster.js";

export const schoolRouter = Router();
schoolRouter.use("/school", requireAuth, requireRole("admin"));

// The school's own students and which stop each one is assigned to.
schoolRouter.get("/school/students", (req, res) => {
  const school = req.user!;
  const myRoutes = [...routeStore.values()].filter((r) => r.schoolId === school.id && r.status === "sent");
  const students = [...users.values()]
    .filter((u) => u.role === "student" && u.schoolId === school.id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email.endsWith(".invalid") ? "" : s.email,
      // Roster students who haven't set a password yet; the school can hand parents this code.
      claimed: s.claimed !== false,
      linkCode: s.linkCode,
      tagId: s.tagId,
      assignments: myRoutes.flatMap((r) =>
        r.stops
          .filter((st) => st.studentIds.includes(s.id))
          .map((st) => ({ routeId: r.id, routeName: r.name, stopId: st.id, stopName: st.name }))
      ),
    }));
  res.json({ studentCode: school.studentCode, students });
});

schoolRouter.post("/school/assignments", (req, res) => {
  const parsed = assignStudentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pick a route, stop and student." });
  const { routeId, studentId, stopId } = parsed.data;
  const school = req.user!;

  const route = routeStore.get(routeId);
  const student = users.get(studentId);
  if (!route || route.schoolId !== school.id || route.status !== "sent") {
    return res.status(404).json({ error: "Route not found." });
  }
  if (!student || student.role !== "student" || student.schoolId !== school.id) {
    return res.status(404).json({ error: "Student not found." });
  }
  if (activeRideFor(route.id)) return res.status(409).json({ error: "A ride is in progress on this route." });
  if (stopId && !route.stops.some((s) => s.id === stopId)) {
    return res.status(400).json({ error: "That stop isn't on this route." });
  }

  for (const stop of route.stops) {
    stop.studentIds = stop.studentIds.filter((id) => id !== studentId);
    if (stop.id === stopId) stop.studentIds.push(studentId);
  }
  audit(
    school,
    {
      action: "assignment.set",
      targetType: "student",
      targetId: studentId,
      meta: { student: student.name, route: route.name, stop: route.stops.find((s) => s.id === stopId)?.name ?? null },
    },
    req
  );
  res.json({ ok: true });
});

// ---- roster import (CSV) -----------------------------------------------------------
// Own, larger body limit: the global one is 50 KB (see app.ts, which skips this path).
const bigJson = express.json({ limit: "1mb" });

async function roster(dryRun: boolean, req: express.Request, res: express.Response) {
  const parsed = rosterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Paste or choose a CSV file first." });
  try {
    const report = await importRoster(req.user!, parsed.data.csv, {
      dryRun,
      sendInvites: Boolean(parsed.data.sendInvites),
    });
    if (!dryRun) {
      audit(
        req.user!,
        {
          action: "roster.import",
          meta: { created: report.created, updated: report.updated, errors: report.errors, invites: report.invitesSent },
        },
        req
      );
    }
    res.json(report);
  } catch (e) {
    if (e instanceof RosterError) return res.status(400).json({ error: e.message });
    throw e;
  }
}

schoolRouter.post("/school/roster/preview", bigJson, (req, res, next) => {
  roster(true, req, res).catch(next);
});
schoolRouter.post("/school/roster/import", bigJson, (req, res, next) => {
  roster(false, req, res).catch(next);
});
