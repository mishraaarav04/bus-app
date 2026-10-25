import { lazy, Suspense } from "react";
import type { MapMarker } from "./MapView";
export type { MapMarker };
const MapView = lazy(() => import("./MapView"));

export function LazyMap(props: React.ComponentProps<typeof MapView>) {
  return (
    <Suspense fallback={<div className="mapbox"><div className="map-msg"><span>Loading map...</span></div></div>}>
      <MapView {...props} />
    </Suspense>
  );
}
