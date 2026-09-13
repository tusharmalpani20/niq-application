import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiRequestError, resendMfa, verifyMfa } from "../lib/api";

type ChallengeState = {
  email: string;
  challengeToken: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsRemaining: number;
  resendsRemaining: number;
};

function remainingSeconds(until: string, now: number) {
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
}

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function numericDetail(error: ApiRequestError, name: string) {
  const value = error.response.error.details?.[name];
  return typeof value === "number" ? value : undefined;
}

export function VerifyMfaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state as ChallengeState | null;
  const [challenge, setChallenge] = useState<ChallengeState | null>(initial?.challengeToken && initial.expiresAt ? initial : null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const expiresIn = challenge ? remainingSeconds(challenge.expiresAt, now) : 0;
  const resendIn = challenge ? remainingSeconds(challenge.resendAvailableAt, now) : 0;
  const expired = expiresIn === 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) {
      setMessage("This verification request is no longer available. Please sign in again.");
      return;
    }
    if (expired) {
      setMessage("This code has expired. Request a new code or sign in again.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setNotice(null);
    const data = new FormData(event.currentTarget);
    try {
      await verifyMfa({ challengeToken: challenge.challengeToken, otp: String(data.get("otp")) });
      navigate("/");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const attemptsRemaining = numericDetail(error, "attemptsRemaining");
        if (attemptsRemaining !== undefined) setChallenge({ ...challenge, attemptsRemaining });
        setMessage(error.message);
      } else {
        setMessage("Verification is temporarily unavailable. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge || resendIn > 0 || challenge.resendsRemaining === 0) return;
    setResending(true);
    setMessage(null);
    setNotice(null);
    try {
      const result = await resendMfa(challenge.challengeToken);
      setChallenge({ ...challenge, ...result });
      setNow(Date.now());
      setNotice("A new verification code has been sent. The previous code no longer works.");
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "A new code could not be requested. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="verify-title">
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">Secure sign in</p><h1 id="verify-title">Verify it’s you</h1>
    <p className="auth-intro">Enter the six-digit code sent to <strong>{challenge?.email ?? "your email"}</strong>.</p>
    {challenge && <div className="verification-status" aria-live="polite">
      <span>{expired ? "Code expired" : `Expires in ${duration(expiresIn)}`}</span>
      <span>{challenge.attemptsRemaining} {challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining</span>
    </div>}
    <form onSubmit={submit}><label htmlFor="otp">Verification code</label><input id="otp" name="otp" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required />
      {notice && <p className="success-message" role="status">{notice}</p>}
      {message && <p className="error-message" role="alert">{message}</p>}
      <button className="btn btn-primary btn-block" disabled={busy || expired || !challenge}>{busy ? "Verifying…" : "Verify and continue"}</button>
    </form>
    <button className="text-button auth-resend" type="button" onClick={resend} disabled={!challenge || resending || resendIn > 0 || challenge.resendsRemaining === 0}>
      {resending ? "Sending…" : challenge?.resendsRemaining === 0 ? "Resend limit reached" : resendIn > 0 ? `Resend in ${duration(resendIn)}` : "Resend code"}
    </button>
    <Link className="auth-back" to="/sign-in">Back to sign in</Link>
  </section></main>;
}
