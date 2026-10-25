import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { requireAuth, requireRole } from "../security/auth.js";
import { geoSearchSchema } from "../schemas.js";
import { geocode, MapboxError, mapboxEnabled } from "../services/mapbox.js";

export const geoRouter = Router();

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Address search for setting up stops and schools. Staff only.
geoRouter.get(
  "/geo/search",
  requireAuth,
  requireRole("company", "admin"),
  searchLimiter,
  async (req, res) => {
    const parsed = geoSearchSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Type at least 2 characters." });
    const { q, lat, lng } = parsed.data;
    try {
      const near = lat != null && lng != null ? { lat, lng } : undefined;
      res.json(await geocode(q, near));
    } catch (e) {
      const err = e instanceof MapboxError ? e : new MapboxError("Address search failed.");
      res.status(err.status).json({ error: err.message });
    }
  }
);

// The map in the app is drawn by Mapbox GL JS, which needs a *public* (pk.) token.
// Restrict that token to your own URLs/scopes in the Mapbox dashboard.
geoRouter.get("/map/config", requireAuth, (_req, res) => {
  res.json({ enabled: mapboxEnabled(), token: mapboxEnabled() ? config.mapboxToken : null });
});
