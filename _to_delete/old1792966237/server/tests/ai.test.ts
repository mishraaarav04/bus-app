import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { api, login, startTestServer, stopTestServer } from "./helpers.js";
import { config } from "../src/config.js";
import { db } from "../src/data/db.js";
import { rideSessions, routes, users } from "../src/data/store.js";
import { checkDelayForecast } from "../src/services/delayForecast.js";
import { recordStopArrival, recordFinish, forgetLearning } from "../src/services/learning.js";
import { startRideSession } from "../src/services/routing.js";
import { addDays, localParts, todayLocal } from "../src/services/time.js";
import { pushLog } from "../src/services/notify.js";

beforeAll(startTestServer, 60_000);
afterAll(stopTestServer);

const route = (name: string) => [...routes.values()].find((r) => r.name === name)!;
const IRONBOUND = "Morning Run - Ironbound";
const sorted = (r: ReturnType<typeof route>) => [...r.stops].sort((a, b) => a.order - b.order);

async function startRide(email: string, name: string) {
  const driver = await login(email);
  const r = await api("/rides/start", { token: driver.token, body: { routeId: route(name).id } });
  expect([200, 201]).toContain(r.status);
  return { driver, rideId: r.json.session.id as string };
}
const endRide = (token: string, id: string) => api(`/rides/${id}/end`, { token, body: { force: true } });
const startMin = () => localParts().minutes;

function addLeg(rt: ReturnType<typeof route>, from: string, to: string, sec: number, n: number) {
  for (let i = 0; i < n; i++) {
    db.prepare(
      `INSERT INTO stop_times (ride_id, route_id, direction, from_stop_id, to_stop_id, start_min, local_date, leg_sec, created_at) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(`seed-${from}-${to}-${i}`, rt.id, rt.direction, from, to, startMin(), todayLocal(), sec, Date.now() - i * 1000);
  }
  forgetLearning(rt.id);
}

describe("learned arrival times", () => {
  it("records the time between stops and ignores tiny or huge gaps", () => {
    const rt = route("Morning Run - North Ward");
    const [a, b, c] = sorted(rt);
    const ride = startRideSession("learn-1", rt, rt.driverId!);
    const t0 = Date.now();
    recordStopArrival(ride, rt, a.id, t0);
    recordStopArrival(ride, rt, b.id, t0 + 300_000);
    recordStopArrival(ride, rt, c.id, t0 + 300_002); // 2 s later: a GPS blip, not a leg
    recordStopArrival(ride, rt, b.id, t0 + 900_000); // already recorded
    const rows = db.prepare("SELECT from_stop_id AS f, to_stop_id AS t, leg_sec AS s FROM stop_times WHERE ride_id = ?").all("learn-1") as any[];
    expect(rows).toEqual([{ f: a.id, t: b.id, s: 300 }]);
    ride.endedAt = new Date().toISOString();
    recordFinish(ride, rt, t0 + 900_000);
    expect(db.prepare("SELECT COUNT(*) AS n FROM stop_times WHERE ride_id = ? AND to_stop_id = 'end'").get("learn-1")).toEqual({ n: 1 });
  });

  it("uses what past rides did instead of distance over a fixed speed", async () => {
    const rt = route(IRONBOUND);
    const [a, b, c] = sorted(rt);
    // Without history: distance / speed, a few minutes at most between these stops.
    let ride = await startRide("driver@wheelie.demo", IRONBOUND);
    const sess = rideSessions.get(ride.rideId)!;
    let r = await api(`/rides/${ride.rideId}/location`, { token: ride.driver.token, body: a.location });
    expect(r.status).toBe(200);
    const baseline = sess.stopStates[b.id].etaSeconds!;
    expect(baseline).toBeLessThan(500);
    await endRide(ride.driver.token, ride.rideId);

    // Four past rides took 10 minutes from stop 1 to stop 2 and 5 from stop 2 to stop 3.
    addLeg(rt, a.id, b.id, 600, 4);
    addLeg(rt, b.id, c.id, 300, 4);
    ride = await startRide("driver@wheelie.demo", IRONBOUND);
    const s2 = rideSessions.get(ride.rideId)!;
    r = await api(`/rides/${ride.rideId}/location`, { token: ride.driver.token, body: a.location });
    expect(r.status).toBe(200);
    expect(s2.arrivedAt?.[a.id]).toBeTypeOf("number");
    expect(s2.stopStates[b.id].etaSeconds).toBeGreaterThan(520);
    expect(s2.stopStates[b.id].etaSeconds).toBeLessThanOrEqual(600);
    expect(s2.stopStates[c.id].etaSeconds).toBeGreaterThan(820);
    await endRide(ride.driver.token, ride.rideId);
  });
});

describe("late-bus warning", () => {
  it("warns families once when a ride is on track to finish well after its usual time, and again only if it gets worse", async () => {
    const rt = route(IRONBOUND);
    // Six past rides of 20 minutes, a week ago at the same time of day.
    for (let i = 0; i < 6; i++) {
      const started = Date.now() - (7 + i) * 86_400_000;
      db.prepare(
        `INSERT INTO ride_history (ride_id, route_id, route_name, school_id, company_id, driver_id, driver_name, direction, started_at, ended_at, local_date,
           scheduled_start, late_start_min, stops_total, stops_skipped, riders, boarded, missed, skipped, dropped, incidents)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(`hist-${i}`, rt.id, rt.name, rt.schoolId, rt.companyId, rt.driverId, "Dana", rt.direction, started, started + 20 * 60_000, addDays(todayLocal(), -7 - i), null, null, 3, 0, 3, 3, 0, 0, 3, 0);
    }
    const { driver, rideId } = await startRide("driver@wheelie.demo", IRONBOUND);
    const ride = rideSessions.get(rideId)!;
    const last = sorted(rt)[2];
    const now = Date.now();
    ride.startedAt = new Date(now - 25 * 60_000).toISOString(); // already 25 min in
    ride.busLocation = sorted(rt)[0].location;
    ride.stopStates[last.id].etaSeconds = 20 * 60; // 20 more minutes to go

    const parent = await login("parent@wheelie.demo");
    const before = pushLog.length;
    checkDelayForecast(ride, rt, now);
    expect(ride.delayForecastMin).toBeGreaterThanOrEqual(25);
    const inbox = await api("/notifications", { token: parent.token });
    const warn = inbox.json.items.filter((n: any) => n.kind === "delay_forecast");
    expect(warn).toHaveLength(1);
    expect(warn[0].body).toMatch(/behind its usual time/);
    expect(pushLog.length).toBeGreaterThanOrEqual(before);

    checkDelayForecast(ride, rt, now + 20_000); // the same prediction again: no second alert
    ride.stopStates[last.id].etaSeconds = 40 * 60; // 20 minutes worse
    checkDelayForecast(ride, rt, now + 40_000);
    const after = (await api("/notifications", { token: parent.token })).json.items.filter((n: any) => n.kind === "delay_forecast");
    expect(after).toHaveLength(2);
    await endRide(driver.token, rideId);
  });

  it("stays quiet with no history to compare against", () => {
    const rt = route("Afternoon Run - South Ward");
    const ride = startRideSession("quiet-1", rt, rt.driverId!);
    ride.startedAt = new Date(Date.now() - 40 * 60_000).toISOString();
    ride.busLocation = rt.stops[0].location;
    checkDelayForecast(ride, rt);
    expect(ride.delayForecastMin).toBeUndefined();
  });
});

describe("insights", () => {
  it("is for staff only", async () => {
    const parent = await login("parent@wheelie.demo");
    expect((await api("/ai/insights", { token: parent.token })).status).toBe(403);
    expect((await api("/ai/insights")).status).toBe(401);
  });

  it("forecasts riders, flags a student who stopped riding, and never exposes ids to the browser", async () => {
    const school = await login("school@wheelie.demo");
    const rt = route(IRONBOUND);
    const sam = [...users.values()].find((u) => u.email === "student@wheelie.demo")!;
    // 19 normal rides, then 3 missed.
    for (let i = 0; i < 22; i++) {
      const d = addDays(todayLocal(), -2 - i);
      db.prepare(
        `INSERT INTO boarding_events (ride_id, student_id, student_name, route_id, route_name, school_id, company_id, direction, local_date, stop_name, status, ended_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(`ev-${i}`, sam.id, sam.name, rt.id, rt.name, rt.schoolId, rt.companyId, rt.direction, d, "x", i < 3 ? "missed" : "boarded", Date.now() - (i + 2) * 86_400_000);
    }
    const r = await api("/ai/insights", { token: school.token });
    expect(r.status).toBe(200);
    expect(r.json.forecast.length).toBeGreaterThan(0);
    const f = r.json.forecast.find((x: any) => x.routeId === rt.id);
    expect(f.assigned).toBeGreaterThan(0);
    expect(f.expected).toBeLessThanOrEqual(f.assigned);
    const gone = r.json.anomalies.find((a: any) => a.kind === "stopped_riding");
    expect(gone.title).toContain(sam.name);
    expect(JSON.stringify(r.json)).not.toContain("studentId");
    expect(r.json.llm).toBe(false);
  });

  it("subtracts planned absences from the forecast", async () => {
    const company = await login("company@wheelie.demo");
    const rt = route(IRONBOUND);
    const date = addDays(todayLocal(), 3);
    const before = (await api(`/ai/insights?date=${date}`, { token: company.token })).json.forecast.find((x: any) => x.routeId === rt.id);
    const sam = [...users.values()].find((u) => u.email === "student@wheelie.demo")!;
    db.prepare("INSERT OR REPLACE INTO absences (student_id, date, direction, created_by, created_at) VALUES (?,?,?,?,?)").run(sam.id, date, "both", sam.id, Date.now());
    const after = (await api(`/ai/insights?date=${date}`, { token: company.token })).json.forecast.find((x: any) => x.routeId === rt.id);
    expect(after.plannedAbsences).toBe(before.plannedAbsences + 1);
    expect(after.expected).toBeLessThan(before.expected);
  });
});

describe("Ask RouteIQ", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    config.aiApiKey = "";
  });

  it("validates the question and keeps it to staff", async () => {
    const company = await login("company@wheelie.demo");
    const parent = await login("parent@wheelie.demo");
    expect((await api("/ai/ask", { token: parent.token, body: { question: "how are the buses?" } })).status).toBe(403);
    expect((await api("/ai/ask", { token: company.token, body: { question: "hi" } })).status).toBe(400);
    expect((await api("/ai/ask", { token: company.token, body: { question: "x".repeat(501) } })).status).toBe(400);
  });

  it("answers the common questions without an API key", async () => {
    const company = await login("company@wheelie.demo");
    const r = await api("/ai/ask", { token: company.token, body: { question: "Which routes could be merged to save buses?" } });
    expect(r.status).toBe(200);
    expect(r.json.mode).toBe("basic");
    expect(r.json.answer.length).toBeGreaterThan(10);
    const dr = await api("/ai/ask", { token: company.token, body: { question: "Which drivers had the most incidents?" } });
    expect(dr.json.answer).toMatch(/Drivers over|No rides/);
    const f = await api("/ai/ask", { token: company.token, body: { question: "How many students do you expect tomorrow?" } });
    expect(f.json.answer).toMatch(/Expected riders on/);
  });

  it("lets Claude call scoped tools and returns its answer", async () => {
    config.aiApiKey = "test-key";
    const company = await login("company@wheelie.demo");
    const seen: any[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      if (!String(url).startsWith("https://integrate.api.nvidia.com")) return realFetch(url, init);
      const body = JSON.parse(init.body);
      seen.push(body);
      expect(init.headers.authorization).toBe("Bearer test-key");
      if (seen.length === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "route_performance", arguments: JSON.stringify({ from: "2020-01-01" }) } }] } }] }));
      }
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Ironbound ran on time." } }] }));
    }) as any;
    const r = await api("/ai/ask", { token: company.token, body: { question: "How was Ironbound?" } });
    expect(r.json).toEqual({ answer: "Ironbound ran on time.", mode: "ai" });
    expect(seen).toHaveLength(2);
    expect(seen[0].tools.map((t: any) => t.function.name)).toContain("unusual_activity");
    const toolResult = JSON.stringify(seen[1].messages[3]);
    expect(seen[1].messages[3].role).toBe("tool");
    expect(toolResult).not.toContain("Sam Student");
    expect(seen[0].messages[0].content).toContain("Brick City Bus Co.");
  });

  it("never gives student names to the model, even through the anomaly tool", async () => {
    config.aiApiKey = "test-key";
    const school = await login("school@wheelie.demo");
    let toolText = "";
    let n = 0;
    globalThis.fetch = (async (url: any, init: any) => {
      if (!String(url).startsWith("https://integrate.api.nvidia.com")) return realFetch(url, init);
      const body = JSON.parse(init.body);
      if (++n === 1) return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "t", type: "function", function: { name: "unusual_activity", arguments: "{}" } }] } }] }));
      toolText = JSON.stringify(body.messages[3]);
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }));
    }) as any;
    await api("/ai/ask", { token: school.token, body: { question: "anything unusual?" } });
    expect(toolText).toContain("A student on");
    expect(toolText).not.toContain("Sam Student");
  });

  it("falls back to the built-in answer if the AI service fails", async () => {
    config.aiApiKey = "test-key";
    const company = await login("company@wheelie.demo");
    globalThis.fetch = (async (url: any, init: any) =>
      String(url).startsWith("https://integrate.api.nvidia.com") ? new Response("{}", { status: 500 }) : realFetch(url, init)) as any;
    const r = await api("/ai/ask", { token: company.token, body: { question: "how were the routes?" } });
    expect(r.status).toBe(200);
    expect(r.json.mode).toBe("basic");
    expect(r.json.note).toMatch(/built-in/);
  });
});

describe("alert drafting and announcements", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    config.aiApiKey = "";
  });

  it("returns the note as-is without a key, and three languages with one", async () => {
    const school = await login("school@wheelie.demo");
    const plain = await api("/ai/draft-alert", { token: school.token, body: { note: "Bus 12 is 15 minutes late due to a flat tire" } });
    expect(plain.json.mode).toBe("basic");
    expect(plain.json.draft.en.body).toContain("flat tire");
    expect(plain.json.draft.es).toBeUndefined();

    config.aiApiKey = "k";
    globalThis.fetch = (async (url: any, init: any) => {
      if (!String(url).startsWith("https://integrate.api.nvidia.com")) return realFetch(url, init);
      const t = (title: string, body: string) => ({ title, body });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify({ en: t("Bus 12 delayed", "Bus 12 is about 15 minutes late."), es: t("Autobús 12 retrasado", "El autobús 12 lleva unos 15 minutos de retraso."), pt: t("Ônibus 12 atrasado", "O ônibus 12 está cerca de 15 minutos atrasado.") }) + "\n```" } }] }));
    }) as any;
    const ai = await api("/ai/draft-alert", { token: school.token, body: { note: "Bus 12 is 15 minutes late due to a flat tire" } });
    expect(ai.json.mode).toBe("ai");
    expect(ai.json.draft.es.title).toBe("Autobús 12 retrasado");
  });

  it("sends a reviewed message to the right families in their language, and records it", async () => {
    const school = await login("school@wheelie.demo");
    const rt = route(IRONBOUND);
    const parentUser = [...users.values()].find((u) => u.email === "parent@wheelie.demo")!;
    parentUser.lang = "es";
    const r = await api("/announcements", {
      token: school.token,
      body: { routeId: rt.id, text: { en: { title: "Late bus", body: "Running late." }, es: { title: "Autobús tarde", body: "Va con retraso." } } },
    });
    expect(r.status).toBe(200);
    expect(r.json.sent).toBeGreaterThan(1);
    const parent = await login("parent@wheelie.demo");
    const inbox = (await api("/notifications", { token: parent.token })).json.items;
    expect(inbox.find((n: any) => n.kind === "announcement")?.title).toBe("Autobús tarde");
    const student = await login("student@wheelie.demo");
    expect((await api("/notifications", { token: student.token })).json.items.find((n: any) => n.kind === "announcement")?.title).toBe("Late bus");
    const log = (await api("/audit", { token: school.token })).json;
    expect(log.some((e: any) => e.action === "announcement.send")).toBe(true);
    parentUser.lang = "en";
  });

  it("refuses other roles, unknown routes and empty text", async () => {
    const school = await login("school@wheelie.demo");
    const parent = await login("parent@wheelie.demo");
    const driver = await login("driver@wheelie.demo");
    const body = { routeId: "all", text: { en: { title: "t", body: "b" } } };
    expect((await api("/announcements", { token: parent.token, body })).status).toBe(403);
    expect((await api("/announcements", { token: driver.token, body })).status).toBe(403);
    expect((await api("/announcements", { token: school.token, body: { ...body, routeId: "11111111-1111-4111-8111-111111111111" } })).status).toBe(404);
    expect((await api("/announcements", { token: school.token, body: { routeId: "all", text: { en: { title: "", body: "" } } } })).status).toBe(400);
  });
});
