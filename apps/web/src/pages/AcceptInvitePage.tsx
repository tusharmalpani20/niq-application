import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { acceptInvitation, ApiRequestError } from "../lib/api";

export function AcceptInvitePage() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { token = "" } = useParams();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const data = new FormData(event.currentTarget);
    try {
      await acceptInvitation({ token, displayName: String(data.get("name")), password: String(data.get("password")) });
      setDone(true);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The invitation could not be accepted. It may have expired.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card auth-card-wide" aria-labelledby="invite-title">
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">Invitation from Apollo Group</p><h1 id="invite-title">Create your NIQ account</h1>
    {done ? <div className="success-panel"><span className="success-icon">✓</span><h2>Account ready</h2><p>Your password has been saved. Sign in to finish setting up multi-factor authentication.</p><Link className="btn btn-primary" to="/sign-in">Continue to sign in</Link></div> : <>
      <p className="auth-intro">Complete your secure, invitation-only account setup.</p>
      <form onSubmit={submit}><label>Full name<input name="name" autoComplete="name" required /></label>
        <label>Create password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><p className="field-help">Use at least 12 characters. Avoid patient details and reused passwords.</p>
        <label className="checkbox-row"><input type="checkbox" required /><span>I agree to follow my organization’s privacy and acceptable-use policies.</span></label>
        {message && <p className="error-message" role="alert">{message}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || token.length < 32}>{busy ? "Creating account…" : "Accept invitation"}</button>
      </form></>}
  </section></main>;
}
