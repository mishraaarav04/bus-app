import type { Server } from "socket.io";
import { rideSessions, routes as routeStore, studentLocations } from "../data/store.js";
import { updateBusLocation, evaluateGeofences } from "../services/routing.js";

/**
 * Minimal real-time layer: a room per ride session. Driver location updates
 * and chat messages broadcast to everyone in the room. This is the one
 * piece that stands in for a push-notification/live-tracking backend — kept
 * intentionally small since wiring a real provider was called out as
 * something to figure out later.
 */
export function registerSockets(io: Server) {
  io.on("connection", (socket) => {
    socket.on("ride:join", ({ rideId }: { rideId: string }) => {
      socket.join(rideId);
    });

    socket.on(
      "ride:driver-location",
      ({ rideId, lat, lng }: { rideId: string; lat: number; lng: number }) => {
        const session = rideSessions.get(rideId);
        const route = session && routeStore.get(session.routeId);
        if (!session || !route) return;

        updateBusLocation(session, route, { lat, lng });
        evaluateGeofences(session, route, Object.fromEntries(studentLocations));
        io.to(rideId).emit("ride:update", session);
      }
    );

    socket.on(
      "ride:student-location",
      ({ studentId, lat, lng }: { studentId: string; lat: number; lng: number }) => {
        studentLocations.set(studentId, { lat, lng });
      }
    );

    socket.on(
      "chat:message",
      (msg: { conversationId: string; [key: string]: unknown }) => {
        io.to(msg.conversationId).emit("chat:message", msg);
      }
    );

    socket.on("chat:join", ({ conversationId }: { conversationId: string }) => {
      socket.join(conversationId);
    });
  });
}
