import { hasChangedInputs, useUnsavedFormClose } from "./useUnsavedFormClose";
import { hasPermission, membershipRoleLabels } from "@niq/application-contracts";
import { type AuthenticatedUser, type Facility, type CreateInvitation } from "@niq/application-contracts";
import { type FormEvent, useRef, useState } from "react";
import { Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteOrganizationUser } from "../lib/user-invitations";

export const userRoleLabels = membershipRoleLabels;

export function UserInvitationDialog({ user, facilities, allFacilities, onClose, onCreated }: { user: AuthenticatedUser; facilities: Facility[]; allFacilities: boolean; onClose: () => void; onCreated: () => void }) {
  const [role, setRole] = useState<CreateInvitation["role"] | null>(null);
  const [facility, setFacility] = useState(allFacilities ? "all" : facilities[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const initialFacility = useRef(facility);
  const { requestClose, confirmation } = useUnsavedFormClose({ subject: "user", onClose, isBusy: () => submitting.current,
    isDirty: () => !done && (hasChangedInputs(formRef.current) || role !== null || facility !== initialFacility.current) });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !facility || !role) return;
    submitting.current = true; setBusy(true); setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      const result = await inviteOrganizationUser(user.organizationId, { email, role, facilityIds: facility === "all" ? [] : [facility] });
      onCreated();
      if (result.activationToken) setLink(window.location.origin + "/invite/" + result.activationToken);
      setDone(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation failed."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <><Dialog ariaLabel="Invite user" isOpen isDismissable={!busy} isKeyboardDismissDisabled={busy} onOpenChange={(open) => { if (!open) requestClose(); }} showCloseButton={!busy} className="facility-dialog">
    <DialogHeader><DialogTitle className="flex items-center gap-2">{done && <CheckCircle2 aria-hidden="true" className="size-5 text-success" />}{done ? "Invitation created" : "Invite user"}</DialogTitle></DialogHeader>
    {done ? <div className="clinical-form"><div className="form-fields facility-dialog-fields"><p role="status">{link ? "Share this link with your colleague." : "The invitation is ready."}</p>{link && <Field><FieldLabel htmlFor="user-invitation-link">Invitation link</FieldLabel><Input id="user-invitation-link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} /></Field>}{message && <p role="alert" className="text-sm text-destructive">{message}</p>}</div><div className="form-footer">{link && <Button variant="outline" onPress={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setMessage(""); } catch { setMessage("Select the link and copy it manually."); } }}><Copy aria-hidden="true" />{copied ? "Copied" : "Copy link"}</Button>}<Button onPress={onClose}>Done</Button></div></div> :
      <form ref={formRef} className="clinical-form" onSubmit={submit}><fieldset disabled={busy} className="form-fields facility-dialog-fields m-0 min-w-0 border-0">
        <Field><FieldLabel htmlFor="user-invite-email" className="required-field-label">Email <span aria-hidden="true">*</span></FieldLabel><Input id="user-invite-email" name="email" type="email" required autoFocus disabled={busy} /></Field>
        <Field><FieldLabel className="required-field-label">Role <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Role" placeholder="Select role" isRequired selectedKey={role} isDisabled={busy} onSelectionChange={(key) => setRole(key === null ? null : String(key) as CreateInvitation["role"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(userRoleLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select>{role && <p className="text-sm text-muted-foreground">{role === "ORGANIZATION_ADMIN" ? "Manages organization users and settings." : hasPermission(role, "assessments.edit") ? "Works with patients and assessments." : "Provides support with the access allowed for this role."}</p>}</Field>
        <Field><FieldLabel>Facility</FieldLabel><Select aria-label="Facility" selectedKey={facility} isDisabled={busy} onSelectionChange={(key) => setFacility(String(key))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{allFacilities && <SelectItem id="all">All facilities</SelectItem>}{facilities.map((item) => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
        {!allFacilities && <p className="text-sm text-muted-foreground">Choose one of your assigned facilities.</p>}
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        </fieldset><div className="form-footer"><Button type="button" variant="outline" isDisabled={busy} onPress={requestClose}>Cancel</Button><Button type="submit" isDisabled={busy || !facility || !role}>{busy ? "Creating…" : "Create invitation"}</Button></div>
      </form>}
  </Dialog>{confirmation}</>;
}
