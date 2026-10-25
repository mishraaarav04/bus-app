import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveRides } from "../lib/hooks";
import { formatEta, incidentLabel } from "../lib/format";
import { Empty, PageHead, Spinner } from "../components/ui";
import { LazyMap, type MapMarker } from "../components/LazyMap";

export function Overview() {
  const { rides, loading } = useLiveRides();
  const [sel, setSel] = useState<string | null>(null);
  const selected = rides.find((r) => r.session.id === sel) ?? rides[0];

  const stats = useMemo(() => {
    const riders = rides.reduce((n, r) => n + r.riderCount, 0);
    const boarded = rides.reduce((n, r) => n + r.boardedCount, 0);
    return { live: rides.length, riders, boarded, issues: rides.filter((r) => r.incident).length };
  }, [rides]);

  const { markers, lines } = useMemo(() => {
    const m: MapMarker[] = [];
    const l: [number, number][][] = [];
    for (const r of rides.length && selected ? [selected] : []) {
      r.route.stops.forEach((s) =>
        m.push({ id: s.id, lng: s.location.lng, lat: s.location.lat, kind: r.session.completedStopIds.includes(s.id) ? "done" : "stop", label: String(s.order + 1), popup: s.name })
      );
      m.push({ id: "school", lng: r.route.schoolLocation.lng, lat: r.route.schoolLocation.lat, kind: "school", popup: "School" });
      if (r.session.busLocation) m.push({ id: "bus", lng: r.session.busLocation.lng, lat: r.session.busLocation.lat, kind: "bus", popup: r.routeName });
      if (r.route.geometry) l.push(r.route.geometry);
    }
    return { markers: m, lines: l };
  }, [rides, selected]);

  return (
    <>
      <PageHead title="Live overview" />
      <div className="stats">
        <div className="stat live"><b>{stats.live}</b><span>Buses running</span></div>
        <div className="stat"><b>{stats.boarded}<small style={{ fontSize: 18, color: "var(--muted)" }}> / {stats.riders}</small></b><span>Students on board</span></div>
        <div className={`stat ${stats.issues ? "hot" : ""}`}><b>{stats.issues}</b><span>Rides with a problem</span></div>
        <div className="stat"><b>{rides.reduce((n, r) => n + r.progress.remaining, 0)}</b><span>Stops still to go</span></div>
      </div>
      <div className="split">
        <div style={{ minHeight: 480 }}>
          <LazyMap markers={markers} lines={lines} fitKey={selected?.session.id} />
        </div>
        <div className="card">
          <h2>Running now</h2>
          {loading ? <Spinner /> : rides.length === 0 ? (
            <Empty title="No buses are running">When a driver starts a route, it shows up here.</Empty>
          ) : (
            <div className="list">
              {rides.map((r) => (
                <div key={r.session.id} className={`ride${selected?.session.id === r.session.id ? " sel" : ""}`} onClick={() => setSel(r.session.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(r.session.id)}>
                  <div className="row space">
                    <b>{r.routeName}</b>
                    {r.incident ? <span className="pill red">{incidentLabel(r.incident)}</span> : (r.session.delayForecastMin ?? 0) >= 5 ? <span className="pill amber">About {r.session.delayForecastMin} min behind usual</span> : <span className="pill green"><i className="dot" />On track</span>}
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>
                    {r.boardedCount} of {r.riderCount} boarded · {r.progress.completed} of {r.progress.total} stops · school in {formatEta(r.progress.etaToSchoolSec)}
                  </div>
                  <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${r.progress.total ? (100 * r.progress.completed) / r.progress.total : 0}%` }} /></div>
                  <Link to={`/app/routes/${r.route.id}`} className="hint" onClick={(e) => e.stopPropagation()}>Route details</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
