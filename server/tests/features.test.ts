import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { api, login, startTestServer, stopTestServer } from "./helpers.js";
import { config } from "../src/config.js";
import { db } from "../src/data/db.js";
import { flushNow, rideSessions, routes, users } from "../src/data/store.js";
import { outbox } from "../src/services/email.js";
import { pushLog } from "../src/services/notify.js";
import { toCsv } from "../src/services/csv.js";
import { monitorLocation } from "../src/services/monitor.js";
import { purgeOld } from "../src/services/retention.js";
import { todayLocal, addDays } from "../src/services/time.js";
import { startRideSession } from "../src/services/routing.js";

beforeAll(startTestServer, 60_000);
afterAll(stopTestServer);

const IRONBOUND = "Morning Run - Ironbound";
const routeIdByName = (name: string) => [...routes.values()].find((r) => r.name === name)!.id;
const BROAD_MARKET = { lat: 40.7357, lng: -74.1724 };

async function startRide(driverEmail: string, routeName: string) {
  const driver = await login(driverEmail);
  const start = await api("/rides/start", { token: driver.token, body: { routeId: routeIdByName(routeName) } });
  expect([200, 201]).toContain(start.status);
  return { driver, rideId: start.json.session.id as string, start };
}
const endRide = (token: string, rideId: string) => api(`/rides/${rideId}/end`, { token, body: { force: true } });
const lastCode = () => outbox[outbox.length - 1].text.match(/\b(\d{6})\b/)![1];

describe("database", () => {
  it("writes users, routes and rides to SQLite", async () => {
    flushNow();
    const n = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect(n("users")).toBe(users.size);
    expect(n("routes")).toBe(routes.size);
    const row = db.prepare("SELECT data FROM users WHERE email = ?").get("student@wheelie.demo") as { data: string };
    expect(JSON.parse(row.data).name).toBe("Sam Student");
  });

  it("saves in-place changes made after the first write", async () => {
    const sam = [...users.values()].find((u) => u.email === "student@wheelie.demo")!;
    sam.name = "Samuel Student";
    flushNow();
    const row = db.prepare("SELECT data FROM users WHERE id = ?").get(sam.id) as { data: string };
    expect(JSON.parse(row.data).name).toBe("Samuel Student");
    sam.name = "Sam Student";
    flushNow();
  });
});

describe("sessions", () => {
  it("rotates refresh tokens and revokes the chain if an old one is replayed", async () => {
    const first = await login("parent@wheelie.demo", undefined, true);
    expect(first.refreshToken).toBeTruthy();
    const a = await api("/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(a.status).toBe(200);
    expect(a.json.refreshToken).not.toBe(first.refreshToken);
    expect((await api("/auth/me", { token: a.json.token })).status).toBe(200);

    // Replaying the first token after the grace window = theft: everything in the chain dies.
    db.prepare("UPDATE refresh_tokens SET revoked_at = revoked_at - 60000").run();
    expect((await api("/auth/refresh", { body: { refreshToken: first.refreshToken } })).status).toBe(401);
    expect((await api("/auth/refresh", { body: { refreshToken: a.json.refreshToken } })).status).toBe(401);
  });

  it("signs out other devices when the password changes", async () => {
    const su = await api("/auth/signup", {
      body: { role: "driver", name: "Pw Driver", email: "pwd@x.test", password: "startpass123", companyCode: "DRV-DEMO", acceptTerms: true },
    });
    const oldAccess = su.json.token;
    const oldRefresh = su.json.refreshToken;
    const ch = await api("/auth/change-password", {
      token: oldAccess,
      body: { currentPassword: "startpass123", newPassword: "brandnew123" },
    });
    expect(ch.status).toBe(200);
    expect((await api("/auth/me", { token: oldAccess })).status).toBe(401);
    expect((await api("/auth/refresh", { body: { refreshToken: oldRefresh } })).status).toBe(401);
    expect((await api("/auth/me", { token: ch.json.token })).status).toBe(200); // this device continues
  });

  it("requires accepting the terms to sign up", async () => {
    const r = await api("/auth/signup", {
      body: { role: "driver", name: "No Terms", email: "nt@x.test", password: "startpass123", companyCode: "DRV-DEMO" },
    });
    expect(r.status).toBe(400);
  });
});

describe("password reset and email verification", () => {
  it("resets with an emailed code, once", async () => {
    outbox.length = 0;
    expect((await api("/auth/forgot", { body: { email: "ghost@nowhere.test" } })).status).toBe(200);
    expect(outbox).toHaveLength(0); // same answer, no email, for unknown addresses

    const su = await api("/auth/signup", {
      body: { role: "student", name: "Reset Kid", email: "reset@x.test", password: "startpass123", schoolCode: "SCH-DEMO", acceptTerms: true },
    });
    expect(su.status).toBe(201);
    // Sign-up sent a verification code first.
    const verify = lastCode();
    expect((await api("/auth/verify-email", { token: su.json.token, body: { code: "000000" } })).status).toBe(400);
    expect((await api("/auth/verify-email", { token: su.json.token, body: { code: verify } })).status).toBe(200);
    expect((await api("/auth/me", { token: su.json.token })).json.emailVerified).toBe(true);

    outbox.length = 0;
    await api("/auth/forgot", { body: { email: "reset@x.test" } });
    const code = lastCode();
    expect((await api("/auth/reset", { body: { email: "reset@x.test", code: "123456", newPassword: "newpass456" } })).status).toBe(400);
    const ok = await api("/auth/reset", { body: { email: "reset@x.test", code, newPassword: "newpass456" } });
    expect(ok.status).toBe(200);
    expect((await api("/auth/reset", { body: { email: "reset@x.test", code, newPassword: "other789a" } })).status).toBe(400); // used
    expect((await login("reset@x.test", "newpass456", true)).status).toBe(200);
    expect((await api("/auth/me", { token: su.json.token })).status).toBe(401); // old session revoked
  });

  it("locks a code after five wrong guesses", async () => {
    await api("/auth/forgot", { body: { email: "reset@x.test" } });
    const code = lastCode();
    for (let i = 0; i < 5; i++) await api("/auth/reset", { body: { email: "reset@x.test", code: "999999", newPassword: "newpass456" } });
    const r = await api("/auth/reset", { body: { email: "reset@x.test", code, newPassword: "newpass456" } });
    expect(r.status).toBe(400);
  });
});

describe("alerts and notifications", () => {
  it("sends start, approaching and boarded alerts in the family's language and respects settings", async () => {
    const parent = await login("parent@wheelie.demo", undefined, true);
    const student = await login("student@wheelie.demo");
    const reg = await api("/push/register", { token: parent.token, body: { token: "ExponentPushToken[parent-phone]", platform: "ios" } });
    expect(reg.status).toBe(200);
    expect((await api("/push/register", { token: parent.token, body: { token: "not-a-token", platform: "ios" } })).status).toBe(400);
    expect((await api("/auth/me/preferences", { token: parent.token, method: "PUT", body: { lang: "es" } })).json.lang).toBe("es");

    pushLog.length = 0;
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    expect(pushLog.some((m) => m.to === "ExponentPushToken[parent-phone]" && m.title === "El autobús está en camino")).toBe(true);

    // Far away: nothing yet. Then close to Sam's stop: "arriving soon".
    await api(`/rides/${rideId}/location`, { token: driver.token, body: { lat: 40.76, lng: -74.21 } });
    pushLog.length = 0;
    await api(`/rides/${rideId}/location`, { token: driver.token, body: { lat: 40.7361, lng: -74.1731 } });
    const soon = pushLog.filter((m) => m.title === "El autobús llega pronto");
    expect(soon).toHaveLength(1);
    expect(soon[0].body).toContain("Sam");
    // Only once per stop.
    await api(`/rides/${rideId}/location`, { token: driver.token, body: { lat: 40.7359, lng: -74.1727 } });
    expect(pushLog.filter((m) => m.title === "El autobús llega pronto")).toHaveLength(1);

    // Boarding alert goes to the parent.
    const bt = await api("/students/me/boarding-token", { token: student.token });
    pushLog.length = 0;
    expect((await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: bt.json.token } })).status).toBe(200);
    expect(pushLog.some((m) => m.title === "Sam está en el autobús".replace("Sam", "Sam Student".split(" ")[0]))).toBe(true);

    // Inbox has them, and can be marked read.
    const inbox = await api("/notifications", { token: parent.token });
    expect(inbox.json.unread).toBeGreaterThan(0);
    expect(inbox.json.items.map((n: any) => n.kind)).toEqual(expect.arrayContaining(["ride_started", "approaching", "boarded"]));
    await api("/notifications/read", { token: parent.token, body: {} });
    expect((await api("/notifications", { token: parent.token })).json.unread).toBe(0);

    // Turning "boarding" alerts off stops them (a second ride would send another).
    await api("/auth/me/preferences", { token: parent.token, method: "PUT", body: { notifPrefs: { boarding: false } } });
    await endRide(driver.token, rideId);
    pushLog.length = 0;
    const second = await startRide("driver@wheelie.demo", IRONBOUND);
    const bt2 = await api("/students/me/boarding-token", { token: student.token });
    await api(`/rides/${second.rideId}/checkin`, { token: second.driver.token, body: { token: bt2.json.token } });
    expect(pushLog.some((m) => m.title.includes("en el autobús"))).toBe(false);
    await endRide(second.driver.token, second.rideId);
    await api("/auth/me/preferences", { token: parent.token, method: "PUT", body: { lang: "en", notifPrefs: { boarding: true } } });
  });

  it("lets a driver report a delay that families and staff see, and clear it", async () => {
    const parent = await login("parent@wheelie.demo", undefined, true);
    const school = await login("school@wheelie.demo");
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    pushLog.length = 0;
    const bad = await api(`/rides/${rideId}/incidents`, { token: parent.token, body: { type: "delay" } });
    expect(bad.status).toBe(403);
    const inc = await api(`/rides/${rideId}/incidents`, { token: driver.token, body: { type: "delay", delayMinutes: 10, note: "Heavy traffic on Route 21" } });
    expect(inc.status).toBe(201);
    expect((await api(`/rides/${rideId}/incidents`, { token: driver.token, body: { type: "delay" } })).status).toBe(429); // double-tap guard

    const fam = (await api("/rides/active", { token: parent.token })).json[0];
    expect(fam.incident.type).toBe("delay");
    expect(fam.incident.delayMinutes).toBe(10);
    expect(JSON.stringify(fam)).not.toContain("Route 21"); // families never see the driver's note
    const staff = (await api("/rides/active", { token: school.token })).json[0];
    expect(staff.incident.note).toContain("Route 21");
    expect(pushLog.some((m) => m.body.includes("10 min"))).toBe(true);

    expect((await api(`/rides/${rideId}/incidents/${inc.json.id}/resolve`, { token: driver.token, body: {} })).status).toBe(200);
    expect((await api("/rides/active", { token: parent.token })).json[0].incident).toBeNull();
    await endRide(driver.token, rideId);
  });

  it("flags a bus that leaves its route, and one that sits still", () => {
    const route = {
      id: "r1", name: "Test", direction: "to_school" as const, schoolLocation: { lat: 40.8, lng: -74.0 },
      stops: [{ id: "s1", name: "A", location: { lat: 40.7, lng: -74.0 }, order: 0, studentIds: [], radiusMeters: 75 }],
      geometry: [[-74.0, 40.7], [-74.0, 40.8]] as [number, number][],
      clearanceChecked: true, companyId: [...users.values()].find((u) => u.role === "company")!.id,
    };
    const ride = startRideSession("ride-mon", route, [...users.values()].find((u) => u.role === "driver")!.id);
    const t0 = 1_000_000;
    // On the road: nothing.
    for (let i = 0; i < 4; i++) { ride.busLocation = { lat: 40.75, lng: -74.0 + i * 1e-5 }; monitorLocation(ride, route, t0 + i * 5000); }
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE ride_id = 'ride-mon'").get() as { n: number }).n;
    expect(count()).toBe(0);
    // 400 m east of the road, three pings in a row.
    for (let i = 0; i < 3; i++) { ride.busLocation = { lat: 40.75, lng: -73.9953 }; monitorLocation(ride, route, t0 + 30_000 + i * 5000); }
    expect(count()).toBe(1);
    expect((db.prepare("SELECT type FROM incidents WHERE ride_id = 'ride-mon'").get() as any).type).toBe("off_route");
    // Same spot for 6 minutes, away from any stop: "stopped" once.
    monitorLocation(ride, route, t0 + 60_000);
    monitorLocation(ride, route, t0 + 60_000 + 6 * 60_000);
    monitorLocation(ride, route, t0 + 60_000 + 7 * 60_000);
    const types = (db.prepare("SELECT type FROM incidents WHERE ride_id = 'ride-mon' ORDER BY created_at").all() as any[]).map((r) => r.type);
    expect(types.filter((t) => t === "stopped")).toHaveLength(1);
  });
});

describe("tap-in safety checks", () => {
  it("names the right bus, warns about stops and 'not riding', and counts a scan once", async () => {
    const parent = await login("parent@wheelie.demo");
    const sam = await login("student@wheelie.demo");
    const maya = await login("maya@wheelie.demo");
    const ava = await login("student2@wheelie.demo");
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    await api(`/rides/${rideId}/location`, { token: driver.token, body: BROAD_MARKET });

    // Ava rides North Ward, not this bus.
    const avaTok = (await api("/students/me/boarding-token", { token: ava.token })).json.token;
    const wrong = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: avaTok } });
    expect(wrong.status).toBe(409);
    expect(wrong.json.code).toBe("wrong_route");
    expect(wrong.json.assignedRoute).toBe("Morning Run - North Ward");

    // Maya's stop is across town from where the bus is.
    const mayaTok = (await api("/students/me/boarding-token", { token: maya.token })).json.token;
    const early = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: mayaTok, scanId: "scan-maya-0001" } });
    expect(early.status).toBe(200);
    expect(early.json.warning.code).toBe("wrong_stop");
    // The same scan again (a retry) isn't counted twice.
    const again = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: mayaTok, scanId: "scan-maya-0001" } });
    expect(again.json.duplicate).toBe(true);
    expect(again.json.name).toBe("Maya Rivera");

    // Sam was flagged not riding, then shows up anyway.
    const samId = parent.user.linkedStudentIds[0];
    expect((await api(`/rides/${rideId}/not-riding`, { token: parent.token, body: { studentId: samId } })).status).toBe(200);
    const samTok = (await api("/students/me/boarding-token", { token: sam.token })).json.token;
    const back = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: samTok } });
    expect(back.json.warning.code).toBe("was_not_riding");
    expect((await api("/rides/active", { token: parent.token })).json[0].mine[0].status).toBe("boarded");
    await endRide(driver.token, rideId);
  });

  it("accepts a scan queued while offline, but only for the time it was scanned", async () => {
    const leo = await login("leo@wheelie.demo");
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    const leoId = leo.user.id;
    const now = Math.floor(Date.now() / 1000);
    // A code that was valid 5 minutes ago and has long expired.
    const old = jwt.sign({ sub: leoId, use: "board", iat: now - 300, exp: now - 255 }, config.jwtSecret);

    const stale = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: old } });
    expect(stale.status).toBe(400); // online scan: expired is expired
    const queuedAt = new Date((now - 280) * 1000).toISOString();
    const offline = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: old, scannedAt: queuedAt, scanId: "offline-scan-1" } });
    expect(offline.status).toBe(200);
    const wrongTime = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: old, scannedAt: new Date().toISOString(), scanId: "offline-scan-2" } });
    expect(wrongTime.status).toBe(400); // claims to be scanned now, but the code wasn't valid then
    const s = rideSessions.get(rideId)!;
    expect(Date.parse(s.boardedAt![leoId])).toBeLessThan(Date.now() - 200_000); // recorded at scan time
    await endRide(driver.token, rideId);
  });

  it("lets the background location token post a location, and nothing else", async () => {
    const { driver, rideId, start } = await startRide("driver@wheelie.demo", IRONBOUND);
    const lt = start.json.locationToken as string;
    expect(lt).toBeTruthy();
    expect((await api(`/rides/${rideId}/location`, { token: lt, body: BROAD_MARKET })).status).toBe(200);
    expect((await api("/rides/active", { token: lt })).status).toBe(401);
    expect((await api(`/rides/${rideId}/end`, { token: lt, body: { force: true } })).status).toBe(401);
    expect((await api(`/rides/${crypto.randomUUID()}/location`, { token: lt, body: BROAD_MARKET })).status).toBe(401);
    await endRide(driver.token, rideId);
    expect((await api(`/rides/${rideId}/location`, { token: lt, body: BROAD_MARKET })).status).toBe(409);
  });
});

describe("planned absences", () => {
  it("skips a child's stop when the day's ride starts, and can be cancelled", async () => {
    const parent = await login("parent@wheelie.demo");
    const samId = parent.user.linkedStudentIds[0];
    const today = todayLocal();
    expect((await api("/absences", { token: parent.token, body: { studentId: samId, date: addDays(today, -1), direction: "both" } })).status).toBe(400);
    expect((await api("/absences", { token: parent.token, body: { studentId: samId, date: addDays(today, 90), direction: "both" } })).status).toBe(400);
    const other = (await login("maya@wheelie.demo")).user.id;
    expect((await api("/absences", { token: parent.token, body: { studentId: other, date: today, direction: "both" } })).status).toBe(403);

    expect((await api("/absences", { token: parent.token, body: { studentId: samId, date: today, direction: "to_school" } })).status).toBe(201);
    expect((await api("/absences", { token: parent.token })).json[0]).toMatchObject({ studentId: samId, date: today });

    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    const staff = (await api("/rides/active", { token: driver.token })).json[0];
    expect(staff.session.remainingStopIds).toHaveLength(2); // Sam was alone at the first stop
    expect(staff.progress.skipped).toBe(1);
    await endRide(driver.token, rideId);

    await api("/absences", { token: parent.token, method: "DELETE", body: { studentId: samId, date: today, direction: "to_school" } });
    const again = await startRide("driver@wheelie.demo", IRONBOUND);
    expect((await api("/rides/active", { token: again.driver.token })).json[0].session.remainingStopIds).toHaveLength(3);
    await endRide(again.driver.token, again.rideId);
  });
});

describe("drop-off, hand-off and the left-on-bus check", () => {
  it("records drop-offs, requires a named adult when the parent asks, and blocks ending with kids aboard", async () => {
    const amara = await login("amara@wheelie.demo");
    const amaraRec = [...users.values()].find((u) => u.email === "amara@wheelie.demo")!;
    // A parent for Amara.
    const su = await api("/auth/signup", {
      body: { role: "parent", name: "Amara Parent", email: "amp@x.test", password: "startpass123", childCode: amaraRec.linkCode, acceptTerms: true },
    });
    expect(su.status).toBe(201);
    await api("/push/register", { token: su.json.token, body: { token: "ExponentPushToken[amara-parent]", platform: "android" } });
    const set = await api(`/parent/children/${amaraRec.id}/settings`, { token: su.json.token, method: "PUT", body: { requiresAdultPickup: true, authorizedPickups: ["Grace Okafor"] } });
    expect(set.json.requiresAdultPickup).toBe(true);

    const { driver, rideId } = await startRide("driver2@wheelie.demo", "Afternoon Run - South Ward");
    const tok = (await api("/students/me/boarding-token", { token: amara.token })).json.token;
    expect((await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { token: tok } })).status).toBe(200);

    const staff = (await api("/rides/active", { token: driver.token })).json[0];
    expect(staff.studentFlags[amaraRec.id]).toEqual({ requiresAdultPickup: true, authorizedPickups: ["Grace Okafor"] });

    // Can't end: Amara is still aboard on a home run.
    const blocked = await api(`/rides/${rideId}/end`, { token: driver.token, body: {} });
    expect(blocked.status).toBe(409);
    expect(blocked.json.code).toBe("students_aboard");

    pushLog.length = 0;
    const noName = await api(`/rides/${rideId}/dropoff`, { token: driver.token, body: { studentId: amaraRec.id } });
    expect(noName.status).toBe(400);
    expect(noName.json.code).toBe("needs_handoff");
    const ok = await api(`/rides/${rideId}/dropoff`, { token: driver.token, body: { studentId: amaraRec.id, handedTo: "Grace Okafor" } });
    expect(ok.status).toBe(200);
    expect(ok.json.warning).toBeUndefined();
    expect(pushLog.find((m) => m.to === "ExponentPushToken[amara-parent]")?.body).toContain("Grace Okafor");
    expect((await api("/rides/active", { token: su.json.token })).json[0].mine[0].droppedAt).toBeTruthy();

    expect((await api(`/rides/${rideId}/end`, { token: driver.token, body: {} })).status).toBe(200);

    // History for the family and the permanent record.
    const hist = await api(`/students/${amaraRec.id}/history`, { token: su.json.token });
    expect(hist.json.events[0]).toMatchObject({ status: "boarded", routeName: "Afternoon Run - South Ward" });
    expect((await api(`/students/${amaraRec.id}/history`, { token: (await login("parent@wheelie.demo")).token })).status).toBe(404);
  });
});

describe("handing a live ride to a substitute driver", () => {
  it("moves the ride, and the old driver loses control", async () => {
    const company = await login("company@wheelie.demo");
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    const sub = await login("driver2@wheelie.demo");
    const routeId = routeIdByName(IRONBOUND);
    pushLog.length = 0;
    const res = await api(`/routes/${routeId}/driver`, { token: company.token, method: "PUT", body: { driverId: sub.user.id } });
    expect(res.status).toBe(200);
    expect((await api(`/rides/${rideId}/location`, { token: driver.token, body: BROAD_MARKET })).status).toBe(404);
    expect((await api(`/rides/${rideId}/location`, { token: sub.token, body: BROAD_MARKET })).status).toBe(200);
    expect((await api("/rides/active", { token: sub.token })).json.some((v: any) => v.session?.id === rideId)).toBe(true);
    expect((await api("/rides/active", { token: driver.token })).json).toEqual([]);
    // Both drivers are told, in their inboxes.
    expect((await api("/notifications", { token: sub.token })).json.items[0].kind).toBe("assigned");
    expect((await api("/notifications", { token: driver.token })).json.items[0].kind).toBe("removed");
    await endRide(sub.token, rideId);
    // Put it back for the other tests.
    await api(`/routes/${routeId}/driver`, { token: company.token, method: "PUT", body: { driverId: driver.user.id } });
  });
});

describe("reports, exports and the activity log", () => {
  it("summarises finished rides for the right organisation only", async () => {
    const school = await login("school@wheelie.demo");
    const company = await login("company@wheelie.demo");
    const parent = await login("parent@wheelie.demo");
    expect((await api("/reports/summary", { token: parent.token })).status).toBe(403);

    const sum = await api("/reports/summary", { token: school.token });
    expect(sum.status).toBe(200);
    expect(sum.json.totals.rides).toBeGreaterThan(3);
    expect(sum.json.routes.map((r: any) => r.routeName)).toContain(IRONBOUND);
    const one = await api(`/reports/summary?routeId=${routeIdByName("Afternoon Run - South Ward")}`, { token: company.token });
    expect(one.json.totals.rides).toBe(1);

    const csv = await api("/reports/boardings.csv", { token: school.token, raw: true });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.text.split("\r\n")[0]).toBe("date,student,route,direction,stop,status,boarded_at,dropped_off_at,handed_to");
    expect(csv.text).toContain("Amara Okafor");
    expect((await api("/reports/summary?from=2020-01-01&to=2026-01-01", { token: school.token })).status).toBe(400);
  });

  it("keeps spreadsheet formulas from running in exports", () => {
    const out = toCsv(["a", "b"], [["=HYPERLINK(\"http://x\")", "Smith, Jo"], ["+1", "ok"]]);
    expect(out).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(out).toContain("\"Smith, Jo\"");
    expect(out).toContain("'+1");
  });

  it("shows each organisation its own audit log", async () => {
    const school = await login("school@wheelie.demo");
    const company = await login("company@wheelie.demo");
    const parent = await login("parent@wheelie.demo");
    const c = await api("/audit", { token: company.token });
    expect(c.status).toBe(200);
    expect(c.json.map((r: any) => r.action)).toEqual(expect.arrayContaining(["ride.start", "ride.end", "ride.handover"]));
    expect((await api("/audit", { token: school.token })).status).toBe(200);
    expect((await api("/audit", { token: parent.token })).status).toBe(403);
  });

  it("deletes data past the retention period", () => {
    const old = Date.now() - (config.retentionDays + 5) * 86_400_000;
    db.prepare("UPDATE ride_history SET ended_at = ? WHERE rowid = (SELECT MIN(rowid) FROM ride_history)").run(old);
    const before = (db.prepare("SELECT COUNT(*) AS n FROM ride_history").get() as any).n;
    expect(purgeOld().history).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM ride_history").get() as any).n).toBe(before - 1);
  });
});

describe("school roster import", () => {
  const csv = [
    "Name,Email,Parent Email,Route,Stop,Tag ID",
    `Zed Roster,zed@r.test,parent@wheelie.demo,${IRONBOUND},Ferry St & Wilson,TAG-ZED-1`,
    `Pia Pending,,newparent@r.test,${IRONBOUND},3,TAG-ZED-1`,
    `Bad Email,not-an-email,,,,`,
    `,nobody@r.test,,,,`,
    `Lost Stop,lost@r.test,,${IRONBOUND},Nowhere St,`,
  ].join("\n");

  it("previews, imports, links parents, and lets the student claim the account", async () => {
    const school = await login("school@wheelie.demo");
    const parent = await login("parent@wheelie.demo");
    const before = users.size;

    const preview = await api("/school/roster/preview", { token: school.token, body: { csv, sendInvites: true } });
    expect(preview.status).toBe(200);
    expect(users.size).toBe(before); // nothing saved
    expect(preview.json.rows.map((r: any) => r.status)).toEqual(["created", "created", "error", "error", "created"]);

    outbox.length = 0;
    const done = await api("/school/roster/import", { token: school.token, body: { csv, sendInvites: true } });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ created: 3, errors: 2, invitesSent: 3 });
    const pia = done.json.rows[1];
    expect(pia.warnings.join(" ")).toContain("Card TAG-ZED-1"); // duplicate card
    expect(done.json.rows[4].warnings.join(" ")).toContain("Nowhere St");

    // Existing parent was linked automatically; the new one got an email with the child code.
    const zed = [...users.values()].find((u) => u.email === "zed@r.test")!;
    const parentRec = users.get(parent.user.id)!;
    expect(parentRec.linkedStudentIds).toContain(zed.id);
    expect(outbox.find((m) => m.to === "newparent@r.test")?.text).toContain(pia.linkCode);
    // Assigned to the stop.
    const ironbound = routes.get(routeIdByName(IRONBOUND))!;
    expect(ironbound.stops.find((s) => s.name === "Ferry St & Wilson")!.studentIds).toContain(zed.id);
    expect(ironbound.stops.find((s) => s.order === 2)!.studentIds.length).toBe(2); // Pia by stop number

    // Re-importing the same file doesn't duplicate people.
    const again = await api("/school/roster/import", { token: school.token, body: { csv } });
    expect(again.json.created).toBe(0);
    expect(again.json.updated).toBe(3);

    // The student can't sign in until they choose a password.
    expect((await api("/auth/login", { body: { email: "zed@r.test", password: "anything123" } })).status).toBe(401);
    outbox.length = 0;
    await api("/auth/forgot", { body: { email: "zed@r.test" } });
    expect((await api("/auth/reset", { body: { email: "zed@r.test", code: lastCode(), newPassword: "zedpass123" } })).status).toBe(200);
    expect((await login("zed@r.test", "zedpass123", true)).status).toBe(200);

    // Only the school sees the list with child codes; a student can't import.
    const list = await api("/school/students", { token: school.token });
    expect(list.json.students.find((s: any) => s.name === "Pia Pending")).toMatchObject({ claimed: false, linkCode: pia.linkCode });
    expect((await api("/school/roster/import", { token: (await login("student@wheelie.demo")).token, body: { csv } })).status).toBe(403);
    expect((await api("/school/roster/import", { token: school.token, body: { csv: "Foo,Bar\n1,2" } })).status).toBe(400);
  });
});

describe("privacy", () => {
  it("exports and deletes a person's data", async () => {
    const su = await api("/auth/signup", {
      body: { role: "driver", name: "Gone Driver", email: "gone@x.test", password: "startpass123", companyCode: "DRV-DEMO", acceptTerms: true },
    });
    const token = su.json.token;
    await api("/push/register", { token, body: { token: "ExponentPushToken[gone]", platform: "ios" } });
    const exp = await api("/auth/me/export", { token });
    expect(exp.status).toBe(200);
    expect(exp.json.account.email).toBe("gone@x.test");
    expect(exp.json.account.consent.termsVersion).toBe(config.termsVersion);
    expect(JSON.stringify(exp.json)).not.toMatch(/passwordHash|\$2[aby]\$/);

    expect((await api("/auth/me", { token, method: "DELETE", body: { password: "wrong-pass-1" } })).status).toBe(401);
    expect((await api("/auth/me", { token, method: "DELETE", body: { password: "startpass123" } })).status).toBe(200);
    expect((await api("/auth/me", { token })).status).toBe(401);
    expect((await login("gone@x.test", "startpass123", true)).status).toBe(401);
    expect((db.prepare("SELECT COUNT(*) AS n FROM push_tokens WHERE token = ?").get("ExponentPushToken[gone]") as any).n).toBe(0);
    // Companies and schools can't be deleted from the app.
    expect((await api("/auth/me", { token: (await login("school@wheelie.demo")).token, method: "DELETE", body: { password: "x" } })).status).toBe(403);
  });
});

describe("manual check-in and 'not riding' alerts", () => {
  it("lets the driver check in a student by hand, only on their own route", async () => {
    const parent = await login("parent@wheelie.demo");
    const ava = await login("student2@wheelie.demo");
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    await api(`/rides/${rideId}/location`, { token: driver.token, body: BROAD_MARKET });
    const samId = parent.user.linkedStudentIds[0];

    const ok = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { studentId: samId } });
    expect(ok.status).toBe(200);
    expect(ok.json.name).toBe("Sam Student");
    expect((await api("/rides/active", { token: parent.token })).json[0].mine[0].status).toBe("boarded");
    const inbox = await api("/notifications", { token: parent.token });
    expect(inbox.json.items.map((n: any) => n.kind)).toContain("boarded");

    // Checking in twice is harmless.
    const again = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { studentId: samId } });
    expect(again.json.alreadyBoarded).toBe(true);

    // A student from another route, or a made-up id, is refused.
    const other = await api(`/rides/${rideId}/checkin`, { token: driver.token, body: { studentId: ava.user.id } });
    expect(other.status).toBe(404);
    const fake = await api(`/rides/${rideId}/checkin`, {
      token: driver.token,
      body: { studentId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(fake.status).toBe(404);

    // Only drivers can do it, and it is written to the school's activity log.
    expect((await api(`/rides/${rideId}/checkin`, { token: parent.token, body: { studentId: samId } })).status).toBe(403);
    const school = await login("school@wheelie.demo");
    const log = await api("/audit", { token: school.token });
    expect(log.json.map((a: any) => a.action)).toContain("checkin.manual");
    await endRide(driver.token, rideId);
  });

  it("tells the parent when the student marks themselves not riding, now or ahead of time", async () => {
    const parent = await login("parent@wheelie.demo");
    const sam = await login("student@wheelie.demo");
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    await api("/notifications/read", { token: parent.token, body: {} });

    expect((await api(`/rides/${rideId}/not-riding`, { token: sam.token, body: { studentId: sam.user.id } })).status).toBe(200);
    let inbox = await api("/notifications", { token: parent.token });
    const n = inbox.json.items.find((x: any) => x.kind === "not_riding");
    expect(n.title).toContain("Sam");
    expect(n.readAt).toBeNull();
    // The student doesn't get an alert about their own action.
    expect((await api("/notifications", { token: sam.token })).json.items.some((x: any) => x.kind === "not_riding")).toBe(false);
    await endRide(driver.token, rideId);

    // Planning a day off ahead of time also alerts the parent.
    const date = addDays(todayLocal(), 3);
    expect((await api("/absences", { token: sam.token, body: { studentId: sam.user.id, date, direction: "both" } })).status).toBe(201);
    inbox = await api("/notifications", { token: parent.token });
    expect(inbox.json.items.map((x: any) => x.kind)).toContain("absence_planned");
    await api("/absences", { token: sam.token, method: "DELETE", body: { studentId: sam.user.id, date, direction: "both" } });

    // A parent's own action isn't echoed back to them.
    await api("/notifications/read", { token: parent.token, body: {} });
    const mine = addDays(todayLocal(), 4);
    await api("/absences", { token: parent.token, body: { studentId: sam.user.id, date: mine, direction: "to_school" } });
    expect((await api("/notifications", { token: parent.token })).json.items.filter((x: any) => !x.readAt && x.kind === "absence_planned")).toHaveLength(0);
    await api("/absences", { token: parent.token, method: "DELETE", body: { studentId: sam.user.id, date: mine, direction: "to_school" } });
  });
});

describe("browser access (CORS) for the dashboard", () => {
  it("allows the website origin and no other", async () => {
    const site = config.webOrigins[0];
    expect(site).toBeTruthy();
    const pre = await api("/auth/login", { method: "OPTIONS", headers: { Origin: site, "Access-Control-Request-Method": "POST" }, raw: true });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(site);
    const ok = await api("/legal", { headers: { Origin: site } });
    expect(ok.headers.get("access-control-allow-origin")).toBe(site);
    const bad = await api("/legal", { headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});
