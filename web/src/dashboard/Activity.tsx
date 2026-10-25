import { useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { Empty, ErrorText, PageHead, Spinner } from "../components/ui";
import type { AuditRow } from "../lib/types";

const label = (a: string) => a.replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase());

export function Activity() {
  const first = useLoad(() => api.audit());
  const [more, setMore] = useState<AuditRow[]>([]);
  const [done, setDone] = useState(false);
  const rows = [...(first.data ?? []), ...more];

  async function older() {
    const last = rows[rows.length - 1];
    if (!last) return;
    const next = await api.audit(last.id);
    setMore((m) => [...m, ...next]);
    if (next.length === 0) setDone(true);
  }

  return (
    <>
      <PageHead title="Activity log" />
      <div className="card">
        {first.loading ? <Spinner /> : first.error ? <ErrorText>{first.error}</ErrorText> : rows.length === 0 ? <Empty title="No activity yet" /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.at).toLocaleString()}</td>
                  <td>{r.actorName ?? "System"}{r.actorRole && <span className="hint"> · {r.actorRole}</span>}</td>
                  <td><span className="pill orange">{label(r.action)}</span></td>
                  <td className="hint">{r.meta ? Object.entries(r.meta).map(([k, v]) => `${k}: ${String(v)}`).join(", ") : ""}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {!done && rows.length >= 50 && <div style={{ marginTop: 14 }}><button className="btn btn-outline" onClick={() => void older()}>Show older</button></div>}
          </>
        )}
      </div>
    </>
  );
}
