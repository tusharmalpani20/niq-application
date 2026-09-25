import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import { ApiRequestError, resendMfa, verifyMfa } from "../lib/api";
import { authenticatedLandingPath } from "../lib/auth-routing";
import { ApplicationLogo } from "../components/ApplicationLogo";

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
  const [otp, setOtp] = useState("");
  const [showAttempts, setShowAttempts] = useState(false);
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
    try {
      const user = await verifyMfa({ challengeToken: challenge.challengeToken, otp });
      navigate(authenticatedLandingPath(user));
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
      setOtp("");
      setShowAttempts(false);
      setNow(Date.now());
      setNotice("A new verification code has been sent. The previous code no longer works.");
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "A new code could not be requested. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="verify-title">
    <ApplicationLogo className="auth-app-logo" /><h1 id="verify-title">Verify it’s you</h1>
    <p className="auth-intro">Enter the six-digit code sent to <strong>{challenge?.email ?? "your email"}</strong>.</p>
    <form onSubmit={submit}>
      <Field><FieldLabel>Verification code</FieldLabel><InputOTP aria-label="Six-digit verification code" autoFocus maxLength={6} pattern="[0-9]*" value={otp} onChange={(value) => { setOtp(value.replace(/\D/g, "")); setMessage(null); }} containerClassName="justify-center py-1">
        <InputOTPGroup>{[0, 1, 2].map((index) => <InputOTPSlot className="size-12 text-lg" index={index} key={index} />)}</InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>{[3, 4, 5].map((index) => <InputOTPSlot className="size-12 text-lg" index={index} key={index} />)}</InputOTPGroup>
      </InputOTP></Field>
      <Button className="ml-auto" variant="link" size="sm" type="button" onPress={resend} isDisabled={!challenge || resending || resendIn > 0 || challenge.resendsRemaining === 0}>
        {resending ? "Sending…" : challenge?.resendsRemaining === 0 ? "Resend limit reached" : resendIn > 0 ? `Resend in ${duration(resendIn)}` : "Resend code"}
      </Button>
      {showAttempts && challenge && <p className="attempts-note" role="status">{challenge.attemptsRemaining} {challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining</p>}
      {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
      <Button className="h-11 w-full" type="submit" isDisabled={busy || expired || !challenge || challenge.attemptsRemaining === 0 || otp.length !== 6}>{busy ? "Verifying…" : "Verify and continue"}</Button>
    </form>
    <Link className={cn(buttonVariants({ variant: "link", size: "sm" }), "mx-auto mt-3 flex w-fit text-muted-foreground")} to="/sign-in">Back to sign in</Link>
  </section></main>;
}
