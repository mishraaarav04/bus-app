import { randomUUID } from "node:crypto";
import { routes, users } from "./store.js";
import { hashPassword } from "../security/auth.js";
import { distanceMeters } from "../services/geofence.js";
import type { GeoPoint, Role, Route, User } from "../types.js";

export const DEMO_PASSWORD = "Wheelie!Demo1";

/**
 * Demo data for local testing, never seeded in production: one account per role,
 * a second student and driver, and three routes spread across Newark so every
 * screen has something realistic to show.
 *
 * These routes are hand-built (straight-line paths, approximate coordinates), so
 * they don't need Mapbox and are marked as "clearance not checked". Routes you
 * build in the app go through Mapbox instead.
 */
export async function seedDemo() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const make = (role: Role, name: string, email: string, extra: Partial<User> = {}): User => {
    const u: User = {
      id: randomUUID(),
      role,
      name,
      email,
      passwordHash,
      failedLogins: 0,
      lockedUntil: 0,
      ...extra,
    };
    users.set(u.id, u);
    return u;
  };

  const company = make("company", "Brick City Bus Co.", "company@wheelie.demo", {
    driverCode: "DRV-DEMO",
    busSpec: { heightM: 3.4, widthM: 2.6, weightT: 14 },
  });
  const school = make("admin", "Ironbound Demo School", "school@wheelie.demo", {
    companyId: company.id,
    studentCode: "SCH-DEMO",
    address: "Ferry St, Newark, NJ (demo)",
    location: { lat: 40.7282, lng: -74.1596 },
  });
  const driver = make("driver", "Dana Driver", "driver@wheelie.demo", { companyId: company.id });
  const driver2 = make("driver", "Jordan Driver", "driver2@wheelie.demo", { companyId: company.id });

  let kidNo = 0;
  const kid = (name: string, email: string, code?: string) =>
    make("student", name, email, {
      schoolId: school.id,
      companyId: company.id,
      linkCode: code ?? `KID-D${String(++kidNo).padStart(3, "0")}`,
    });

  // Login-ready students (and the parent linked to Sam).
  const sam = kid("Sam Student", "student@wheelie.demo", "KID-DEMO");
  const ava = kid("Ava Johnson", "student2@wheelie.demo", "KID-AVA2");
  const maya = kid("Maya Rivera", "maya@wheelie.demo", "KID-MAYA");
  const leo = kid("Leo Chen", "leo@wheelie.demo", "KID-LEO1");
  make("parent", "Pat Parent", "parent@wheelie.demo", { linkedStudentIds: [sam.id] });

  // Everyone else just fills out the bus.
  const rest = [
    "Noah Patel",
    "Sofia Martinez",
    "Elijah Brown",
    "Isabella Nguyen",
    "Mateo Garcia",
    "Amara Okafor",
    "Lucas Silva",
    "Zoe Kim",
    "Ethan Costa",
    "Layla Hassan",
  ].map((n) => kid(n, `${n.split(" ")[0].toLowerCase()}@wheelie.demo`));
  const [noah, sofia, elijah, isabella, mateo, amara, lucas, zoe, ethan, layla] = rest;

  const stop = (name: string, lat: number, lng: number, order: number, studentIds: string[]) => ({
    id: randomUUID(),
    name,
    location: { lat, lng },
    order,
    studentIds,
    radiusMeters: 75,
  });

  function addRoute(
    name: string,
    direction: Route["direction"],
    driverId: string,
    stops: ReturnType<typeof stop>[]
  ) {
    const schoolLoc = school.location as GeoPoint;
    const ordered = [...stops].sort((a, b) => a.order - b.order).map((s) => s.location);
    const path = direction === "to_school" ? [...ordered, schoolLoc] : [schoolLoc, ...ordered];
    let meters = 0;
    for (let i = 1; i < path.length; i++) meters += distanceMeters(path[i - 1], path[i]);
    // Straight-line stand-ins: drawn on the map, roughly 1.4x for real streets.
    const roadMeters = Math.round(meters * 1.4);
    const route: Route = {
      id: randomUUID(),
      name,
      direction,
      schoolLocation: schoolLoc,
      companyId: company.id,
      schoolId: school.id,
      driverId,
      status: "sent",
      vehicle: company.busSpec,
      stops,
      geometry: path.map((p) => [p.lng, p.lat] as [number, number]),
      totalDistanceM: roadMeters,
      totalDurationSec: Math.round(roadMeters / 7 + stops.length * 45),
      clearanceChecked: false,
    };
    routes.set(route.id, route);
  }

  // 1) West side, three stops (the original demo route, kept first).
  addRoute("Morning Run - Ironbound", "to_school", driver.id, [
    stop("Broad & Market", 40.7357, -74.1724, 0, [sam.id]),
    stop("Ferry St & Wilson", 40.7305, -74.1527, 1, [maya.id]),
    stop("Lafayette & Chestnut", 40.7253, -74.1565, 2, [leo.id]),
  ]);

  // 2) North end, bringing kids down toward the school.
  addRoute("Morning Run - North Ward", "to_school", driver2.id, [
    stop("Mt Prospect & Bloomfield", 40.7712, -74.1786, 0, [ava.id, noah.id]),
    stop("Branch Brook Park Entrance", 40.7655, -74.1702, 1, [sofia.id]),
    stop("Park Ave & 7th Ave", 40.7583, -74.1731, 2, [elijah.id, isabella.id]),
    stop("Penn Station", 40.7342, -74.1644, 3, [mateo.id]),
  ]);

  // 3) Afternoon run, southwest of the school, heading home.
  addRoute("Afternoon Run - South Ward", "to_home", driver2.id, [
    stop("Ferry St & Madison", 40.7238, -74.1517, 0, [amara.id]),
    stop("Springfield Ave & 18th", 40.7189, -74.1812, 1, [lucas.id, zoe.id]),
    stop("Elizabeth Ave & Chancellor", 40.7143, -74.2005, 2, [ethan.id]),
    stop("Weequahic Park", 40.7085, -74.1944, 3, [layla.id]),
  ]);

  console.log(
    [
      "",
      "Wheelie demo accounts (password for all: " + DEMO_PASSWORD + ")",
      "  company   company@wheelie.demo    driver code: DRV-DEMO",
      "  school    school@wheelie.demo     student code: SCH-DEMO",
      "  driver    driver@wheelie.demo     (Morning Run - Ironbound)",
      "  driver 2  driver2@wheelie.demo    (North Ward + South Ward runs)",
      "  student   student@wheelie.demo    child code: KID-DEMO",
      "  student 2 student2@wheelie.demo   child code: KID-AVA2 (North Ward)",
      "  parent    parent@wheelie.demo     (linked to Sam Student)",
      "  others    maya@, leo@, noah@, sofia@, elijah@, isabella@, mateo@, amara@, lucas@, zoe@, ethan@, layla@ wheelie.demo",
      "",
    ].join("\n")
  );
}
