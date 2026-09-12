import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export function VerifyMfaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const email = (location.state as { email?: string } | null)?.email ?? "your work email";
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); window.setTimeout(() => { setBusy(false); navigate("/"); }, 450); }
  return <main className="auth-page"><section className="auth-card" aria-labelledby="verify-title">
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">Secure sign in</p><h1 id="verify-title">Verify it’s you</h1>
    <p className="auth-intro">Enter the six-digit code sent to <strong>{email}</strong>.</p>
    <form onSubmit={submit}><label htmlFor="otp">Verification code</label><input id="otp" name="otp" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required />
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button>
    </form><button className="text-button auth-resend" type="button">Send a new code</button><Link className="auth-back" to="/sign-in">Back to sign in</Link>
  </section></main>;
}
