import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

export function AcceptInvitePage() {
  const [done, setDone] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setDone(true); }
  return <main className="auth-page"><section className="auth-card auth-card-wide" aria-labelledby="invite-title">
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">Invitation from Apollo Group</p><h1 id="invite-title">Create your NIQ account</h1>
    {done ? <div className="success-panel"><span className="success-icon">✓</span><h2>Account ready</h2><p>Your password has been saved. Sign in to finish setting up multi-factor authentication.</p><Link className="btn btn-primary" to="/sign-in">Continue to sign in</Link></div> : <>
      <p className="auth-intro">You’ve been invited as a medical user for Chennai Central.</p>
      <form onSubmit={submit}><div className="field-grid"><label>Full name<input name="name" autoComplete="name" defaultValue="Meera Shah" required /></label><label>Work email<input type="email" value="meera@example.test" disabled /></label></div>
        <label>Create password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><p className="field-help">Use at least 12 characters. Avoid patient details and reused passwords.</p>
        <label className="checkbox-row"><input type="checkbox" required /><span>I agree to follow my organization’s privacy and acceptable-use policies.</span></label>
        <button className="btn btn-primary btn-block">Accept invitation</button>
      </form></>}
  </section></main>;
}
