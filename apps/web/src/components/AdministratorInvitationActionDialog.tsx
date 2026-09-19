import type { PlatformAdministrator } from "@niq/application-contracts";
import { CheckCircle2, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { regeneratePlatformAdministratorInvitation, revokePlatformAdministratorInvitation } from "../lib/api";

export type InvitationActionTarget = {
  invitation: Extract<PlatformAdministrator, { kind: "INVITATION" }>;
  action: "regenerate" | "revoke";
};

export function AdministratorInvitationActionDialog({ target, onClose, onUpdated }: {
  target: InvitationActionTarget;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const revoking = target.action === "revoke";
  const title = done ? (revoking ? "Invitation revoked" : "New link created") : (revoking ? "Revoke invitation?" : "Create a new link?");

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (revoking) {
        await revokePlatformAdministratorInvitation(target.invitation.invitationId);
      } else {
        const result = await regeneratePlatformAdministratorInvitation(target.invitation.invitationId);
        if (result.activationToken) setLink(`${window.location.origin}/invite/${result.activationToken}`);
      }
      setDone(true);
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be updated. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setMessage(null);
    } catch {
      setMessage("Select the link and copy it manually.");
    }
  }

  return <Dialog ariaLabel={title} isOpen onOpenChange={(open) => { if (!open && !busy) onClose(); }} isDismissable={!busy} showCloseButton={!busy} className="sm:max-w-md">
    <DialogHeader><DialogTitle className="flex items-center gap-2 pr-6">{done && <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />}{title}</DialogTitle></DialogHeader>
    <p className="break-words text-muted-foreground">{done
      ? revoking ? `The invitation for ${target.invitation.email} is no longer valid.` : link ? `Share this new link with ${target.invitation.email}. The old link no longer works.` : "The new link is ready. The old link no longer works."
      : revoking ? `Are you sure you want to revoke the invitation for ${target.invitation.email}? Their link will stop working.` : `Create a new invitation link for ${target.invitation.email}? The old link will stop working.`}</p>
    {link && <Field><FieldLabel htmlFor="replacementInvitationLink">New invitation link</FieldLabel><Input id="replacementInvitationLink" readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></Field>}
    {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    <div className="flex justify-end gap-2">{done ? <>{link && <Button variant="outline" onPress={copyLink}><Copy aria-hidden="true" />{copied ? "Copied" : "Copy link"}</Button>}<Button onPress={onClose}>Done</Button></> : <><Button variant="outline" isDisabled={busy} onPress={onClose}>Go back</Button><Button variant={revoking ? "destructive" : "default"} isDisabled={busy} onPress={confirm}>{busy ? "Updating…" : revoking ? "Revoke invitation" : "Create new link"}</Button></>}</div>
  </Dialog>;
}
