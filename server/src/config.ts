import "dotenv/config";
import { randomBytes } from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

let jwtSecret = process.env.JWT_SECRET ?? "";
if (!jwtSecret) {
  if (isProd) {
    throw new Error("JWT_SECRET must be set in production.");
  }
  // Dev convenience: a random secret per boot. Everyone is signed out when the
  // server restarts, which is fine because the store is in-memory anyway.
  jwtSecret = randomBytes(48).toString("hex");
  console.warn("[wheelie] JWT_SECRET not set - using a random one for this run.");
} else if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}

export const config = {
  isProd,
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  jwtSecret,
  accessTokenTtl: "12h",
  boardingTokenTtlSec: 45,
  bcryptCost: 12,
  mapboxToken: process.env.MAPBOX_TOKEN ?? "",
  // Demo accounts are for local testing only. Never seeded in production.
  seedDemo: !isProd && process.env.SEED_DEMO !== "false",
};

if (!config.mapboxToken) {
  console.warn(
    "[wheelie] MAPBOX_TOKEN not set - maps, address search and route building are disabled."
  );
}
