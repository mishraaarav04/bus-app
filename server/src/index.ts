import { config } from "./config.js";
import { closeDb } from "./data/db.js";
import { seedDemo } from "./data/seed.js";
import { flushNow } from "./data/store.js";
import { buildServer } from "./app.js";
import { startRetentionJob } from "./services/retention.js";
import { sweepEndedRides } from "./services/rideEvents.js";

const { httpServer } = buildServer();

process.on("unhandledRejection", (e) => console.error("[wheelie] unhandled rejection:", e));

httpServer.listen(config.port, async () => {
  console.log(`RouteIQ server listening on :${config.port} (database: ${config.dbPath})`);
  if (config.seedDemo) await seedDemo();
  startRetentionJob();
  sweepEndedRides();
  setInterval(() => sweepEndedRides(), 5 * 60_000).unref();
});

// Save everything before the process goes away (deploys, Ctrl+C).
function shutdown(signal: string) {
  console.log(`[wheelie] ${signal} received, saving and shutting down...`);
  httpServer.close();
  flushNow();
  closeDb();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
