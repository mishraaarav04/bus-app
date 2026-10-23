import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { buildServer } from "../src/app.js";
import { seedDemo, DEMO_PASSWORD } from "../src/data/seed.js";
import { users } from "../src/data/store.js";
import { config } from "../src/config.js";

let base = "";
let server: ReturnType<typeof buildServer>["httpServer"];
const realFetch = globalThis.fetch;
const mapboxCalls: string[] = [];

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await realFetch(base + path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function login(email: string, password = DEMO_PASSWORD) {
  const r = await api("/auth/login", { body: { email, password } });
  return { token: r.json?.token as string, user: r.json?.user, status: r.status };
}

beforeAll(async () => {
  server = buildServer().httpServer;
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await seedDemo();

  config.mapboxToken = "pk.test";
  vi.stubGlobal("fetch", async (input: any, init?: any) => {
    const url = String(input);
    if (!url.startsWith("https://api.mapbox.com")) return realFetch(input, init);
    mapboxCalls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.includes("/optimized-trips/")) {
      // Inputs [far, B, C, school] -> trip visits far, C, B, school.
      return json({
        code: "Ok",
        waypoints: [
          { waypoint_index: 0 },
          { waypoint_index: 2 },
          { waypoint_index: 1 },
          { waypoint_index: 3 },
        ],
      });
    }
    if (url.includes("/directions/")) {
      return json({
        code: "Ok",
        routes: [
          {
            duration: 900,
            distance: 6000,
            legs: [{ duration: 300 }, { duration: 300 }, { duration: 300 }],
            geometry: { coordinates: [[-74.17, 40.73], [-74.16, 40.728]] },
          },
        ],
      });
    }
    return new Response("{}", { status: 404 });
  });
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise((r) => server.close(r));
});

describe("passwords and sign-in", () => {
  it("stores bcrypt hashes, never the password", () => {
    for (const u of users.values()) {
      expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(u.passwordHash).not.toContain(DEMO_PASSWORD);
    }
  });

  it("never returns the hash to clients", async () => {
    const { token, user } = await login("student@wheelie.demo");
    expect(JSON.stringify(user)).not.toContain("passwordHash");
    const me = await api("/auth/me", { token });
    expect(JSON.stringify(me.json)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    const a = await api("/auth/login", { body: { email: "student@wheelie.demo", password: "nope-nope-1" } });
    const b = await api("/auth/login", { body: { email: "ghost@wheelie.demo", password: "nope-nope-1" } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error).toBe(b.json.error);
  });

  it("locks an account after repeated failures", async () => {
    const email = "maya@wheelie.demo";
    for (let i = 0; i < 5; i++) {
      await api("/auth/login", { body: { email, password: "wrong-pass-1" } });
    }
    const locked = await api("/auth/login", { body: { email, password: DEMO_PASSWORD } });
    expect(locked.status).toBe(429);
  });
});

describe("change password", () => {
  it("needs the current password, then the new one works", async () => {
    const signup = await api("/auth/signup", {
      body: { role: "student", name: "Pw Kid", email: "pw@x.test", password: "startpass123", schoolCode: "SCH-DEMO" },
    });
    const token = signup.json.token;
    const bad = await api("/auth/change-password", {
      token,
      body: { currentPassword: "wrong-pass-1", newPassword: "brandnew123" },
    });
    expect(bad.status).toBe(401);
    const weak = await api("/auth/change-password", {
      token,
      body: { currentPassword: "startpass123", newPassword: "short" },
    });
    expect(weak.status).toBe(400);
    const ok = await api("/auth/change-password", {
      token,
      body: { currentPassword: "startpass123", newPassword: "brandnew123" },
    });
    expect(ok.status).toBe(200);
    expect((await login("pw@x.test", "startpass123")).status).toBe(401);
    expect((await login("pw@x.test", "brandnew123")).status).toBe(200);
  });
});

describe("sign up", () => {
  it("rejects weak passwords and bad codes", async () => {
    const weak = await api("/auth/signup", {
      body: { role: "student", name: "A", email: "a1@x.test", password: "short", schoolCode: "SCH-DEMO" },
    });
    expect(weak.status).toBe(400);
    const badCode = await api("/auth/signup", {
      body: { role: "student", name: "A", email: "a2@x.test", password: "goodpass123", schoolCode: "SCH-NOPE" },
    });
    expect(badCode.status).toBe(400);
  });

  it("cannot sign up as a company or school", async () => {
    const r = await api("/auth/signup", {
      body: { role: "company", name: "Evil", email: "e@x.test", password: "goodpass123" },
    });
    expect(r.status).toBe(400);
  });

  it("creates student, parent and driver accounts that join the right org", async () => {
    const student = await api("/auth/signup", {
      body: { role: "student", name: "New Kid", email: "kid@x.test", password: "goodpass123", schoolCode: "sch-demo" },
    });
    expect(student.status).toBe(201);
    expect(student.json.user.linkCode).toMatch(/^KID-/);

    const parent = await api("/auth/signup", {
      body: { role: "parent", name: "New Parent", email: "par@x.test", password: "goodpass123", childCode: student.json.user.linkCode },
    });
    expect(parent.status).toBe(201);
    expect(parent.json.user.linkedStudentIds).toEqual([student.json.user.id]);

    const driver = await api("/auth/signup", {
      body: { role: "driver", name: "New Driver", email: "drv@x.test", password: "goodpass123", companyCode: "DRV-DEMO" },
    });
    expect(driver.status).toBe(201);

    const dup = await api("/auth/signup", {
      body: { role: "driver", name: "Dup", email: "DRV@x.test", password: "goodpass123", companyCode: "DRV-DEMO" },
    });
    expect(dup.status).toBe(409);
  });
});

describe("access control", () => {
  it("requires sign-in", async () => {
    expect((await api("/routes")).status).toBe(401);
    expect((await api("/rides/active")).status).toBe(401);
  });

  it("keeps roles in their lane", async () => {
    const parent = await login("parent@wheelie.demo");
    const student = await login("student@wheelie.demo");
    const driver = await login("driver@wheelie.demo");
    expect((await api("/rides/start", { token: parent.token, body: { routeId: crypto.randomUUID() } })).status).toBe(403);
    expect((await api("/company/overview", { token: driver.token })).status).toBe(403);
    expect((await api("/school/students", { token: student.token })).status).toBe(403);
  });

  it("shows families only their own child on a route", async () => {
    const parent = await login("parent@wheelie.demo");
    const r = await api("/routes", { token: parent.token });
    expect(r.json).toHaveLength(1);
    const ids = r.json[0].stops.flatMap((s: any) => s.studentIds);
    expect(ids).toEqual([parent.user.linkedStudentIds[0]]);
    expect(r.json[0].stops).toHaveLength(1);
  });
});

describe("ride, tap-in and live tracking", () => {
  it("runs a full ride", async () => {
    const driver = await login("driver@wheelie.demo");
    const parent = await login("parent@wheelie.demo");
    const student = await login("student@wheelie.demo");
    const mayaStudent = await login("leo@wheelie.demo");

    const routes = await api("/routes", { token: driver.token });
    const routeId = routes.json[0].id;

    // Nothing is shared before the ride starts.
    expect((await api("/rides/active", { token: parent.token })).json).toEqual([]);

    const start = await api("/rides/start", { token: driver.token, body: { routeId } });
    expect(start.status).toBe(201);
    const rideId = start.json.session.id;

    // Only the ride's driver can post a location; a parent can't.
    expect((await api(`/rides/${rideId}/location`, { token: parent.token, body: { lat: 40.73, lng: -74.17 } })).status).toBe(403);
    expect((await api(`/rides/${rideId}/location`, { token: driver.token, body: { lat: 999, lng: 0 } })).status).toBe(400);
    expect((await api(`/rides/${rideId}/location`, { token: driver.token, body: { lat: 40.7357, lng: -74.1724 } })).status).toBe(200);

    // Parent sees the bus and their child as pending - and nothing about other kids.
    let pv = (await api("/rides/active", { token: parent.token })).json[0];
    expect(pv.kind).toBe("family");
    expect(pv.busLocation).toEqual({ lat: 40.7357, lng: -74.1724 });
    expect(pv.mine).toHaveLength(1);
    expect(pv.mine[0].status).toBe("pending");
    expect(JSON.stringify(pv)).not.toContain("Maya");
    expect(JSON.stringify(pv)).not.toContain("Leo");

    // Student shows a short-lived QR token; driver scans it.
    const bt = await api("/students/me/boarding-token", { token: student.token });
    expect(bt.status).toBe(200);
    expect((await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: "garbage-garbage" } })).status).toBe(400);
    const scan = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: bt.json.token } });
    expect(scan.status).toBe(200);
    expect(scan.json.name).toBe("Sam Student");

    pv = (await api("/rides/active", { token: parent.token })).json[0];
    expect(pv.mine[0].status).toBe("boarded");

    // A parent cannot flag a different family's child as not riding.
    const other = await api(`/rides/${rideId}/not-riding`, {
      token: parent.token,
      body: { studentId: mayaStudent.user.id },
    });
    expect(other.status).toBe(403);

    // Boarding tokens are for students only, and the driver can't be tricked with a access token.
    const accessAsBoard = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: student.token } });
    expect(accessAsBoard.status).toBe(400);

    // School and company see the whole bus with progress.
    const school = await login("school@wheelie.demo");
    const sv = (await api("/rides/active", { token: school.token })).json[0];
    expect(sv.kind).toBe("staff");
    expect(sv.boardedCount).toBe(1);
    expect(sv.riderCount).toBe(3);

    // Ending the ride stops location sharing.
    const end = await api(`/rides/${rideId}/end`, { token: driver.token, body: {} });
    expect(end.status).toBe(200);
    expect(end.json.session.busLocation).toBeNull();
    expect((await api("/rides/active", { token: parent.token })).json).toEqual([]);
    expect((await api(`/rides/${rideId}/location`, { token: driver.token, body: { lat: 40.7, lng: -74.1 } })).status).toBe(409);
  });
});

describe("route building with Mapbox", () => {
  it("orders stops, passes bus clearance to Directions, and only reaches the school once sent", async () => {
    const company = await login("company@wheelie.demo");
    const school = await login("school@wheelie.demo");
    const overview = await api("/company/overview", { token: company.token });
    const schoolId = overview.json.schools[0].id;

    mapboxCalls.length = 0;
    const created = await api("/routes", {
      token: company.token,
      body: {
        name: "Test Run",
        schoolId,
        direction: "to_school",
        vehicle: { heightM: 3.5, widthM: 2.6, weightT: 14 },
        stops: [
          { name: "B", location: { lat: 40.7305, lng: -74.1527 } },
          { name: "C", location: { lat: 40.7253, lng: -74.1565 } },
          { name: "A", location: { lat: 40.7357, lng: -74.1724 } },
        ],
      },
    });
    expect(created.status).toBe(201);
    // Farthest stop (A) first, then the optimizer's order for the middle.
    expect(created.json.stops.map((s: any) => s.name)).toEqual(["A", "C", "B"]);
    expect(created.json.status).toBe("draft");
    expect(created.json.geometry.length).toBeGreaterThan(1);

    const dir = mapboxCalls.find((u) => u.includes("/directions/"))!;
    expect(dir).toContain("max_height=3.5");
    expect(dir).toContain("max_width=2.6");
    expect(dir).toContain("max_weight=14");

    // Draft is invisible to the school until the company sends it.
    let list = await api("/routes", { token: school.token });
    expect(list.json.some((r: any) => r.id === created.json.id)).toBe(false);
    expect((await api(`/routes/${created.json.id}/send`, { token: company.token, body: {} })).status).toBe(200);
    list = await api("/routes", { token: school.token });
    expect(list.json.some((r: any) => r.id === created.json.id)).toBe(true);
  });

  it("won't build a route for someone else's school", async () => {
    const company = await login("company@wheelie.demo");
    const r = await api("/routes", {
      token: company.token,
      body: {
        name: "x",
        schoolId: crypto.randomUUID(),
        direction: "to_school",
        stops: [{ name: "A", location: { lat: 40.7, lng: -74.1 } }],
      },
    });
    expect(r.status).toBe(400);
  });
});
