import { useEffect, useRef, useState } from "react";
import { useMapConfig } from "../lib/hooks";

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  kind: "stop" | "school" | "bus" | "done";
  label?: string;
  popup?: string;
}
interface Props {
  markers: MapMarker[];
  lines?: [number, number][][];
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lng: number, lat: number) => void;
  fitKey?: string; // refit the view when this changes
}

/** Mapbox map. The library is loaded on first use so the marketing page stays light. */
export default function MapView({ markers, lines = [], onMarkerClick, onMapClick, fitKey }: Props) {
  const cfg = useMapConfig();
  const el = useRef<HTMLDivElement>(null);
  const state = useRef<{ map: any; mb: any; live: Map<string, any>; fitted?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const pickRef = useRef(onMarkerClick);
  pickRef.current = onMarkerClick;

  useEffect(() => {
    if (!cfg?.enabled || !cfg.token || !el.current) return;
    let dead = false;
    (async () => {
      const mb = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (dead || !el.current) return;
      mb.accessToken = cfg.token!;
      const map = new mb.Map({ container: el.current, style: "mapbox://styles/mapbox/streets-v12", center: [-74.17, 40.73], zoom: 10 });
      map.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (e: any) => clickRef.current?.(e.lngLat.lng, e.lngLat.lat));
      map.on("load", () => {
        map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "lines", type: "line", source: "lines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FF7A1A", "line-width": 5, "line-opacity": 0.9 } });
        state.current = { map, mb, live: new Map() };
        setReady(true);
      });
    })();
    return () => {
      dead = true;
      state.current?.map.remove();
      state.current = null;
      setReady(false);
    };
  }, [cfg?.enabled, cfg?.token]);

  useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    const { map, mb, live } = s;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      let mk = live.get(m.id);
      if (!mk) {
        const d = document.createElement("div");
        d.className = `mk ${m.kind === "school" ? "school" : m.kind === "bus" ? "bus" : m.kind === "done" ? "green" : ""}`;
        d.textContent = m.kind === "bus" ? "🚌" : m.kind === "school" ? "S" : m.label ?? "";
        d.style.cursor = onMarkerClick ? "pointer" : "default";
        d.addEventListener("click", (e) => {
          if (pickRef.current) {
            e.stopPropagation();
            pickRef.current(m.id);
          }
        });
        mk = new mb.Marker({ element: d }).setLngLat([m.lng, m.lat]).addTo(map);
        if (m.popup) mk.setPopup(new mb.Popup({ offset: 18 }).setText(m.popup));
        live.set(m.id, mk);
      } else {
        mk.setLngLat([m.lng, m.lat]);
      }
    }
    for (const [id, mk] of live) {
      if (!seen.has(id)) {
        mk.remove();
        live.delete(id);
      }
    }
    (map.getSource("lines") as any)?.setData({
      type: "FeatureCollection",
      features: lines.filter((l) => l.length > 1).map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })),
    });
    const key = fitKey ?? "";
    if (s.fitted !== key && markers.length) {
      s.fitted = key;
      const b = new mb.LngLatBounds();
      markers.forEach((m) => b.extend([m.lng, m.lat]));
      lines.forEach((l) => l.forEach((c) => b.extend(c)));
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
    }
  }, [ready, markers, lines, fitKey]);

  if (cfg && !cfg.enabled) {
    return (
      <div className="mapbox"><div className="map-msg"><b>Map is off</b><span>Add MAPBOX_TOKEN to server/.env and restart the server.</span></div></div>
    );
  }
  return (
    <div className="mapbox">
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {!ready && <div className="map-msg"><span>Loading map...</span></div>}
    </div>
  );
}
