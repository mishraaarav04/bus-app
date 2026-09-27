import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { routesRouter } from "./routes/routes.js";
import { ridesRouter } from "./routes/rides.js";
import { chatRouter } from "./routes/chat.js";
import { registerSockets } from "./sockets/index.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use(authRouter);
app.use(routesRouter);
app.use(ridesRouter);
app.use(chatRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
registerSockets(io);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
httpServer.listen(PORT, () => {
  console.log(`bus-app server listening on :${PORT}`);
});
