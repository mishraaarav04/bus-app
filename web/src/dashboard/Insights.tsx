import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { Empty, ErrorText, PageHead, Spinner } from "../components/ui";

const KIND: Record<string, string> = {
  slow_ride: "Ran long",
  late_trend: "Starting late",
  stopped_riding: "Stopped riding",
  incident_cluster: "Repeat problems",
  merge_stops: "Merge stops",
  overlap: "Overlap",
  consolidate: "Share a bus",
  overloaded: "Nearly full",
};
const min = (sec: number | null) => (sec == null ? "-" : `${Math.round((sec / 60) * 10) / 10} min`);

export function Insights() {
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const first = useLoad(() => api.insights(), []);
  const other = useLoad(() => api.insights(first.data?.tomorrow), [first.data?.tomorrow]);

  if (first.loading) return <Spinner />;
  const d = first.data;
  if (!d) return <ErrorText>{first.error}</ErrorText>;
  const forecast = day === "today" ? d.forecast : other.data?.forecast ?? [];
  const expected = d.forecast.reduce((n, r) => n + r.expected, 0);
  const assigned = d.forecast.reduce((n, r) => n + r.assigned, 0);
  const acc = d.etaAccuracy;

  return (
    <>
      <PageHead title="Insights" />
      <div className="stats">
        <div className="stat live">
          <b>{acc.learnedErrorSec == null ? "-" : min(acc.learnedErrorSec)}</b>
          <span>{acc.improvementPct == null ? `Arrival estimates are still learning (${acc.samples} stops so far)` : `Average miss on arrival times, ${acc.improvementPct}% closer than distance alone`}</span>
        </div>
        <div className="stat"><b>{Math.round(expected)}<small style={{ fontSize: 18, color: "var(--muted)" }}> / {assigned}</small></b><span>Students expected today</span></div>
        <div className={`stat ${d.anomalies.length ? "hot" : ""}`}><b>{d.anomalies.length}</b><span>Things worth a look</span></div>
        <div className="stat"><b>{d.suggestions.length}</b><span>Route ideas</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row space">
          <h2>Who will ride</h2>
          <div className="chips">
            {(["today", "tomorrow"] as const).map((k) => (
              <button key={k} className={`btn btn-sm ${day === k ? "btn-primary" : "btn-outline"}`} onClick={() => setDay(k)}>{k === "today" ? "Today" : "Tomorrow"}</button>
            ))}
          </div>
        </div>
        {forecast.length === 0 ? <Empty title="No routes with students yet" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Route</th><th>Start</th><th>Expected</th><th>Planned absences</th><th>Often absent</th></tr></thead>
            <tbody>{forecast.map((r) => (
              <tr key={r.routeId}>
                <td><Link to={`/app/routes/${r.routeId}`}><b>{r.routeName}</b></Link></td>
                <td>{r.startTime ?? "-"}</td>
                <td><b>{Math.round(r.expected)}</b> of {r.assigned}</td>
                <td>{r.plannedAbsences || "-"}</td>
                <td>{r.unlikely ? `${r.unlikely} students` : "-"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>Based on each student’s own pattern on this weekday over the last 12 weeks, minus planned absences. It sharpens as rides are recorded.</p>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Worth a look</h2>
          {d.anomalies.length === 0 ? <Empty title="Nothing unusual">Rides are running about the way they usually do.</Empty> : (
            <div className="list">{d.anomalies.map((a) => (
              <div key={a.id}>
                <div className="row space"><b>{a.title}</b><span className="pill amber">{KIND[a.kind]}</span></div>
                <div className="hint">{a.detail}</div>
                <Link to={`/app/routes/${a.routeId}`} className="hint">Open {a.routeName}</Link>
              </div>
            ))}</div>
          )}
        </div>
        <div className="card">
          <h2>Ways to tighten routes</h2>
          {d.suggestions.length === 0 ? <Empty title="No changes suggested">Stops and riders look well balanced.</Empty> : (
            <div className="list">{d.suggestions.map((s) => (
              <div key={s.id}>
                <div className="row space"><b>{s.title}</b><span className="pill orange">{KIND[s.kind]}</span></div>
                <div className="hint">{s.detail}</div>
                <div className="chips">{s.routeIds.map((id) => <Link key={id} to={`/app/routes/${id}`} className="hint">Open route</Link>)}</div>
              </div>
            ))}</div>
          )}
          <p className="hint" style={{ marginTop: 10 }}>These are ideas only. Nothing changes until you edit a route.</p>
        </div>
      </div>
    </>
  );
}
