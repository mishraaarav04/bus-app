import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { scheduleFlush } from "./data/store.js";
import { absencesRouter } from "./routes/absences.js";
import { authRouter } from "./routes/auth.js";
import { companyRouter } from "./routes/company.js";
import { geoRouter } from "./routes/geo.js";
import { notificationsRouter } from "./routes/notifications.js";
import { historyRouter, reportsRouter } from "./routes/reports.js";
import { ridesRouter } from "./routes/rides.js";
import { routesRouter } from "./routes/routes.js";
import { schoolRouter } from "./routes/school.js";
import { registerSockets } from "./sockets/index.js";
import { setIo } from "./services/rideBroadcast.js";

export function buildServer() {
const app = express();
app.disable("x-powered-by");
// Behind a load balancer (Fly, Render, Railway...) the real client IP and
// protocol come from X-Forwarded-* headers. Set TRUST_PROXY=1 there.
if (config.trustProxy) app.set("trust proxy", config.trustProxy);

app.get("/health", (_req, res) => res.json({ ok: true }));

// In production the host terminates TLS; refuse to serve anything over plain HTTP.
if (config.requireHttps) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(helmet());
// The phone app doesn't use browser CORS. Only the listed website origins (the
// dashboard) may call the API from a browser; anything else gets no CORS headers.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.webOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});
const smallJson = express.json({ limit: "50kb" });
// The roster import has its own, larger body limit (see routes/school.ts).
app.use((req, res, next) => (req.path.startsWith("/school/roster") ? next() : smallJson(req, res, next)));
app.use(
  rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false })
);

// Everything that changed while handling a request is saved shortly after.
app.use((_req, res, next) => {
  res.on("finish", scheduleFlush);
  next();
});

app.use(authRouter);
app.use(notificationsRouter);
app.use(absencesRouter);
app.use(reportsRouter);
app.use(historyRouter);
app.use(companyRouter);
app.use(schoolRouter);
app.use(geoRouter);
app.use(routesRouter);
app.use(ridesRouter);

// Don't leak stack traces or internals.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "That's too large to upload." });
  console.error("[wheelie] unhandled error:", err?.message ?? err);
  res.status(500).json({ error: "Something went wrong." });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 10_000,
  cors: config.webOrigins.length ? { origin: config.webOrigins } : undefined,
});
setIo(io);
registerSockets(io);


return { app, httpServer, io };
}
