import { useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { download, ymd } from "../lib/format";
import { Empty, ErrorText, Field, PageHead, Spinner } from "../components/ui";

export function Reports() {
  const today = new Date();
  const [from, setFrom] = useState(ymd(new Date(today.getTime() - 29 * 864e5)));
  const [to, setTo] = useState(ymd(today));
  const { data, loading, error } = useLoad(() => api.reportSummary(from, to), [from, to]);
  const [err, setErr] = useState("");

  async function csv(kind: "rides" | "boardings") {
    setErr("");
    try {
      const text = kind === "rides" ? await api.ridesCsv(from, to) : await api.boardingsCsv(from, to);
      download(`routeiq-${kind}-${from}-to-${to}.csv`, text);
    } catch (e: any) { setErr(e.message); }
  }
  const t = data?.totals;
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");

  return (
    <>
      <PageHead title="Reports">
        <button className="btn btn-outline" onClick={() => void csv("rides")}>Rides CSV</button>
        <button className="btn btn-outline" onClick={() => void csv("boardings")}>Boardings CSV</button>
      </PageHead>
      <div className="card row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <Field label="From"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <ErrorText>{err || error}</ErrorText>
      {loading && !data ? <Spinner /> : t && (
        <>
          <div className="stats">
            <div className="stat"><b>{t.rides}</b><span>Rides completed</span></div>
            <div className="stat"><b>{t.boardedPct == null ? "-" : `${Math.round(t.boardedPct)}%`}</b><span>Students boarded</span></div>
            <div className="stat live"><b>{pct(t.onTimeRides, t.scheduledRides)}</b><span>On-time rides{t.avgLateMin != null ? ` · ${Math.round(t.avgLateMin)} min late on average` : ""}</span></div>
            <div className={`stat ${t.incidents ? "hot" : ""}`}><b>{t.incidents}</b><span>Incidents</span></div>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>By route</h2>
            {data!.routes.length === 0 ? <Empty title="No rides in this range" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Route</th><th>Rides</th><th>Boarded</th><th>Missed</th><th>On time</th><th>Incidents</th></tr></thead>
                <tbody>{data!.routes.map((r) => (
                  <tr key={r.routeId}><td><b>{r.routeName}</b></td><td>{r.rides}</td><td>{r.boardedPct == null ? "-" : `${Math.round(r.boardedPct)}%`}</td><td>{r.missed}</td><td>{pct(r.onTimeRides, r.scheduledRides)}</td><td>{r.incidents}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          <div className="card">
            <h2>Recent rides</h2>
            {data!.rides.length === 0 ? <Empty title="Nothing to show yet" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Date</th><th>Route</th><th>Driver</th><th>Boarded</th><th>Late</th><th>Incidents</th></tr></thead>
                <tbody>{data!.rides.slice(0, 50).map((r) => (
                  <tr key={r.rideId}>
                    <td>{r.date}</td><td>{r.routeName}</td><td>{r.driverName ?? "-"}</td>
                    <td>{r.boarded} / {r.riders}</td>
                    <td>{r.lateMin == null ? "-" : r.lateMin <= 0 ? <span className="pill green">On time</span> : <span className="pill amber">{Math.round(r.lateMin)} min</span>}</td>
                    <td>{r.incidents || "-"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}
    </>
  );
}
