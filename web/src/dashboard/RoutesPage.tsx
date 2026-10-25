import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoad } from "../lib/hooks";
import { formatDuration, formatMiles } from "../lib/format";
import { Empty, ErrorText, Field, Modal, PageHead, Spinner } from "../components/ui";
import { LazyMap, type MapMarker } from "../components/LazyMap";
import type { CompanyOverview, PlaceResult } from "../lib/types";

interface Draft { name: string; lat: number; lng: number }

function Builder({ overview, onClose, onDone }: { overview: CompanyOverview; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState(overview.schools[0]?.id ?? "");
  const [direction, setDirection] = useState<"to_school" | "to_home">("to_school");
  const [startTime, setStartTime] = useState("");
  const [stops, setStops] = useState<Draft[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const school = overview.schools.find((s) => s.id === schoolId);

  async function search() {
    if (!q.trim()) return;
    setErr("");
    try {
      setResults(await api.search(q.trim(), school?.location));
    } catch (e: any) {
      setErr(e.message);
    }
  }
  const add = (d: Draft) => stops.length < 11 && setStops((s) => [...s, d]);

  async function save() {
    setErr("");
    setBusy(true);
    try {
      await api.createRoute({
        name: name.trim(), schoolId, direction,
        startTime: startTime || undefined,
        stops: stops.map((s) => ({ name: s.name, location: { lat: s.lat, lng: s.lng } })),
      });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const markers: MapMarker[] = stops.map((s, i) => ({ id: `s${i}`, lng: s.lng, lat: s.lat, kind: "stop", label: String(i + 1), popup: s.name }));
  if (school?.location) markers.push({ id: "school", lng: school.location.lng, lat: school.location.lat, kind: "school" });

  return (
    <Modal title="New route" onClose={onClose}>
      <div className="grid2">
        <Field label="Route name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Route 12" /></Field>
        <Field label="School">
          <select className="input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            {overview.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Direction">
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
            <option value="to_school">Home to school</option>
            <option value="to_home">School to home</option>
          </select>
        </Field>
        <Field label="Start time" hint="Optional. The route starts itself at this time.">
          <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Add stops" hint="Search an address or click the map. RouteIQ puts the stops in the fastest order. Up to 11.">
        <div className="row">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())} placeholder="Search for an address" />
          <button type="button" className="btn btn-soft" onClick={() => void search()}>Search</button>
        </div>
      </Field>
      {results.length > 0 && (
        <div className="list">
          {results.slice(0, 5).map((r) => (
            <div key={r.id} className="row space">
              <span><b>{r.name}</b><div className="hint">{r.address}</div></span>
              <button type="button" className="btn btn-sm btn-soft" onClick={() => { add({ name: r.name, lat: r.lat, lng: r.lng }); setResults([]); setQ(""); }}>Add stop</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 240 }}>
        <LazyMap markers={markers} fitKey={`${schoolId}-${stops.length}`} onMapClick={(lng, lat) => add({ name: `Stop ${stops.length + 1}`, lat, lng })} />
      </div>
      {stops.length > 0 && (
        <div className="list">
          {stops.map((s, i) => (
            <div key={i} className="row space">
              <input className="input" style={{ maxWidth: 360 }} value={s.name} onChange={(e) => setStops((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`Stop ${i + 1} name`} />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setStops((all) => all.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <ErrorText>{err}</ErrorText>
      <button className="btn btn-primary" disabled={busy || !name.trim() || !schoolId || stops.length === 0} onClick={() => void save()}>
        {busy ? "Building route..." : "Build route"}
      </button>
    </Modal>
  );
}

export function RoutesPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const company = user?.role === "company";
  const routes = useLoad(() => api.listRoutes());
  const overview = useLoad(() => (company ? api.companyOverview() : Promise.resolve(null)), [company]);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHead title="Routes" sub={company ? "Build routes, assign drivers, and send them out." : "The routes that serve your school."}>
        {company && (
          <button className="btn btn-primary" disabled={!overview.data?.schools.length} onClick={() => setOpen(true)}>New route</button>
        )}
      </PageHead>
      <div className="card">
        {routes.loading ? <Spinner /> : routes.error ? <ErrorText>{routes.error}</ErrorText> : !routes.data?.length ? (
          <Empty title="No routes yet">{company ? (overview.data?.schools.length ? "Choose New route to build one." : "Add a school on the Drivers & schools page first.") : "Your bus company will add routes here."}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Route</th><th>Direction</th><th>Stops</th><th>Distance</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>
                {routes.data.map((r) => (
                  <tr key={r.id} className="click" onClick={() => nav(`/app/routes/${r.id}`)}>
                    <td><Link to={`/app/routes/${r.id}`}><b>{r.name}</b></Link></td>
                    <td>{r.direction === "to_school" ? "To school" : "To home"}</td>
                    <td>{r.stops.length}</td>
                    <td>{formatMiles(r.totalDistanceM)}</td>
                    <td>{formatDuration(r.totalDurationSec)}</td>
                    <td>{r.status === "draft" ? <span className="pill amber">Draft</span> : <span className="pill green">Sent</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && overview.data && <Builder overview={overview.data} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void routes.reload(); }} />}
    </>
  );
}
