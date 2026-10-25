import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoad } from "../lib/hooks";
import { formatDuration, formatMiles, mToFt } from "../lib/format";
import { Empty, ErrorText, Field, PageHead, Spinner } from "../components/ui";
import { LazyMap, type MapMarker } from "../components/LazyMap";

export function RouteDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const company = user?.role === "company";
  const routes = useLoad(() => api.listRoutes(), [id]);
  const overview = useLoad(() => (company ? api.companyOverview() : Promise.resolve(null)), [company]);
  const students = useLoad(() => (company ? Promise.resolve(null) : api.schoolStudents()), [company]);
  const [err, setErr] = useState("");
  const [time, setTime] = useState<string | null>(null);

  const route = routes.data?.find((r) => r.id === id);
  if (routes.loading) return <Spinner />;
  if (!route) return <Empty title="Route not found"><Link to="/app/routes">Back to routes</Link></Empty>;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setErr("");
    try {
      await fn();
      await routes.reload();
      after?.();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const nameOf = (sid: string) => students.data?.students.find((s) => s.id === sid)?.name ?? "Student";
  const markers: MapMarker[] = [
    ...route.stops.map((s) => ({ id: s.id, lng: s.location.lng, lat: s.location.lat, kind: "stop" as const, label: String(s.order + 1), popup: s.name })),
    { id: "school", lng: route.schoolLocation.lng, lat: route.schoolLocation.lat, kind: "school" as const, popup: "School" },
  ];

  return (
    <>
      <PageHead title={route.name} sub={`${route.direction === "to_school" ? "Home to school" : "School to home"} · ${route.stops.length} stops · ${formatMiles(route.totalDistanceM)} · ${formatDuration(route.totalDurationSec)}`}>
        <Link to="/app/routes" className="btn btn-outline">All routes</Link>
      </PageHead>
      <ErrorText>{err}</ErrorText>
      <div className="split">
        <div style={{ minHeight: 440 }}><LazyMap markers={markers} lines={route.geometry ? [route.geometry] : []} fitKey={route.id} /></div>
        <div className="stack">
          <div className="card">
            <h2>Stops</h2>
            <div className="list">
              {[...route.stops].sort((a, b) => a.order - b.order).map((s) => (
                <div key={s.id}>
                  <b>{s.order + 1}. {s.name}</b>
                  <div className="hint">{s.studentIds.length ? s.studentIds.map(nameOf).join(", ") : "No students assigned"}</div>
                </div>
              ))}
            </div>
            {route.vehicle && <p className="hint" style={{ marginTop: 10 }}>Planned for a bus {mToFt(route.vehicle.heightM)} ft tall, {mToFt(route.vehicle.widthM)} ft wide.</p>}
          </div>
          {company && (
            <div className="card stack">
              <h2>Manage</h2>
              <Field label="Driver">
                <select className="input" value={route.driverId ?? ""} onChange={(e) => void run(() => api.assignDriver(route.id, e.target.value || null))}>
                  <option value="">No driver</option>
                  {overview.data?.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Start time" hint="The route starts itself at this time on school days.">
                <div className="row">
                  <input className="input" type="time" value={time ?? route.startTime ?? ""} onChange={(e) => setTime(e.target.value)} />
                  <button className="btn btn-soft" onClick={() => void run(() => api.setSchedule(route.id, time || null), () => setTime(null))}>Save</button>
                </div>
              </Field>
              <div className="row">
                {route.status === "draft" && <button className="btn btn-primary" onClick={() => void run(() => api.sendRoute(route.id))}>Send to driver</button>}
                <button className="btn btn-outline" onClick={() => { if (confirm(`Delete ${route.name}?`)) void run(() => api.deleteRoute(route.id), () => nav("/app/routes")); }}>Delete route</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
