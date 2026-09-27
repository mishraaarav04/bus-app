import { Router } from "express";
import { randomUUID } from "node:crypto";
import { routes as routeStore } from "../data/store.js";
import type { Route } from "../types.js";

export const routesRouter = Router();

// Admin creates/edits a planned route. Stop-adjustment (removing an empty
// stop before the trip even starts) also happens here by just re-PUTting
// the route with that stop's studentIds emptied out — the live reroute
// logic in routing.ts only kicks in once a ride is actually active.
routesRouter.post("/routes", (req, res) => {
  const body = req.body as Omit<Route, "id">;
  const route: Route = { id: randomUUID(), ...body };
  routeStore.set(route.id, route);
  res.json(route);
});

routesRouter.get("/routes", (_req, res) => {
  res.json([...routeStore.values()]);
});

routesRouter.get("/routes/:id", (req, res) => {
  const route = routeStore.get(req.params.id);
  if (!route) return res.status(404).json({ error: "not found" });
  res.json(route);
});

routesRouter.put("/routes/:id", (req, res) => {
  if (!routeStore.has(req.params.id)) {
    return res.status(404).json({ error: "not found" });
  }
  const route: Route = { ...req.body, id: req.params.id };
  routeStore.set(route.id, route);
  res.json(route);
});
