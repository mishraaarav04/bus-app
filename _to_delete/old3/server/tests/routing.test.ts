import { describe, it, expect } from "vitest";
import type { Route } from "../src/types.js";
import {
  startRideSession,
  markStudentNotRiding,
  updateBusLocation,
  advancePastStop,
  evaluateGeofences,
} from "../src/services/routing.js";

// A simple 3-stop route heading north, then the school further north.
// Stops are spaced ~0.01 degrees latitude apart (~1.1km) so distance/ETA
// math is easy to reason about.
function buildRoute(): Route {
  return {
    id: "route-1",
    name: "Test Route",
    direction: "to_school",
    schoolLocation: { lat: 40.03, lng: -74.0 },
    stops: [
      {
        id: "stop-a",
        name: "Stop A",
        location: { lat: 40.0, lng: -74.0 },
        order: 0,
        studentIds: ["student-1"],
        radiusMeters: 100,
      },
      {
        // Deliberately off to the side of the A->C line, so it's a real
        // detour — skipping it should shorten the path to stop-c.
        id: "stop-b",
        name: "Stop B",
        location: { lat: 40.01, lng: -73.99 },
        order: 1,
        studentIds: ["student-2"],
        radiusMeters: 100,
      },
      {
        id: "stop-c",
        name: "Stop C",
        location: { lat: 40.02, lng: -74.0 },
        order: 2,
        studentIds: ["student-3", "student-4"],
        radiusMeters: 100,
      },
    ],
  };
}

describe("reroute on skip", () => {
  it("removes a stop from the live route when its only rider flags not-riding", () => {
    const route = buildRoute();
    const session = startRideSession("ride-1", route, "driver-1");
    updateBusLocation(session, route, { lat: 39.99, lng: -74.0 });

    expect(session.remainingStopIds).toEqual(["stop-a", "stop-b", "stop-c"]);
    const etaBBefore = session.stopStates["stop-b"].etaSeconds!;
    const etaCBefore = session.stopStates["stop-c"].etaSeconds!;

    const result = markStudentNotRiding(session, route, "student-2");

    expect(result.rerouted).toBe(true);
    expect(result.skippedStopId).toBe("stop-b");
    expect(session.remainingStopIds).toEqual(["stop-a", "stop-c"]);
    expect(session.stopStates["stop-b"].status).toBe("skipped");
    expect(session.stopStates["stop-b"].skippedReason).toBe("no_riders");

    // The whole point: downstream ETA should get EARLIER once stop-b is
    // skipped, since the bus no longer detours there.
    const etaCAfter = session.stopStates["stop-c"].etaSeconds!;
    expect(etaCAfter).toBeLessThan(etaCBefore);
    expect(etaBBefore).toBeGreaterThan(0);
  });

  it("does NOT skip a stop if another student there is still riding", () => {
    const route = buildRoute();
    const session = startRideSession("ride-1", route, "driver-1");
    updateBusLocation(session, route, { lat: 39.99, lng: -74.0 });

    const result = markStudentNotRiding(session, route, "student-3");

    expect(result.rerouted).toBe(false);
    expect(session.remainingStopIds).toContain("stop-c");
    expect(session.stopStates["stop-c"].studentStatuses["student-3"]).toBe(
      "skipped"
    );
    expect(session.stopStates["stop-c"].studentStatuses["student-4"]).toBe(
      "pending"
    );
  });

  it("is a no-op if the stop already passed", () => {
    const route = buildRoute();
    const session = startRideSession("ride-1", route, "driver-1");
    updateBusLocation(session, route, { lat: 40.0, lng: -74.0 });
    advancePastStop(session, route, "stop-a");

    const result = markStudentNotRiding(session, route, "student-1");
    expect(result.rerouted).toBe(false);
    expect(session.completedStopIds).toEqual(["stop-a"]);
  });
});

describe("geofence boarding/missed detection", () => {
  it("marks a student boarded when both bus and student are inside the stop geofence", () => {
    const route = buildRoute();
    const session = startRideSession("ride-1", route, "driver-1");
    updateBusLocation(session, route, { lat: 40.0, lng: -74.0 }); // at stop-a

    evaluateGeofences(session, route, {
      "student-1": { lat: 40.0001, lng: -74.0 }, // ~11m away, within 100m radius
    });

    expect(session.stopStates["stop-a"].studentStatuses["student-1"]).toBe(
      "boarded"
    );
  });

  it("marks a student missed once the bus advances past their stop without boarding", () => {
    const route = buildRoute();
    const session = startRideSession("ride-1", route, "driver-1");
    updateBusLocation(session, route, { lat: 40.0, lng: -74.0 }); // at stop-a

    // Student never shows up near the stop.
    evaluateGeofences(session, route, {});
    expect(session.stopStates["stop-a"].studentStatuses["student-1"]).toBe(
      "pending"
    );

    advancePastStop(session, route, "stop-a");
    expect(session.stopStates["stop-a"].studentStatuses["student-1"]).toBe(
      "missed"
    );
    expect(session.stopStates["stop-a"].status).toBe("missed");
    expect(session.remainingStopIds).not.toContain("stop-a");
  });
});
