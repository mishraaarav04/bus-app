import type { GeoPoint } from "../types.js";

/** Shortest distance in metres from a point to a path of [lng, lat] pairs. */
export function distanceToPolylineMeters(p: GeoPoint, path: [number, number][]): number {
  if (path.length === 0) return Infinity;
  // Flatten to metres around the point; accurate enough over a few km.
  const mPerDegLat = 110_540;
  const mPerDegLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const toXY = ([lng, lat]: [number, number]) => ({
    x: (lng - p.lng) * mPerDegLng,
    y: (lat - p.lat) * mPerDegLat,
  });

  let best = Infinity;
  let prev = toXY(path[0]);
  best = Math.min(best, Math.hypot(prev.x, prev.y));
  for (let i = 1; i < path.length; i++) {
    const cur = toXY(path[i]);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const len2 = dx * dx + dy * dy;
    // Projection of the origin (the point) onto the segment, clamped to it.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-prev.x * dx + -prev.y * dy) / len2));
    best = Math.min(best, Math.hypot(prev.x + t * dx, prev.y + t * dy));
    prev = cur;
  }
  return best;
}
