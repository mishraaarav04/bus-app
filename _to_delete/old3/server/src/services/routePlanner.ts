import type { BusSpec, GeoPoint } from "../types.js";
import { distanceMeters } from "./geofence.js";
import { directions, optimizeFixedEnds } from "./mapbox.js";

export interface PlanInput {
  stops: { name: string; location: GeoPoint }[];
  school: GeoPoint;
  direction: "to_school" | "to_home";
  vehicle: BusSpec;
}

export interface PlanResult {
  order: number[]; // indexes into input.stops, in driving order
  geometry: [number, number][];
  totalDurationSec: number;
  totalDistanceM: number;
}

/**
 * Turns an unordered list of stops into the fastest drivable route.
 *
 * 1. The stop farthest from the school becomes the far end of the run (first
 *    stop going to school, last stop going home). Mapbox's one-way
 *    optimisation needs fixed first/last points, so we pin the two ends.
 * 2. Mapbox Optimization orders the stops in between.
 * 3. Mapbox Directions then builds the road path for the whole run using the
 *    bus's height/width/weight, so the geometry and times respect clearance.
 *
 * Caveat worth showing users: the ordering step doesn't know about clearance,
 * and clearance data coverage varies by region.
 */
export async function planRoute(input: PlanInput): Promise<PlanResult> {
  const { stops, school, direction, vehicle } = input;

  let farIdx = 0;
  let farDist = -1;
  stops.forEach((s, i) => {
    const d = distanceMeters(s.location, school);
    if (d > farDist) {
      farDist = d;
      farIdx = i;
    }
  });

  const others = stops.map((_, i) => i).filter((i) => i !== farIdx);

  let middle = others;
  if (others.length >= 2) {
    const pts =
      direction === "to_school"
        ? [stops[farIdx].location, ...others.map((i) => stops[i].location), school]
        : [school, ...others.map((i) => stops[i].location), stops[farIdx].location];
    const tripOrder = await optimizeFixedEnds(pts);
    // Drop the two fixed ends (first and last of the trip), map back to stop indexes.
    // Inputs are laid out as [fixed, ...others, fixed] / [fixed, ...others, fixed].
    middle = tripOrder
      .filter((inputIdx) => inputIdx !== 0 && inputIdx !== pts.length - 1)
      .map((inputIdx) => others[inputIdx - 1]);
  }

  const order = direction === "to_school" ? [farIdx, ...middle] : [...middle, farIdx];

  const stopPts = order.map((i) => stops[i].location);
  const path = direction === "to_school" ? [...stopPts, school] : [school, ...stopPts];
  const dir = await directions(path, vehicle);

  return {
    order,
    geometry: dir.geometry,
    totalDurationSec: Math.round(dir.durationSec),
    totalDistanceM: Math.round(dir.distanceM),
  };
}
