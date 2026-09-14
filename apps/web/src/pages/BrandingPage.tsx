import { DEFAULT_ORGANIZATION_BRANDING, type AuthenticatedUser } from "@niq/application-contracts";
import { CircleAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiRequestError, getOrganization, updateOrganization } from "../lib/api";
import { brandingFromOrganization } from "../lib/branding";
import { useBranding } from "../lib/branding-context";

export function BrandingPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { branding, updateBranding } = useBranding();
  const [hasLogo, setHasLogo] = useState(false);
  const [displayName, setDisplayName] = useState(branding.displayName);
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(branding.secondaryColor);
  const [patientReferencePrefix, setPatientReferencePrefix] = useState("PAT");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = user.role === "ORGANIZATION_ADMIN";

  useEffect(() => {
    let active = true;
    getOrganization(user.organizationId)
      .then(({ organization }) => {
        if (!active) return;
        const serverBranding = brandingFromOrganization(organization);
        setDisplayName(serverBranding.displayName);
        setPrimaryColor(serverBranding.primaryColor);
        setSecondaryColor(serverBranding.secondaryColor);
        setPatientReferencePrefix(organization.patientReferencePrefix);
        setHasLogo(Boolean(organization.logoObjectKey));
        updateBranding(serverBranding);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "Organization settings could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [updateBranding, user.organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBranding = { displayName, primaryColor, secondaryColor };
    setSaving(true);
    setSaved(false);
    setMessage(null);
    try {
      await updateOrganization(user.organizationId, { ...nextBranding, patientReferencePrefix });
      updateBranding(nextBranding);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } catch (error) {
      setMessage(error instanceof ApiRequestError || error instanceof Error ? error.message : "Organization settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <h1 className="patient-page-title">Branding</h1>
      <Card className="surface p-6 sm:p-8">
        <form className="grid gap-6" onSubmit={submit}>
          <fieldset disabled={!canManage || loading || saving} className="grid min-w-0 gap-6 border-0 p-0 m-0">
          <div className="grid gap-6 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="branding-display-name">Display name</FieldLabel><Input id="branding-display-name" name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></Field>
          <Field>
            <FieldLabel htmlFor="patientReferencePrefix">Patient prefix</FieldLabel>
            <Input id="patientReferencePrefix" name="patientReferencePrefix" required minLength={2} maxLength={12} pattern="[A-Za-z][A-Za-z0-9]{1,11}" value={patientReferencePrefix} readOnly={!canManage || loading} onChange={(event) => setPatientReferencePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} />
            <FieldDescription>Applies to new patients only.</FieldDescription>
            {!canManage && <FieldError>Only an organization administrator can change this prefix.</FieldError>}
          </Field>
          </div>
          <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="branding-primary">Primary colour</FieldLabel><div className="flex h-12 items-center gap-3 rounded-lg border px-3"><input id="branding-primary" className="size-7 cursor-pointer border-0 bg-transparent p-0" name="primaryColor" type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())} /><span className="text-sm font-mono">{primaryColor}</span></div></Field>
            <Field><FieldLabel htmlFor="branding-secondary">Secondary colour</FieldLabel><div className="flex h-12 items-center gap-3 rounded-lg border px-3"><input id="branding-secondary" className="size-7 cursor-pointer border-0 bg-transparent p-0" name="secondaryColor" type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value.toUpperCase())} /><span className="text-sm font-mono">{secondaryColor}</span></div></Field>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t pt-6">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white">{hasLogo ? <img className="size-full object-contain p-2" src={`/api/v1/organizations/${user.organizationId}/logo`} alt="Organization logo" onError={() => setHasLogo(false)} /> : <span className="text-2xl font-semibold text-muted-foreground">{displayName.trim().charAt(0) || "N"}</span>}</div>
            <div className="grid gap-1"><span className="text-sm font-medium">Organization logo</span><span className="text-sm text-muted-foreground">{hasLogo ? "Saved during organization setup." : "No logo uploaded."}</span><span className="text-xs text-muted-foreground">Logo replacement is not available yet.</span></div>
          </div>
          </fieldset>
          {message && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><Button type="button" variant="outline" isDisabled={!canManage || loading || saving} onPress={() => { setPrimaryColor(DEFAULT_ORGANIZATION_BRANDING.primaryColor); setSecondaryColor(DEFAULT_ORGANIZATION_BRANDING.secondaryColor); }}>Reset colours</Button><Button type="submit" isDisabled={!canManage || loading || saving}>{saving ? "Saving…" : saved ? "Saved" : "Save settings"}</Button></div>
        </form>
      </Card>
  </>;
}
