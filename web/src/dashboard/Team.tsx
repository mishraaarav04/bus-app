import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { ftToM, lbToT, mToFt, tToLb } from "../lib/format";
import { Empty, ErrorText, Field, Modal, PageHead, Spinner } from "../components/ui";
import type { PlaceResult } from "../lib/types";

function AddSchool({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    setErr("");
    try { setPlaces(await api.search(q)); } catch (e: any) { setErr(e.message); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!place) return setErr("Search for the school’s address and choose it.");
    setBusy(true);
    setErr("");
    try {
      await api.createSchool({ ...f, address: place.address, location: { lat: place.lat, lng: place.lng } });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add a school" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="School name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Login email" hint="The school signs in with this."><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 8 characters."><input className="input" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="School address">
          <div className="row">
            <input className="input" value={place ? place.address : q} onChange={(e) => { setPlace(null); setQ(e.target.value); }} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())} />
            <button type="button" className="btn btn-soft" onClick={() => void search()}>Search</button>
          </div>
        </Field>
        {!place && places.slice(0, 5).map((p) => (
          <button type="button" key={p.id} className="btn btn-outline" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }} onClick={() => setPlace(p)}>{p.name}, {p.address}</button>
        ))}
        <ErrorText>{err}</ErrorText>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Adding..." : "Add school"}</button>
      </form>
    </Modal>
  );
}

export function Team() {
  const { data, loading, error, reload } = useLoad(() => api.companyOverview());
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState<{ h: string; w: string; t: string } | null>(null);
  const [msg, setMsg] = useState("");

  if (loading) return <Spinner />;
  if (!data) return <ErrorText>{error}</ErrorText>;
  const cur = spec ?? {
    h: String(data.busSpec ? mToFt(data.busSpec.heightM) : 11.2),
    w: String(data.busSpec ? mToFt(data.busSpec.widthM) : 8.5),
    t: String(data.busSpec ? tToLb(data.busSpec.weightT) : 30000),
  };

  async function saveSpec() {
    setMsg("");
    try {
      await api.setBusSpec({ heightM: ftToM(+cur.h), widthM: ftToM(+cur.w), weightT: lbToT(+cur.t) });
      setSpec(null);
      setMsg("Saved. New routes use these measurements.");
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <>
      <PageHead title="Drivers & schools">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>Add school</button>
      </PageHead>
      <div className="grid2">
        <div className="card">
          <h2>Driver code</h2>
          <div className="code">{data.driverCode}</div>
          <p className="hint">Drivers enter this when they create their RouteIQ account.</p>
          <h2 style={{ marginTop: 20 }}>Drivers ({data.drivers.length})</h2>
          {data.drivers.length === 0 ? <Empty title="No drivers yet">They appear here after signing up with your code.</Empty> : (
            <div className="list">{data.drivers.map((d) => <div key={d.id}><b>{d.name}</b><div className="hint">{d.email}</div></div>)}</div>
          )}
        </div>
        <div className="card stack">
          <h2>Bus measurements</h2>
          <div className="grid2">
            <Field label="Height (ft)"><input className="input" inputMode="decimal" value={cur.h} onChange={(e) => setSpec({ ...cur, h: e.target.value })} /></Field>
            <Field label="Width (ft)"><input className="input" inputMode="decimal" value={cur.w} onChange={(e) => setSpec({ ...cur, w: e.target.value })} /></Field>
          </div>
          <Field label="Weight (lb)"><input className="input" inputMode="numeric" value={cur.t} onChange={(e) => setSpec({ ...cur, t: e.target.value })} /></Field>
          <p className="hint">Routes avoid low bridges, narrow roads and weight limits for a bus this size.</p>
          <div className="row"><button className="btn btn-soft" onClick={() => void saveSpec()}>Save measurements</button></div>
          {msg && <p className="hint">{msg}</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Schools ({data.schools.length})</h2>
        {data.schools.length === 0 ? <Empty title="No schools yet">Choose Add school to create the first one.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>School</th><th>Login</th><th>Address</th><th>Student code</th></tr></thead>
            <tbody>{data.schools.map((s) => (
              <tr key={s.id}><td><b>{s.name}</b></td><td>{s.email}</td><td>{s.address ?? "-"}</td><td><span className="pill orange">{s.studentCode}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {open && <AddSchool onClose={() => setOpen(false)} onDone={() => { setOpen(false); void reload(); }} />}
    </>
  );
}
