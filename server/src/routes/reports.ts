import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../data/db.js";
import { users } from "../data/store.js";
import { requireAuth, requireRole } from "../security/auth.js";
import { reportQuerySchema } from "../schemas.js";
import { audit, listAudit } from "../services/audit.js";
import { toCsv } from "../services/csv.js";
import { addDays, isValidDate, todayLocal } from "../services/time.js";

export const reportsRouter = Router();
reportsRouter.use(["/reports", "/audit"], requireAuth, requireRole("company", "admin"));

/** Staff only ever see their own data: a company its rides, a school its school's rides. */
function scope(req: Request) {
  const u = req.user!;
  return u.role === "company" ? { col: "company_id", id: u.id } : { col: "school_id", id: u.id };
}

function range(req: Request, res: Response) {
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid dates." });
    return null;
  }
  const to = parsed.data.to ?? todayLocal();
  const from = parsed.data.from ?? addDays(to, -29);
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    res.status(400).json({ error: "Invalid dates." });
    return null;
  }
  if (from < addDays(to, -366)) {
    res.status(400).json({ error: "Pick a range of a year or less." });
    return null;
  }
  return { from, to, routeId: parsed.data.routeId };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

reportsRouter.get("/reports/summary", (req, res) => {
  const r = range(req, res);
  if (!r) return;
  const { col, id } = scope(req);
  const extra = r.routeId ? "AND route_id = ?" : "";
  const args = [id, r.from, r.to, ...(r.routeId ? [r.routeId] : [])];

  const rides = db
    .prepare(
      `SELECT * FROM ride_history WHERE ${col} = ? AND local_date BETWEEN ? AND ? ${extra} ORDER BY ended_at DESC`
    )
    .all(...args) as any[];

  const sum = (rows: any[], k: string) => rows.reduce((n, x) => n + (x[k] ?? 0), 0);
  const lateRows = rides.filter((x) => x.late_start_min !== null);
  const summarize = (rows: any[]) => {
    const late = rows.filter((x) => x.late_start_min !== null);
    return {
      rides: rows.length,
      riders: sum(rows, "riders"),
      boarded: sum(rows, "boarded"),
      missed: sum(rows, "missed"),
      skipped: sum(rows, "skipped"),
      dropped: sum(rows, "dropped"),
      incidents: sum(rows, "incidents"),
      boardedPct: pct(sum(rows, "boarded"), sum(rows, "riders") - sum(rows, "skipped")),
      scheduledRides: late.length,
      onTimeRides: late.filter((x) => x.late_start_min <= 5).length,
      avgLateMin: late.length ? Math.round(sum(late, "late_start_min") / late.length) : null,
    };
  };

  const byRoute = new Map<string, any[]>();
  for (const x of rides) byRoute.set(x.route_id, [...(byRoute.get(x.route_id) ?? []), x]);

  res.json({
    from: r.from,
    to: r.to,
    totals: summarize(rides),
    routes: [...byRoute.entries()].map(([routeId, rows]) => ({
      routeId,
      routeName: rows[0].route_name,
      ...summarize(rows),
    })),
    rides: rides.slice(0, 100).map((x) => ({
      rideId: x.ride_id,
      routeName: x.route_name,
      direction: x.direction,
      driverName: x.driver_name,
      date: x.local_date,
      startedAt: new Date(x.started_at).toISOString(),
      endedAt: new Date(x.ended_at).toISOString(),
      lateMin: x.late_start_min,
      riders: x.riders,
      boarded: x.boarded,
      missed: x.missed,
      skipped: x.skipped,
      incidents: x.incidents,
    })),
    lateRidesCount: lateRows.length,
  });
});

function sendCsv(res: Response, filename: string, header: string[], rows: unknown[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(header, rows));
}

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : "");

reportsRouter.get("/reports/rides.csv", (req, res) => {
  const r = range(req, res);
  if (!r) return;
  const { col, id } = scope(req);
  const rows = db
    .prepare(
      `SELECT * FROM ride_history WHERE ${col} = ? AND local_date BETWEEN ? AND ? ${r.routeId ? "AND route_id = ?" : ""}
       ORDER BY ended_at`
    )
    .all(id, r.from, r.to, ...(r.routeId ? [r.routeId] : [])) as any[];
  audit(req.user!, { action: "report.export", meta: { kind: "rides", from: r.from, to: r.to } }, req);
  sendCsv(
    res,
    `wheelie-rides-${r.from}-to-${r.to}.csv`,
    ["date", "route", "direction", "driver", "started", "ended", "scheduled_start", "minutes_late", "riders", "boarded", "missed", "not_riding", "dropped_off", "alerts"],
    rows.map((x) => [x.local_date, x.route_name, x.direction, x.driver_name, iso(x.started_at), iso(x.ended_at), x.scheduled_start, x.late_start_min, x.riders, x.boarded, x.missed, x.skipped, x.dropped, x.incidents])
  );
});

reportsRouter.get("/reports/boardings.csv", (req, res) => {
  const r = range(req, res);
  if (!r) return;
  const { col, id } = scope(req);
  const rows = db
    .prepare(
      `SELECT * FROM boarding_events WHERE ${col} = ? AND local_date BETWEEN ? AND ? ${r.routeId ? "AND route_id = ?" : ""}
       ORDER BY ended_at, student_name`
    )
    .all(id, r.from, r.to, ...(r.routeId ? [r.routeId] : [])) as any[];
  audit(req.user!, { action: "report.export", meta: { kind: "boardings", from: r.from, to: r.to } }, req);
  sendCsv(
    res,
    `wheelie-boardings-${r.from}-to-${r.to}.csv`,
    ["date", "student", "route", "direction", "stop", "status", "boarded_at", "dropped_off_at", "handed_to"],
    rows.map((x) => [x.local_date, x.student_name, x.route_name, x.direction, x.stop_name, x.status, iso(x.boarded_at), iso(x.dropped_at), x.handed_to])
  );
});

reportsRouter.get("/audit", (req, res) => {
  const u = req.user!;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const before = Number(req.query.before) || undefined;
  res.json(listAudit(u.role === "company" ? { companyId: u.id } : { schoolId: u.id }, limit, before));
});

// ---- a family's own ride history -----------------------------------------------------------

export const historyRouter = Router();
historyRouter.get("/students/:id/history", requireAuth, (req, res) => {
  const u = req.user!;
  const allowed = u.role === "student" ? [u.id] : u.role === "parent" ? u.linkedStudentIds ?? [] : [];
  if (!allowed.includes(req.params.id)) return res.status(404).json({ error: "Student not found." });
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const since = addDays(todayLocal(), -days);
  const rows = db
    .prepare(
      `SELECT * FROM boarding_events WHERE student_id = ? AND local_date >= ? ORDER BY ended_at DESC LIMIT 200`
    )
    .all(req.params.id, since) as any[];
  res.json({
    studentName: users.get(req.params.id)?.name ?? "Student",
    events: rows.map((x) => ({
      date: x.local_date,
      routeName: x.route_name,
      direction: x.direction,
      stopName: x.stop_name,
      status: x.status,
      boardedAt: x.boarded_at ? iso(x.boarded_at) : null,
      droppedAt: x.dropped_at ? iso(x.dropped_at) : null,
    })),
  });
});
