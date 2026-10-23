import { routes, rideSessions, users } from "../data/store.js";
import type { RideSession, Route, User } from "../types.js";

/** Which of the user's children (parent) or themselves (student) ride this route. */
export function myRidersOnRoute(user: User, route: Route): string[] {
  const mine =
    user.role === "student"
      ? [user.id]
      : user.role === "parent"
      ? user.linkedStudentIds ?? []
      : [];
  const onRoute = new Set(route.stops.flatMap((s) => s.studentIds));
  return mine.filter((id) => onRoute.has(id));
}

/** Can this user see this route at all? Everyone but the creating company needs it sent. */
export function canViewRoute(user: User, route: Route): boolean {
  switch (user.role) {
    case "company":
      return route.companyId === user.id;
    case "admin":
      return route.schoolId === user.id && route.status === "sent";
    case "driver":
      return route.driverId === user.id && route.status === "sent";
    case "student":
    case "parent":
      return route.status === "sent" && myRidersOnRoute(user, route).length > 0;
    default:
      return false;
  }
}

export function canViewRide(user: User, ride: RideSession): boolean {
  const route = routes.get(ride.routeId);
  if (!route) return false;
  if (user.role === "driver") return ride.driverId === user.id;
  return canViewRoute(user, route);
}

export const isActive = (r: RideSession) => r.endedAt === null;

export function activeRideFor(routeId: string): RideSession | undefined {
  for (const r of rideSessions.values()) if (r.routeId === routeId && isActive(r)) return r;
  return undefined;
}

export function activeRidesFor(user: User): RideSession[] {
  return [...rideSessions.values()].filter((r) => isActive(r) && canViewRide(user, r));
}

export const nameOf = (id: string) => users.get(id)?.name ?? "Student";
