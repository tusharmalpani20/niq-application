import { hasPermission, membershipRoleLabels, type AuthenticatedUser, type Facility, type MembershipRole, type OrganizationUser } from "@niq/application-contracts";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateOrganizationUser } from "../lib/user-edit";

export function canEditOrganizationUser(target: OrganizationUser, facilities: Facility[], allFacilities: boolean): boolean {
  return target.facilities !== undefined && (allFacilities || target.facilities.length > 0 && target.facilities.every(item => facilities.some(facility => facility.id === item.id)));
}

export function UserEditDialog({ user, target, facilities, allFacilities, onClose, onSaved }: {
  user: AuthenticatedUser; target: OrganizationUser; facilities: Facility[]; allFacilities: boolean; onClose: () => void; onSaved: (saved: OrganizationUser) => void;
}) {
  const self = user.userId === target.userId;
  const [displayName, setDisplayName] = useState(target.displayName);
  const [role, setRole] = useState<MembershipRole>(target.role);
  const [ids, setIds] = useState(target.facilities?.map(item => item.id) ?? []);
  const [unrestricted, setUnrestricted] = useState(target.facilities?.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const allowed = hasPermission(user.role, "users.manage") && canEditOrganizationUser(target, facilities, allFacilities);
  // Include inactive assignments so a name/role edit never silently drops access.
  const options = [...facilities, ...(target.facilities ?? []).filter(item => !facilities.some(facility => facility.id === item.id))];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || inFlight.current || !displayName.trim() || !unrestricted && !ids.length) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const saved = await updateOrganizationUser(user.organizationId, target.membershipId, {
        displayName: displayName.trim(), role: self ? target.role : role,
        facilityIds: self ? target.facilities!.map(item => item.id) : unrestricted ? [] : ids,
      });
      if (self) window.dispatchEvent(new Event("niq:user-profile-updated"));
      onSaved(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The user could not be updated."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Dialog ariaLabel="Edit user" className="facility-dialog" isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
    <form className="clinical-form" onSubmit={submit}>
      <fieldset disabled={busy || !allowed} className="form-fields facility-dialog-fields m-0 min-w-0 border-0">
        <Field><FieldLabel htmlFor="edit-user-name" className="required-field-label">Name <span aria-hidden="true">*</span></FieldLabel><Input id="edit-user-name" value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={120} autoFocus /></Field>
        <Field><FieldLabel htmlFor="edit-user-email">Email</FieldLabel><Input id="edit-user-email" value={target.email} readOnly /></Field>
        <Field><FieldLabel className="required-field-label">Role <span aria-hidden="true">*</span></FieldLabel><Select aria-label="Role" selectedKey={role} isDisabled={busy || self || !allowed} onSelectionChange={key => setRole(String(key) as MembershipRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(membershipRoleLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel className="required-field-label">Facility access <span aria-hidden="true">*</span></FieldLabel>
          {(allFacilities || unrestricted) && <div className="flex items-center gap-3"><Checkbox id="edit-user-all-facilities" aria-label="All facilities" isSelected={unrestricted} isDisabled={busy || self || !allowed || !allFacilities} onChange={setUnrestricted} /><label htmlFor="edit-user-all-facilities">All facilities</label></div>}
          {!unrestricted && <div className="grid gap-3">{options.map(facility => <div key={facility.id} className="flex items-center gap-3"><Checkbox id={`edit-user-facility-${facility.id}`} aria-label={facility.name} isSelected={ids.includes(facility.id)} isDisabled={busy || self || !allowed} onChange={selected => setIds(current => selected ? [...current, facility.id] : current.filter(id => id !== facility.id))} /><label htmlFor={`edit-user-facility-${facility.id}`}>{facility.name}{"status" in facility && facility.status !== "ACTIVE" ? " (inactive)" : ""}</label></div>)}</div>}
          {!unrestricted && !ids.length && <p className="text-sm text-muted-foreground">Select at least one facility.</p>}
          {self && <p className="text-sm text-muted-foreground">Another administrator can change your role or facility access.</p>}
        </Field>
        {!allowed && <p role="alert" className="text-destructive">This user’s facility access is outside your assigned facilities.</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </fieldset>
      <div className="form-footer"><Button variant="outline" isDisabled={busy} onPress={onClose}>Cancel</Button><Button type="submit" isDisabled={busy || !allowed || !displayName.trim() || !unrestricted && !ids.length}>{busy ? "Saving…" : "Save changes"}</Button></div>
    </form>
  </Dialog>;
}
