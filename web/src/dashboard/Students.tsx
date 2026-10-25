import { useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { Empty, ErrorText, Modal, PageHead, Spinner } from "../components/ui";
import type { RosterReport } from "../lib/types";

const SAMPLE = "name,email,parent_email\nMaya Singh,maya@example.com,parent@example.com\n";

function Import({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<RosterReport | null>(null);
  const [invites, setInvites] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(commit: boolean) {
    setErr("");
    setBusy(true);
    try {
      const r = commit ? await api.rosterImport(csv, invites) : await api.rosterPreview(csv);
      setReport(r);
      if (commit) onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Import a roster" onClose={onClose}>
      <p className="hint">Paste CSV rows or choose a file. Use the same columns as the sample. Preview first, then import.</p>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setReport(null); } }} />
      <textarea className="input" value={csv} onChange={(e) => { setCsv(e.target.value); setReport(null); }} placeholder={SAMPLE} />
      <label className="row"><input type="checkbox" checked={invites} onChange={(e) => setInvites(e.target.checked)} /> Email invites to the addresses in the file</label>
      <ErrorText>{err}</ErrorText>
      {report && (
        <div className="card">
          <b>{report.dryRun ? "Preview" : "Imported"}: {report.created} new, {report.updated} updated, {report.errors} with errors</b>
          <div className="list">
            {report.rows.filter((r) => r.status === "error" || r.warnings.length).slice(0, 12).map((r) => (
              <div key={r.line}><span className={r.status === "error" ? "error" : ""}>Line {r.line}: {r.name || "(no name)"}</span><div className="hint">{r.message ?? r.warnings.join(" ")}</div></div>
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <button className="btn btn-soft" disabled={busy || !csv.trim()} onClick={() => void run(false)}>Preview</button>
        <button className="btn btn-primary" disabled={busy || !report || report.errors > 0 && report.created + report.updated === 0} onClick={() => void run(true)}>Import</button>
      </div>
    </Modal>
  );
}

export function Students() {
  const { data, loading, error, reload } = useLoad(() => api.schoolStudents());
  const routes = useLoad(() => api.listRoutes());
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");

  async function assign(studentId: string, value: string) {
    setMsg("");
    try {
      if (!value) {
        const cur = data?.students.find((s) => s.id === studentId)?.assignments[0];
        if (cur) await api.assignStudent(cur.routeId, studentId, null);
      } else {
        const [routeId, stopId] = value.split("|");
        await api.assignStudent(routeId, studentId, stopId);
      }
      await reload();
    } catch (e: any) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (!data) return <ErrorText>{error}</ErrorText>;
  const list = data.students.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHead title="Students" sub="Assign each student to a stop. Families link with the student’s code.">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>Import roster</button>
      </PageHead>
      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="card"><h2>Student code</h2><div className="code">{data.studentCode}</div><p className="hint">New students enter this when they create their account.</p></div>
        <div className="card"><h2>Find a student</h2><input className="input" placeholder="Search by name" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      </div>
      <ErrorText>{msg}</ErrorText>
      <div className="card">
        {list.length === 0 ? <Empty title="No students yet">Import a roster or share the student code.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Student</th><th>Account</th><th>Family code</th><th>Stop</th></tr></thead>
            <tbody>{list.map((s) => {
              const a = s.assignments[0];
              return (
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td>{s.claimed ? <span className="pill green">Active</span> : <span className="pill">Not claimed</span>}</td>
                  <td>{s.linkCode ? <span className="pill orange">{s.linkCode}</span> : "-"}</td>
                  <td>
                    <select className="input" style={{ minWidth: 220 }} aria-label={`Stop for ${s.name}`} value={a ? `${a.routeId}|${a.stopId}` : ""} onChange={(e) => void assign(s.id, e.target.value)}>
                      <option value="">Not assigned</option>
                      {routes.data?.map((r) => (
                        <optgroup key={r.id} label={r.name}>
                          {r.stops.map((st) => <option key={st.id} value={`${r.id}|${st.id}`}>{st.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
      {open && <Import onClose={() => setOpen(false)} onDone={() => void reload()} />}
    </>
  );
}
