import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    <div className="brand-logo auth-logo">N</div><p className="page-eyebrow">NIQ invitation</p><h1 id="invite-title">Create your NIQ account</h1>
    {done ? <div className="success-panel"><span className="success-icon">✓</span><h2>Account ready</h2><p>Your password has been saved. Sign in to finish setting up multi-factor authentication.</p><Link className={buttonVariants()} to="/sign-in">Continue to sign in</Link></div> : <>
      <p className="auth-intro">Complete your secure, invitation-only account setup.</p>
      <form onSubmit={submit}><FieldGroup>
        <Field><FieldLabel htmlFor="name">Full name</FieldLabel><Input className="h-11" id="name" name="name" autoComplete="name" required /></Field>
        <Field><FieldLabel htmlFor="new-password">Create password</FieldLabel><Input className="h-11" id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required /><FieldDescription>Use at least 12 characters. Avoid patient details and reused passwords.</FieldDescription></Field>
        <Field orientation="horizontal"><Checkbox id="policy" isRequired /><FieldLabel htmlFor="policy" className="font-normal">I agree to follow my organization’s privacy and acceptable-use policies.</FieldLabel></Field>
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        <Button className="h-11 w-full" type="submit" isDisabled={busy || token.length < 32}>{busy ? "Creating account…" : "Accept invitation"}</Button>
      </FieldGroup>
      </form></>}
  </section></main>;
}
