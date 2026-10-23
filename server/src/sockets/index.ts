import type { Server } from "socket.io";
import { rideSessions, users } from "../data/store.js";
import { verifyAccessToken } from "../security/auth.js";
import { locationSchema } from "../schemas.js";
import { applyDriverLocation } from "../routes/rides.js";

/**
 * Real-time layer. Every connection must present a valid access token, and each
 * user only ever receives events addressed to their own `user:<id>` room - the
 * server sends each person a view scoped to what their role may see.
 */
export function registerSockets(io: Server) {
  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
    const userId = token ? verifyAccessToken(token) : null;
    const user = userId ? users.get(userId) : undefined;
    if (!user) return next(new Error("unauthorized"));
    socket.data.userId = user.id;
    next();
  });

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);

    // Only the ride's own driver can move the bus.
    socket.on("ride:driver-location", (payload: unknown) => {
      const p = payload as { rideId?: unknown; lat?: unknown; lng?: unknown };
      const loc = locationSchema.safeParse({ lat: p?.lat, lng: p?.lng });
      const ride = typeof p?.rideId === "string" ? rideSessions.get(p.rideId) : undefined;
      if (!loc.success || !ride || ride.driverId !== userId) return;
      applyDriverLocation(ride, loc.data);
    });
  });
}
