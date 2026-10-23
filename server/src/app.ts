import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { companyRouter } from "./routes/company.js";
import { schoolRouter } from "./routes/school.js";
import { geoRouter } from "./routes/geo.js";
import { routesRouter } from "./routes/routes.js";
import { ridesRouter } from "./routes/rides.js";
import { chatRouter } from "./routes/chat.js";
import { registerSockets } from "./sockets/index.js";
import { setIo } from "./services/rideBroadcast.js";

export function buildServer() {
const app = express();
app.disable("x-powered-by");
app.use(helmet());
// Native apps don't use browser CORS, so no cross-origin access is granted.
app.use(express.json({ limit: "50kb" }));
app.use(
  rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(authRouter);
app.use(companyRouter);
app.use(schoolRouter);
app.use(geoRouter);
app.use(routesRouter);
app.use(ridesRouter);
app.use(chatRouter);

// Don't leak stack traces or internals.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  console.error("[wheelie] unhandled error:", err?.message ?? err);
  res.status(500).json({ error: "Something went wrong." });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { maxHttpBufferSize: 10_000 });
setIo(io);
registerSockets(io);


return { app, httpServer, io };
}
