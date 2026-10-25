import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, stopTestServer } from "./helpers.js";
import { findUserByEmail, routes } from "../src/data/store.js";
import { relocateDemo, SetupError, type Deps } from "../src/services/demoSetup.js";

beforeAll(startTestServer, 60_000);
afterAll(stopTestServer);

const spots: Record<string, { name: string; address: string; lat: number; lng: number }> = {
  "61 Tingley Lane": { name: "61 Tingley Lane", address: "61 Tingley Ln, Edison, NJ", lat: 40.5, lng: -74.4 },
  "61 Teaberry Drive": { name: "61 Teaberry Drive", address: "61 Teaberry Dr, Edison, NJ", lat: 40.51, lng: -74.41 },
  "St. Thomas Aquinas": { name: "St. Thomas Aquinas High School", address: "Edison, NJ", lat: 40.52, lng: -74.39 },
};
const calls: any[] = [];
const deps: Deps = {
  geocode: async (q) => [{ id: q, ...spots[q] }, { id: "x", name: "Other", address: "Elsewhere", lat: 1, lng: 1 }],
  directions: async (coords) => {
    calls.push(coords);
    return { geometry: coords.map((c) => [c.lng, c.lat] as [number, number]).concat([[-74.4, 40.5]]), durationSec: 600, distanceM: 8046.7, legDurationsSec: [] };
  },
};
const opts = { stops: ["61 Tingley Lane", "61 Teaberry Drive"], school: "St. Thomas Aquinas" };
const morning = () => [...routes.values()].find((r) => r.name === "Morning Run - Ironbound")!;

describe("relocate the demo route", () => {
  it("previews without changing anything", async () => {
    const r = await relocateDemo({ ...opts, apply: false }, deps);
    expect(r.applied).toBe(false);
    expect(r.places.map((p) => p.found)).toContain("61 Teaberry Dr, Edison, NJ");
    expect(morning().stops).toHaveLength(3);
    expect([...routes.values()].some((x) => x.name === "Morning Run - St. Thomas Aquinas")).toBe(false);
  });

  it("asks for roads in the order given, ending at the school", () => {
    expect(calls[0]).toEqual([
      { lat: 40.5, lng: -74.4 },
      { lat: 40.51, lng: -74.41 },
      { lat: 40.52, lng: -74.39 },
    ]);
  });

  it("refuses if a search matched a place far away", async () => {
    const far: Deps = { ...deps, geocode: async (q) => [q === "61 Teaberry Drive" ? { id: "f", name: "x", address: "Texas", lat: 30, lng: -97 } : { id: q, ...spots[q] }] };
    await expect(relocateDemo({ ...opts, apply: false }, far)).rejects.toThrow(/found far from the others/);
  });

  it("prefers the match nearest to where you said you are", async () => {
    const two: Deps = {
      ...deps,
      geocode: async (q) =>
        q === "61 Teaberry Drive"
          ? [{ id: "tx", name: "x", address: "Texas", lat: 30, lng: -97 }, { id: q, ...spots[q] }]
          : [{ id: q, ...spots[q] }],
    };
    const r = await relocateDemo({ ...opts, apply: false, near: { lat: 40.5, lng: -74.4 } }, two);
    expect(r.places[1].found).toBe("61 Teaberry Dr, Edison, NJ");
  });

  it("adds a route on real roads and moves only Sam and Ava", async () => {
    const before = new Map([...routes.values()].map((r) => [r.name, JSON.stringify(r.stops.map((x) => x.studentIds))]));
    const sam = findUserByEmail("student@wheelie.demo")!;
    const ava = findUserByEmail("student2@wheelie.demo")!;
    const maya = findUserByEmail("maya@wheelie.demo")!;
    const r = await relocateDemo({ ...opts, apply: true }, deps);
    expect(r.applied).toBe(true);
    expect(r.route.replaced).toBe(false);

    const route = [...routes.values()].find((x) => x.name === "Morning Run - St. Thomas Aquinas")!;
    expect(route.stops.map((x) => x.name)).toEqual(["61 Tingley Lane", "61 Teaberry Drive"]);
    expect(route.stops[0].studentIds).toEqual([sam.id]);
    expect(route.stops[1].studentIds).toEqual([ava.id]);
    expect(route.schoolLocation).toEqual({ lat: 40.52, lng: -74.39 });
    expect(route.driverId).toBe(findUserByEmail("driver@wheelie.demo")!.id);
    expect(route.geometry!.length).toBe(4);
    expect(route.clearanceChecked).toBe(true);
    expect(route.status).toBe("sent");
    expect(findUserByEmail("school@wheelie.demo")!.name).toBe("Ironbound Demo School");

    // Everyone else stays on their old routes; Sam and Ava are gone from theirs.
    const ironbound = morning();
    expect(ironbound.stops.flatMap((x) => x.studentIds)).toContain(maya.id);
    expect(ironbound.stops.flatMap((x) => x.studentIds)).not.toContain(sam.id);
    const north = [...routes.values()].find((x) => x.name === "Morning Run - North Ward")!;
    expect(north.stops.flatMap((x) => x.studentIds)).not.toContain(ava.id);
    const total = (name: string) => JSON.parse(before.get(name)!).flat().length;
    expect(north.stops.flatMap((x) => x.studentIds).length).toBe(total("Morning Run - North Ward") - 1);
    expect(ironbound.stops.flatMap((x) => x.studentIds).length).toBe(total("Morning Run - Ironbound") - 1);
    const south = [...routes.values()].find((x) => x.name === "Afternoon Run - South Ward")!;
    expect(JSON.stringify(south.stops.map((x) => x.studentIds))).toBe(before.get("Afternoon Run - South Ward"));
  });

  it("can be run again without making a second route", async () => {
    const r = await relocateDemo({ ...opts, apply: true }, deps);
    expect(r.route.replaced).toBe(true);
    expect([...routes.values()].filter((x) => x.name === "Morning Run - St. Thomas Aquinas")).toHaveLength(1);
  });
});
