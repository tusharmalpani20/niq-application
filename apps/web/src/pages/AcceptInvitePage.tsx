import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { acceptInvitation, ApiRequestError } from "../lib/api";
import { ApplicationLogo } from "../components/ApplicationLogo";

export function AcceptInvitePage() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { token = "" } = useParams();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await acceptInvitation({ token, displayName: String(data.get("name")), password });
      setDone(true);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The invitation could not be accepted. It may have expired.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card auth-card-wide" aria-labelledby="invite-title">
    <ApplicationLogo className="auth-app-logo" /><p className="page-eyebrow">NIQ invitation</p><h1 id="invite-title">Create your NIQ account</h1>
    {done ? <div className="success-panel"><span className="success-icon">✓</span><h2>Account ready</h2><p>Your password has been saved. Sign in to finish setting up multi-factor authentication.</p><Link className={buttonVariants()} to="/sign-in">Continue to sign in</Link></div> : <>
      <form onSubmit={submit}><FieldGroup>
        <Field><FieldLabel htmlFor="name">Full name</FieldLabel><Input className="h-11" id="name" name="name" autoComplete="name" required /></Field>
        <Field><FieldLabel htmlFor="new-password">Password</FieldLabel><InputGroup className="h-11 overflow-hidden"><InputGroupInput id="new-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required /><InputGroupAddon align="inline-end" className="mr-0! self-stretch border-l bg-accent p-0"><InputGroupButton className="m-0! h-full w-11 rounded-none border-0 bg-clip-border text-primary hover:bg-primary/15" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="new-password" aria-pressed={showPassword} onPress={() => setShowPassword((visible) => !visible)} size="icon-sm">{showPassword ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup><FieldDescription>Use at least 8 characters.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><InputGroup className="h-11 overflow-hidden"><InputGroupInput id="confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required /><InputGroupAddon align="inline-end" className="mr-0! self-stretch border-l bg-accent p-0"><InputGroupButton className="m-0! h-full w-11 rounded-none border-0 bg-clip-border text-primary hover:bg-primary/15" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-controls="confirm-password" aria-pressed={showConfirmPassword} onPress={() => setShowConfirmPassword((visible) => !visible)} size="icon-sm">{showConfirmPassword ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup></Field>
        <Field orientation="horizontal"><Checkbox id="policy" isRequired /><FieldLabel htmlFor="policy" className="font-normal">I agree to follow my organization’s privacy and acceptable-use policies.</FieldLabel></Field>
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        <Button className="h-11 w-full" type="submit" isDisabled={busy || token.length < 32}>{busy ? "Creating account…" : "Accept invitation"}</Button>
      </FieldGroup>
      </form></>}
  </section></main>;
}
