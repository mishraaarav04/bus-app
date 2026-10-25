import { FormEvent, useState } from "react";
import { adopt, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ErrorText, Field, PageHead } from "../components/ui";

export function Account() {
  const { user, signOut } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function change(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const r = await api.changePassword(cur, next);
      adopt(r); // other devices are signed out; this one gets a fresh session
      setCur("");
      setNext("");
      setMsg("Password changed. Other devices were signed out.");
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      <PageHead title="Account" />
      <div className="grid2">
        <div className="card stack">
          <h2>Your details</h2>
          <div><b>{user?.name}</b><div className="hint">{user?.email}</div></div>
          <span className="pill orange">{user?.role === "company" ? "Bus company" : "School"}</span>
          <div><button className="btn btn-outline" onClick={() => void signOut()}>Sign out</button></div>
        </div>
        <form className="card stack" onSubmit={change}>
          <h2>Change password</h2>
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="New password" hint="At least 8 characters."><input className="input" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <ErrorText>{err}</ErrorText>
          {msg && <p className="hint">{msg}</p>}
          <div><button className="btn btn-primary">Change password</button></div>
        </form>
      </div>
    </>
  );
}
