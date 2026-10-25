import type { Server } from "socket.io";
import { routes, users } from "../data/store.js";
import type { RideSession, Route } from "../types.js";
import { buildRideView } from "./rideViews.js";

let io: Server | null = null;
export const setIo = (server: Server) => {
  io = server;
};
export const getIo = () => io;

/** Parents linked to this student. */
export function parentsOf(studentId: string): string[] {
  const out: string[] = [];
  for (const u of users.values()) {
    if (u.role === "parent" && u.linkedStudentIds?.includes(studentId)) out.push(u.id);
  }
  return out;
}

/** The student plus their parents. */
export const familyOf = (studentId: string): string[] => [studentId, ...parentsOf(studentId)];

/** Driver, bus company and school for a ride. */
export function rideStaff(ride: RideSession, route: Route | undefined): string[] {
  const out = [ride.driverId];
  if (route?.companyId) out.push(route.companyId);
  if (route?.schoolId) out.push(route.schoolId);
  return out;
}

/** Everyone who is allowed to see this ride: the driver, company, school, and riders' families. */
export function rideRecipients(ride: RideSession): Set<string> {
  const out = new Set<string>([ride.driverId]);
  const route = routes.get(ride.routeId);
  if (!route) return out;
  for (const id of rideStaff(ride, route)) out.add(id);
  const riders = new Set(route.stops.flatMap((s) => s.studentIds));
  for (const id of riders) out.add(id);
  for (const u of users.values()) {
    if (u.role === "parent" && u.linkedStudentIds?.some((id) => riders.has(id))) out.add(u.id);
  }
  return out;
}

/** Sends each recipient their own scoped view (families never get other kids' data). */
export function broadcastRide(ride: RideSession, event: "ride:update" | "ride:started" = "ride:update") {
  if (!io) return;
  for (const userId of rideRecipients(ride)) {
    const user = users.get(userId);
    if (!user) continue;
    const view = buildRideView(user, ride);
    if (view) io.to(`user:${userId}`).emit(event, view);
  }
}

/** Tell one user a ride is no longer theirs (e.g. the route was handed to another driver). */
export function emitRideRemoved(userId: string, rideId: string) {
  io?.to(`user:${userId}`).emit("ride:removed", { rideId });
}
