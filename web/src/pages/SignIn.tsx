import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ErrorText, Field, Logo } from "../components/ui";

export function SignIn() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signIn(email, password);
      nav("/app", { replace: true });
    } catch (e: any) {
      setErr(e.message || "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <form className="signin-form" onSubmit={submit}>
        <Logo />
        <h1>Sign in to your dashboard</h1>
        <Field label="Email">
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText>{err}</ErrorText>
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        <p className="hint">Use the same email and password as in the RouteIQ app. Forgot your password? Reset it from the app’s sign-in screen. <Link to="/">Back to home</Link></p>
      </form>
      <aside className="signin-side">
        <h2>Every bus, every stop, one screen.</h2>
        <p>Company and school accounts get the full picture.</p>
        <ul>
          <li>Live map of every running ride</li>
          <li>Routes, drivers and rosters</li>
          <li>Reports and activity log</li>
        </ul>
      </aside>
    </div>
  );
}
