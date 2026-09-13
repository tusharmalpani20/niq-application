import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
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
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [showAttempts, setShowAttempts] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const expiresIn = challenge ? remainingSeconds(challenge.expiresAt, now) : 0;
  const resendIn = challenge ? remainingSeconds(challenge.resendAvailableAt, now) : 0;
  const expired = expiresIn === 0;

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((item, itemIndex) => itemIndex === index ? digit : item));
    setMessage(null);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) inputs.current[index + 1]?.focus();
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] ?? ""));
    inputs.current[Math.min(pasted.length, 6) - 1]?.focus();
    setMessage(null);
  }

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
    try {
      await verifyMfa({ challengeToken: challenge.challengeToken, otp: digits.join("") });
      navigate("/");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const attemptsRemaining = numericDetail(error, "attemptsRemaining");
        if (attemptsRemaining !== undefined) {
          setChallenge({ ...challenge, attemptsRemaining });
          setShowAttempts(true);
        }
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
      setDigits(["", "", "", "", "", ""]);
      setShowAttempts(false);
      setNow(Date.now());
      setNotice("A new verification code has been sent. The previous code no longer works.");
      inputs.current[0]?.focus();
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "A new code could not be requested. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="verify-title">
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">Secure sign in</p><h1 id="verify-title">Verify it’s you</h1>
    <p className="auth-intro">Enter the six-digit code sent to <strong>{challenge?.email ?? "your email"}</strong>.</p>
    <form onSubmit={submit}><label htmlFor="otp-0">Verification code</label>
      <div className="otp-group" role="group" aria-label="Six-digit verification code" onPaste={handlePaste}>
        {digits.map((digit, index) => <span className="otp-slot" key={index}>
          {index === 3 && <span className="otp-separator" aria-hidden="true">–</span>}
          <input
            ref={(element) => { inputs.current[index] = element; }}
            id={`otp-${index}`}
            className="otp-box"
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            pattern="[0-9]"
            maxLength={1}
            aria-label={`Digit ${index + 1}`}
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            required
          />
        </span>)}
      </div>
      <button className="text-button auth-resend" type="button" onClick={resend} disabled={!challenge || resending || resendIn > 0 || challenge.resendsRemaining === 0}>
        {resending ? "Sending…" : challenge?.resendsRemaining === 0 ? "Resend limit reached" : resendIn > 0 ? `Resend in ${duration(resendIn)}` : "Resend code"}
      </button>
      {showAttempts && challenge && <p className="attempts-note" role="status">{challenge.attemptsRemaining} {challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      {message && <p className="error-message" role="alert">{message}</p>}
      <button className="btn btn-primary btn-block" disabled={busy || expired || !challenge || challenge.attemptsRemaining === 0 || digits.some((digit) => !digit)}>{busy ? "Verifying…" : "Verify and continue"}</button>
    </form>
    <Link className="auth-back" to="/sign-in">Back to sign in</Link>
  </section></main>;
}
