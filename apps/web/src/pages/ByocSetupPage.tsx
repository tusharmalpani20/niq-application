import { byocSetupRequestSchema, type ByocSetupStatus } from "@niq/application-contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMarks } from "../components/BrandMarks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { completeByocSetup, loadByocSetup } from "../lib/byoc-setup";

export function ByocSetupPage() {
  // Setup credentials belong only to this mounted form, never browser storage or URLs.
  const token = useRef("");
  const request = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<ByocSetupStatus | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => () => { token.current = ""; request.current?.abort(); }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const value = String(new FormData(form).get("setupToken") ?? "").trim();
    if (!value) { setMessage("Enter the private setup key supplied by your installation operator."); return; }
    setBusy(true); setMessage(null);
    request.current = new AbortController();
    try {
      const result = await loadByocSetup(value, request.current.signal);
      token.current = result.state === "pending" ? value : "";
      form.reset(); setStatus(result); setCompleted(result.state === "completed");
    } catch (error) {
      if (!request.current.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to check setup.");
    } finally { if (!request.current.signal.aborted) setBusy(false); }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !status || completed) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const parsed = byocSetupRequestSchema.safeParse({ organizationName: values.organizationName,
      organizationSlug: values.organizationSlug, adminName: values.adminName,
      adminEmail: values.adminEmail, adminPassword: values.adminPassword });
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] = issue.message;
    if (values.adminPassword !== values.confirmPassword) nextErrors.confirmPassword = "Passwords must match.";
    setErrors(nextErrors); setMessage(null);
    if (!parsed.success || Object.keys(nextErrors).length) return;
    setBusy(true); request.current = new AbortController();
    try {
      await completeByocSetup(token.current, request.current.signal, parsed.data);
      token.current = ""; form.reset(); setCompleted(true);
    } catch (error) {
      if (!request.current.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to complete setup.");
    } finally { if (!request.current.signal.aborted) setBusy(false); }
  }

  const fields = [
    ["organizationName", "Hospital / organization name", "text", "organization"],
    ["organizationSlug", "Organization identifier", "text", "off"],
    ["adminName", "Hospital administrator name", "text", "name"],
    ["adminEmail", "Hospital administrator email", "email", "email"],
    ["adminPassword", "Administrator password", "password", "new-password"],
    ["confirmPassword", "Confirm password", "password", "new-password"],
  ] as const;
  return <main className="mx-auto max-w-3xl p-6 sm:p-10">
    <BrandMarks className="brand-marks-auth" />
    <section className="surface mt-8 p-6" aria-labelledby="setup-title">
      <h1 id="setup-title" className="text-2xl font-semibold">Set up your hospital workspace</h1>
      <p className="mt-2 text-muted-foreground">Create your organization and its first Hospital Administrator. This account manages only your organization.</p>
      {message && <Alert variant="destructive" className="mt-4"><AlertDescription role="alert">{message}</AlertDescription></Alert>}
      {completed ? <div className="mt-5" role="status">
        <h2 className="font-semibold">Initial setup is complete</h2>
        {status && !status.otpDeliveryConfigured && <p role="alert" className="my-3 font-medium">The workspace was created. Production sign-in remains blocked until OTP delivery is configured.</p>}
        <p>Sign in and complete the normal verification process. Then open Scoring connection settings to activate your deployment.</p>
        <div className="mt-4 flex gap-4"><Link to="/sign-in">Sign in</Link><Link to="/settings/scoring">Scoring connection settings</Link></div>
      </div> : !status ? <form className="mt-5 space-y-4" noValidate onSubmit={unlock}>
        <Field><FieldLabel htmlFor="setupToken">Private setup key</FieldLabel><Input id="setupToken" name="setupToken" type="password" autoComplete="off" required disabled={busy} /></Field>
        <p className="text-sm text-muted-foreground">Use the one-time key from your installation operator. Do not share it or put it in a link.</p>
        <Button type="submit" isDisabled={busy}>{busy ? "Checking setup…" : "Check setup"}</Button>
      </form> : <>
        <section className="my-5 rounded-lg border p-4" aria-labelledby="configuration-heading">
          <h2 id="configuration-heading" className="font-semibold">Installation configuration</h2>
          <p>Application address: {status.origin}</p>
          <ul className="my-2 list-disc pl-5">
            <li>HTTPS configuration: {status.httpsConfigured ? "configured" : "missing"}</li>
            <li>Online Scoring address: {status.scoringConfigured ? "configured" : "missing"}</li>
            <li>OTP delivery: {status.otpDeliveryConfigured ? "configured" : "not configured"}</li>
          </ul>
          <p className="text-sm text-muted-foreground">These are configuration checks. The installer verifies DNS and HTTPS; Scoring activation is completed after sign-in.</p>
          {!status.otpDeliveryConfigured && <p role="alert" className="mt-2 font-medium">Launch is blocked until production OTP delivery is configured. Administrator sign-in requires verification.</p>}
        </section>
        <form noValidate onSubmit={finish} className="space-y-5">
          <FieldGroup>{fields.map(([name, label, type, autoComplete]) => <Field key={name}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <Input id={name} name={name} type={type} autoComplete={autoComplete} required disabled={busy}
              minLength={type === "password" ? 12 : undefined} aria-invalid={Boolean(errors[name])}
              aria-describedby={errors[name] ? `${name}-error` : undefined} />
            {name === "organizationSlug" && <p className="text-sm text-muted-foreground">Use lowercase letters, numbers and hyphens, for example city-hospital.</p>}
            {name === "adminPassword" && <p className="text-sm text-muted-foreground">Use at least 12 characters.</p>}
            {errors[name] && <FieldError id={`${name}-error`}>{errors[name]}</FieldError>}
          </Field>)}</FieldGroup>
          <Button type="submit" isDisabled={busy}>{busy ? "Creating hospital workspace…" : "Create hospital workspace"}</Button>
        </form>
      </>}
    </section>
  </main>;
}
