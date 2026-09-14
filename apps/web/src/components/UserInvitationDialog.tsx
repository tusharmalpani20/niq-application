import { type AuthenticatedUser, type Facility, type CreateInvitation } from "@niq/application-contracts";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteOrganizationUser } from "../lib/user-invitations";

export const userRoleLabels = { ORGANIZATION_ADMIN: "Organization admin", MEDICAL: "Medical user", SUPPORT: "Support user" };

export function UserInvitationDialog({ user, facilities, onClose, onCreated }: { user: AuthenticatedUser; facilities: Facility[]; onClose: () => void; onCreated: () => void }) {
  const [role, setRole] = useState<CreateInvitation["role"]>("MEDICAL");
  const [facility, setFacility] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      const result = await inviteOrganizationUser(user.organizationId, { email, role, facilityIds: facility === "all" ? [] : [facility] });
      onCreated();
      if (result.activationToken) setLink(window.location.origin + "/invite/" + result.activationToken);
      else onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation failed."); }
    finally { setBusy(false); }
  }
  return <Dialog ariaLabel="Invite user" isOpen isDismissable={!busy} onOpenChange={(open) => { if (!open && !busy) onClose(); }} className="sm:max-w-md">
    <DialogHeader><DialogTitle>Invite user</DialogTitle></DialogHeader>
    {link ? <div className="grid gap-4"><p role="status">Invitation created.</p><Field><FieldLabel htmlFor="user-invitation-link">Development invitation link</FieldLabel><Input id="user-invitation-link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} /></Field><Button onPress={onClose}>Done</Button></div> :
      <form className="grid gap-4" onSubmit={submit}>
        <Field><FieldLabel htmlFor="user-invite-email">Email *</FieldLabel><Input id="user-invite-email" name="email" type="email" required autoFocus disabled={busy} /></Field>
        <Field><FieldLabel>Role *</FieldLabel><Select aria-label="Role" selectedKey={role} isDisabled={busy} onSelectionChange={(key) => setRole(String(key) as CreateInvitation["role"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(userRoleLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel>Facility</FieldLabel><Select aria-label="Facility" selectedKey={facility} isDisabled={busy} onSelectionChange={(key) => setFacility(String(key))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilities.map((item) => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" isDisabled={busy} onPress={onClose}>Cancel</Button><Button type="submit" isDisabled={busy}>{busy ? "Creating…" : "Send invitation"}</Button></div>
      </form>}
  </Dialog>;
}
