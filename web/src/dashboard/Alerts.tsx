import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { getSocket } from "../lib/socket";
import { Empty, ErrorText, Field, PageHead, Spinner } from "../components/ui";
import type { Draft, LangText } from "../lib/types";

const LANGS: ["en" | "es" | "pt", string][] = [["en", "English"], ["es", "Spanish"], ["pt", "Portuguese"]];

function Composer({ onSent }: { onSent: () => void }) {
  const routes = useLoad(() => api.listRoutes());
  const [route, setRoute] = useState("all");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  async function make() {
    setErr(""); setDone(""); setBusy(true);
    try { setDraft(await api.draftAlert(note, route === "all" ? undefined : route)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const edit = (l: "en" | "es" | "pt", k: keyof LangText, v: string) =>
    setDraft((d) => d && { ...d, draft: { ...d.draft, [l]: { ...(d.draft[l] ?? { title: "", body: "" }), [k]: v } } });

  async function send() {
    if (!draft) return;
    setErr(""); setBusy(true);
    try {
      const text: any = { en: draft.draft.en };
      for (const l of ["es", "pt"] as const) { const t = draft.draft[l]; if (t?.title.trim() && t?.body.trim()) text[l] = t; }
      const r = await api.announce(route, text);
      setDone(`Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}.`);
      setDraft(null); setNote(""); onSent();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card stack" style={{ marginBottom: 16 }}>
      <h2>Send an update to families</h2>
      <div className="grid2">
        <Field label="Who gets it">
          <select className="input" value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="all">Every route</option>
            {routes.data?.filter((r) => r.status === "sent").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="What happened?" hint="A few words are enough. RouteIQ writes the notice and translates it. You review it before it sends.">
          <textarea className="input" style={{ minHeight: 88 }} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bus 12 is about 15 minutes late because of a flat tire" />
        </Field>
      </div>
      <div className="row">
        <button className="btn btn-soft" disabled={busy || note.trim().length < 3} onClick={() => void make()}>{busy && !draft ? "Writing..." : "Write the notice"}</button>
        {done && <span className="hint">{done}</span>}
      </div>
      <ErrorText>{err}</ErrorText>
      {draft && (
        <div className="stack">
          {draft.note && <p className="hint">{draft.note}</p>}
          {LANGS.filter(([l]) => l === "en" || draft.draft[l]).map(([l, name]) => (
            <div className="card" key={l}>
              <b>{name}</b>
              <div className="stack" style={{ marginTop: 8 }}>
                <input className="input" maxLength={80} value={draft.draft[l]?.title ?? ""} onChange={(e) => edit(l, "title", e.target.value)} aria-label={`${name} title`} />
                <textarea className="input" style={{ minHeight: 80 }} maxLength={400} value={draft.draft[l]?.body ?? ""} onChange={(e) => edit(l, "body", e.target.value)} aria-label={`${name} message`} />
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !draft.draft.en.title.trim() || !draft.draft.en.body.trim()} onClick={() => void send()}>{busy ? "Sending..." : "Send to families"}</button>
            <button className="btn btn-outline" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Alerts() {
  const { data, loading, error, reload } = useLoad(() => api.notifications());
  useEffect(() => {
    const s = getSocket();
    s?.on("notification:new", reload);
    return () => { s?.off("notification:new", reload); };
  }, [reload]);

  return (
    <>
      <PageHead title="Alerts">
        <button className="btn btn-outline" disabled={!data?.unread} onClick={async () => { await api.markNotificationsRead(); await reload(); }}>Mark all read</button>
      </PageHead>
      <Composer onSent={() => void reload()} />
      <div className="card">
        <h2>Inbox</h2>
        {loading && !data ? <Spinner /> : error ? <ErrorText>{error}</ErrorText> : !data?.items.length ? (
          <Empty title="You’re all caught up">New alerts show up here the moment they happen.</Empty>
        ) : (
          <div className="list">
            {data.items.map((n) => (
              <div key={n.id}>
                <div className="row space"><b>{n.title}</b><span className="hint">{new Date(n.createdAt).toLocaleString()}</span></div>
                <div>{n.body}</div>
                {!n.readAt && <span className="pill orange">New</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
