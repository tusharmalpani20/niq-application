import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiRequestError, verifyMfa } from "../lib/api";

export function VerifyMfaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const state = location.state as { email?: string; challengeToken?: string } | null;
  const email = state?.email ?? "your work email";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state?.challengeToken) { setMessage("This verification request is no longer available. Please sign in again."); return; }
    setBusy(true); setMessage(null);
    const data = new FormData(event.currentTarget);
    try {
      await verifyMfa({ challengeToken: state.challengeToken, otp: String(data.get("otp")) });
      navigate("/");
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "Verification is temporarily unavailable. Please try again.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card" aria-labelledby="verify-title">
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">Secure sign in</p><h1 id="verify-title">Verify it’s you</h1>
    <p className="auth-intro">Enter the six-digit code sent to <strong>{email}</strong>.</p>
    <form onSubmit={submit}><label htmlFor="otp">Verification code</label><input id="otp" name="otp" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required />
      {message && <p className="error-message" role="alert">{message}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button>
    </form><Link className="auth-back" to="/sign-in">Back to sign in</Link>
  </section></main>;
}
