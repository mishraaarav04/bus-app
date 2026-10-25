import { describe, it, expect } from "vitest";
import { distanceMeters, isWithinGeofence } from "../src/services/geofence.js";

describe("geofence math", () => {
  it("computes ~0 distance for the same point", () => {
    const p = { lat: 40.0, lng: -74.0 };
    expect(distanceMeters(p, p)).toBeCloseTo(0, 3);
  });

  it("computes roughly correct distance for a known offset", () => {
    // ~0.01 degrees latitude is about 1.1km.
    const a = { lat: 40.0, lng: -74.0 };
    const b = { lat: 40.01, lng: -74.0 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });

  it("isWithinGeofence respects the radius", () => {
    const center = { lat: 40.0, lng: -74.0 };
    const near = { lat: 40.0005, lng: -74.0 }; // ~55m
    const far = { lat: 40.01, lng: -74.0 }; // ~1.1km
    expect(isWithinGeofence(near, center, 100)).toBe(true);
    expect(isWithinGeofence(far, center, 100)).toBe(false);
  });
});
