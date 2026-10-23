import { config } from "../config.js";
import type { BusSpec, GeoPoint } from "../types.js";

const BASE = "https://api.mapbox.com";

export class MapboxError extends Error {
  constructor(message: string, public status = 502, public code?: string) {
    super(message);
  }
}

export const mapboxEnabled = () => Boolean(config.mapboxToken);

const coordStr = (p: GeoPoint) => `${p.lng},${p.lat}`;

async function mapboxGet(path: string, params: Record<string, string>) {
  if (!config.mapboxToken) {
    throw new MapboxError("Mapbox isn't set up on the server yet (MAPBOX_TOKEN).", 503);
  }
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", config.mapboxToken);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new MapboxError("Couldn't reach Mapbox. Try again in a moment.", 504);
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401 || res.status === 403) {
    throw new MapboxError("The Mapbox token was rejected. Check MAPBOX_TOKEN.", 502, "auth");
  }
  if (res.status === 429) {
    throw new MapboxError("Mapbox rate limit hit. Try again shortly.", 429, "rate");
  }
  return { res, json };
}

// ---- address search (Geocoding v6) ----------------------------------------

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export async function geocode(q: string, near?: GeoPoint): Promise<PlaceResult[]> {
  const params: Record<string, string> = { q, limit: "5", autocomplete: "true" };
  if (near) params.proximity = coordStr(near);
  const { res, json } = await mapboxGet("/search/geocode/v6/forward", params);
  if (!res.ok) throw new MapboxError("Address search failed.", 502);
  return (json?.features ?? []).map((f: any) => ({
    id: String(f.id),
    name: String(f.properties?.name ?? ""),
    address: String(f.properties?.full_address ?? f.properties?.place_formatted ?? ""),
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

// ---- ordering (Optimization v1) --------------------------------------------

/**
 * Orders `coords` with the first and last points fixed. Returns the input
 * indexes in trip order. NOTE: the Optimization API has no vehicle-size
 * options, so ordering is NOT clearance-aware - the road path between the
 * chosen stops is (see `directions`).
 */
export async function optimizeFixedEnds(coords: GeoPoint[]): Promise<number[]> {
  const path = `/optimized-trips/v1/mapbox/driving/${coords.map(coordStr).join(";")}`;
  const { res, json } = await mapboxGet(path, {
    source: "first",
    destination: "last",
    roundtrip: "false",
    overview: "false",
  });
  if (!res.ok || json?.code !== "Ok") {
    throw new MapboxError(
      json?.message ?? "Mapbox couldn't order these stops. Check each stop is near a road.",
      502,
      json?.code
    );
  }
  const waypoints: { waypoint_index: number }[] = json.waypoints;
  return waypoints
    .map((w, inputIndex) => ({ inputIndex, pos: w.waypoint_index }))
    .sort((a, b) => a.pos - b.pos)
    .map((w) => w.inputIndex);
}

// ---- road path with clearance (Directions v5) --------------------------------

export interface DirectionsResult {
  geometry: [number, number][];
  durationSec: number;
  distanceM: number;
  legDurationsSec: number[];
}

export async function directions(coords: GeoPoint[], bus: BusSpec): Promise<DirectionsResult> {
  const path = `/directions/v5/mapbox/driving/${coords.map(coordStr).join(";")}`;
  const { res, json } = await mapboxGet(path, {
    geometries: "geojson",
    overview: "full",
    steps: "false",
    max_height: String(bus.heightM),
    max_width: String(bus.widthM),
    max_weight: String(bus.weightT),
  });
  if (json?.code === "NoRoute") {
    throw new MapboxError(
      `No route found that fits a ${bus.heightM} m tall bus. A stop may only be reachable under a low bridge.`,
      422,
      "NoRoute"
    );
  }
  if (!res.ok || json?.code !== "Ok" || !json.routes?.[0]) {
    throw new MapboxError(
      json?.message ?? "Mapbox couldn't build a road route for these stops.",
      502,
      json?.code
    );
  }
  const r = json.routes[0];
  return {
    geometry: r.geometry.coordinates,
    durationSec: r.duration,
    distanceM: r.distance,
    legDurationsSec: (r.legs ?? []).map((l: any) => l.duration),
  };
}
