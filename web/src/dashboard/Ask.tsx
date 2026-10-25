import { FormEvent, useRef, useState } from "react";
import { api } from "../lib/api";
import { ErrorText, PageHead } from "../components/ui";
import type { Answer } from "../lib/types";

const IDEAS = [
  "Which routes were late most this month?",
  "How many students do you expect tomorrow?",
  "Anything unusual this week?",
  "Which routes could share a bus?",
  "How accurate are the arrival times?",
  "Which drivers had the most incidents?",
];

interface Turn { q: string; a?: Answer; err?: string }

export function Ask() {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    const question = text.trim();
    if (question.length < 3 || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [{ q: question }, ...t]);
    try {
      const a = await api.ask(question);
      setTurns((t) => t.map((x, i) => (i === 0 ? { ...x, a } : x)));
    } catch (e: any) {
      setTurns((t) => t.map((x, i) => (i === 0 ? { ...x, err: e.message } : x)));
    } finally {
      setBusy(false);
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };

  return (
    <>
      <PageHead title="Ask RouteIQ" sub="Ask a question about your routes in plain words. Answers come from your own ride records." />
      <form className="card stack" onSubmit={submit}>
        <textarea className="input" style={{ minHeight: 88 }} maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: which route had the most missed students last week?" aria-label="Your question"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
        <div className="row space" style={{ flexWrap: "wrap" }}>
          <div className="chips">{IDEAS.map((i) => <button type="button" key={i} className="pill orange" style={{ cursor: "pointer", border: 0 }} onClick={() => void ask(i)}>{i}</button>)}</div>
          <button className="btn btn-primary" disabled={busy || q.trim().length < 3}>{busy ? "Looking..." : "Ask"}</button>
        </div>
      </form>
      <div className="stack" style={{ marginTop: 16 }} ref={end} aria-live="polite">
        {turns.map((t, i) => (
          <div className="card" key={turns.length - i}>
            <b>{t.q}</b>
            {t.err ? <ErrorText>{t.err}</ErrorText> : t.a ? (
              <>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{t.a.answer}</p>
                <div className="row" style={{ marginTop: 10 }}>
                  <span className={`pill ${t.a.mode === "ai" ? "orange" : ""}`}>{t.a.mode === "ai" ? "Answered with AI" : "Built-in answer"}</span>
                  {t.a.note && <span className="hint">{t.a.note}</span>}
                </div>
              </>
            ) : <p className="hint" style={{ marginTop: 8 }}>Looking through your records...</p>}
          </div>
        ))}
        {turns.length === 0 && (
          <p className="hint">The built-in mode understands common questions about lateness, incidents, drivers, forecasts and route ideas. Add an Anthropic key on the server (<code>ANTHROPIC_API_KEY</code>) to ask anything in your own words. Student names are never sent to the AI service.</p>
        )}
      </div>
    </>
  );
}
