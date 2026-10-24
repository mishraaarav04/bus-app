import "dotenv/config";
import { randomBytes } from "node:crypto";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

const num = (v: string | undefined, fallback: number) => {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

let jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}
if (!jwtSecret && isProd) {
  throw new Error("JWT_SECRET must be set in production.");
}
// In dev with no JWT_SECRET, data/db.ts stores a generated one in the database
// so sign-ins survive restarts. Until then (and in tests) use a random one.
const devSecretFallback = randomBytes(48).toString("hex");

export const config = {
  isProd,
  isTest,
  port: num(process.env.PORT, 4000),
  jwtSecret: jwtSecret || devSecretFallback,
  jwtSecretIsExplicit: Boolean(jwtSecret),
  // Short-lived: the app silently swaps its refresh token for a new one.
  accessTokenTtl: "30m",
  refreshTokenTtlDays: 30,
  boardingTokenTtlSec: 45,
  locationTokenTtlSec: 14 * 3600,
  bcryptCost: 12,
  mapboxToken: process.env.MAPBOX_TOKEN ?? "",
  // Demo accounts are for local testing only. Never seeded in production.
  seedDemo: !isProd && process.env.SEED_DEMO !== "false",

  // Storage. ":memory:" is used by the tests.
  dbPath: process.env.DB_PATH ?? "data/wheelie.db",
  // How long ride history, boarding logs and alerts are kept.
  retentionDays: num(process.env.RETENTION_DAYS, 365),

  // Behind a proxy/load balancer (Fly, Render, Railway...) set TRUST_PROXY=1.
  trustProxy: process.env.TRUST_PROXY ? num(process.env.TRUST_PROXY, 1) : 0,
  requireHttps: process.env.REQUIRE_HTTPS === "true",

  // "Today" for absences and on-time reports.
  timezone: process.env.SCHOOL_TIMEZONE ?? "America/New_York",

  // Email (password reset, verification, roster invites). Without a key the
  // messages are printed to the server console in dev.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Wheelie <no-reply@example.com>",
  // Push notifications go through Expo. The token is optional (raises limits).
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN ?? "",

  termsVersion: process.env.TERMS_VERSION ?? "2026-10",
  privacyUrl: process.env.PRIVACY_URL ?? "",
  termsUrl: process.env.TERMS_URL ?? "",

  // Ride safety monitoring.
  approachSeconds: num(process.env.APPROACH_SECONDS, 300),
  offRouteMeters: num(process.env.OFF_ROUTE_METERS, 200),
  stationarySeconds: num(process.env.STATIONARY_SECONDS, 300),
};

if (!config.mapboxToken) {
  console.warn(
    "[wheelie] MAPBOX_TOKEN not set - maps, address search and route building are disabled."
  );
}
if (isProd && !config.resendApiKey) {
  console.warn("[wheelie] RESEND_API_KEY not set - password reset and invite emails won't be sent.");
}
