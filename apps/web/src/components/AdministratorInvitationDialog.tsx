import { createPlatformAdministratorInvitationSchema } from "@niq/application-contracts";
import { CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { invitePlatformAdministrator } from "../lib/api";

export function AdministratorInvitationDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      submitting.current = false;
      setBusy(false);
      setMessage(null);
      setEmailError(null);
      setCreated(false);
      setInvitationUrl(null);
      setCopied(false);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setMessage(null);
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    const parsed = createPlatformAdministratorInvitationSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    submitting.current = true;
    setBusy(true);
    try {
      const result = await invitePlatformAdministrator(parsed.data);
      if (result.activationToken) setInvitationUrl(`${window.location.origin}/invite/${result.activationToken}`);
      // The API confirms creation, but does not report invitation delivery.
      setCreated(true);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be created. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!invitationUrl) return;
    setMessage(null);
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
    } catch {
      setMessage("The link could not be copied. Select the link and copy it manually.");
    }
  }

  return <Dialog ariaLabel={created ? "Invitation created" : "Invite administrator"} isOpen={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }} isDismissable={!busy} showCloseButton={!busy} className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 pr-6">{created ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" /> : <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />}{created ? "Invitation created" : "Invite administrator"}</DialogTitle>
    </DialogHeader>
    {created ? <div className="grid gap-4">
      <p className="text-muted-foreground" role="status">{invitationUrl ? "Share this link with the administrator to let them join NIQ." : "The invitation is now listed under Pending invitations."}</p>
      {invitationUrl && <Field><FieldLabel htmlFor="platformInvitationUrl">Invitation link</FieldLabel><Input id="platformInvitationUrl" readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} /></Field>}
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2">{invitationUrl && <Button variant="outline" onPress={copyLink}><Copy aria-hidden="true" />{copied ? "Copied" : "Copy link"}</Button>}<Button onPress={onClose}>Done</Button></div>
    </div> : <form className="grid gap-4" noValidate onSubmit={submit}>
      <p className="text-muted-foreground">NIQ administrators can manage organizations and administrator access.</p>
      <Field data-invalid={emailError ? true : undefined}><FieldLabel htmlFor="platformAdminEmail">Email</FieldLabel><Input id="platformAdminEmail" name="email" type="email" autoComplete="email" required autoFocus disabled={busy} aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "platformAdminEmailError" : undefined} onChange={() => setEmailError(null)} />{emailError && <FieldError id="platformAdminEmailError">{emailError}</FieldError>}</Field>
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" isDisabled={busy} onPress={onClose}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Creating…" : "Create invitation"}</Button></div>
    </form>}
  </Dialog>;
}
