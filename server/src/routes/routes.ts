import { Router } from "express";
import { randomUUID } from "node:crypto";
import { routes as routeStore, users } from "../data/store.js";
import { requireAuth, requireRole } from "../security/auth.js";
import { assignDriverSchema, createRouteSchema } from "../schemas.js";
import { activeRideFor, canViewRoute } from "../services/access.js";
import { MapboxError, mapboxEnabled } from "../services/mapbox.js";
import { planRoute } from "../services/routePlanner.js";
import { scopeRoute } from "../services/rideViews.js";
import type { BusSpec, Route } from "../types.js";

export const routesRouter = Router();
routesRouter.use("/routes", requireAuth);

const DEFAULT_BUS: BusSpec = { heightM: 3.4, widthM: 2.6, weightT: 14 };
const STOP_RADIUS_M = 75;

// Company: input stops -> Mapbox builds the fastest clearance-aware route (saved as a draft).
routesRouter.post("/routes", requireRole("company"), async (req, res) => {
  const parsed = createRouteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid route." });
  }
  const d = parsed.data;
  const company = req.user!;
  const school = users.get(d.schoolId);
  if (!school || school.role !== "admin" || school.companyId !== company.id || !school.location) {
    return res.status(400).json({ error: "Choose one of your schools." });
  }
  if (!mapboxEnabled()) {
    return res.status(503).json({ error: "Route building needs a Mapbox token on the server." });
  }
  const vehicle = d.vehicle ?? company.busSpec ?? DEFAULT_BUS;

  try {
    const plan = await planRoute({
      stops: d.stops,
      school: school.location,
      direction: d.direction,
      vehicle,
    });
    const route: Route = {
      id: randomUUID(),
      name: d.name,
      direction: d.direction,
      schoolLocation: school.location,
      companyId: company.id,
      schoolId: school.id,
      status: "draft",
      vehicle,
      stops: plan.order.map((inputIdx, order) => ({
        id: randomUUID(),
        name: d.stops[inputIdx].name,
        location: d.stops[inputIdx].location,
        order,
        studentIds: [],
        radiusMeters: STOP_RADIUS_M,
      })),
      geometry: plan.geometry,
      totalDurationSec: plan.totalDurationSec,
      totalDistanceM: plan.totalDistanceM,
      clearanceChecked: true,
    };
    routeStore.set(route.id, route);
    res.status(201).json(route);
  } catch (e) {
    const err = e instanceof MapboxError ? e : new MapboxError("Couldn't build the route.");
    res.status(err.status).json({ error: err.message });
  }
});

routesRouter.get("/routes", (req, res) => {
  const user = req.user!;
  const visible = [...routeStore.values()]
    .filter((r) => canViewRoute(user, r))
    .map((r) => scopeRoute(user, r));
  res.json(visible);
});

routesRouter.get("/routes/:id", (req, res) => {
  const route = routeStore.get(req.params.id);
  if (!route || !canViewRoute(req.user!, route)) return res.status(404).json({ error: "Route not found." });
  res.json(scopeRoute(req.user!, route));
});

// Send the finished route to the school so it can start monitoring buses on it.
routesRouter.post("/routes/:id/send", requireRole("company"), (req, res) => {
  const route = routeStore.get(req.params.id);
  if (!route || route.companyId !== req.user!.id) return res.status(404).json({ error: "Route not found." });
  route.status = "sent";
  res.json(route);
});

routesRouter.put("/routes/:id/driver", requireRole("company"), (req, res) => {
  const route = routeStore.get(req.params.id);
  if (!route || route.companyId !== req.user!.id) return res.status(404).json({ error: "Route not found." });
  const parsed = assignDriverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pick a driver." });
  if (activeRideFor(route.id)) return res.status(409).json({ error: "A ride is in progress on this route." });

  if (parsed.data.driverId) {
    const driver = users.get(parsed.data.driverId);
    if (!driver || driver.role !== "driver" || driver.companyId !== req.user!.id) {
      return res.status(400).json({ error: "Choose one of your drivers." });
    }
    route.driverId = driver.id;
  } else {
    route.driverId = undefined;
  }
  res.json(route);
});

routesRouter.delete("/routes/:id", requireRole("company"), (req, res) => {
  const route = routeStore.get(req.params.id);
  if (!route || route.companyId !== req.user!.id) return res.status(404).json({ error: "Route not found." });
  if (activeRideFor(route.id)) return res.status(409).json({ error: "A ride is in progress on this route." });
  routeStore.delete(route.id);
  res.json({ ok: true });
});
