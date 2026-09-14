import { DEFAULT_ORGANIZATION_BRANDING, type AuthenticatedUser } from "@niq/application-contracts";
import { CircleAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../components/Page";
import { ApiRequestError, getOrganization, updateOrganization } from "../lib/api";
import { brandingFromOrganization } from "../lib/branding";
import { useBranding } from "../lib/branding-context";

export function BrandingPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { branding, updateBranding, resetBranding } = useBranding();
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
    <PageHeader eyebrow="Organization settings" title="Branding" description="Apply your organization’s identity after users sign in." />
    <div className="branding-grid">
      <Card className="surface branding-form">
        <form onSubmit={submit}>
          <div className="section-heading"><div><p className="page-eyebrow">Theme</p><h2>Organization identity</h2></div></div>
          <Field><FieldLabel>Display name</FieldLabel><Input name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></Field>
          <div className="color-grid">
            <Field><FieldLabel>Primary colour</FieldLabel><div className="color-input"><input name="primaryColor" type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())} /><span>{primaryColor}</span></div></Field>
            <Field><FieldLabel>Secondary colour</FieldLabel><div className="color-input"><input name="secondaryColor" type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value.toUpperCase())} /><span>{secondaryColor}</span></div></Field>
          </div>
          <Field>
            <FieldLabel htmlFor="patientReferencePrefix">Patient prefix</FieldLabel>
            <Input id="patientReferencePrefix" name="patientReferencePrefix" required minLength={2} maxLength={12} pattern="[A-Za-z][A-Za-z0-9]{1,11}" value={patientReferencePrefix} readOnly={!canManage || loading} onChange={(event) => setPatientReferencePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} />
            <FieldDescription>Future patient references will use {patientReferencePrefix || "PREFIX"} plus this organization’s next serial number. Existing references never change.</FieldDescription>
            {!canManage && <FieldError>Only an organization administrator can change this prefix.</FieldError>}
          </Field>
          <Field><FieldLabel>Organization logo</FieldLabel><div className="upload-area"><strong>Upload a PNG or SVG</strong><FieldDescription>Maximum 2 MB. A square or horizontal transparent logo works best.</FieldDescription><input type="file" accept="image/png,image/svg+xml" /></div></Field>
          {message && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
          <div className="form-actions spread"><Button type="button" variant="outline" onPress={() => { resetBranding(); setDisplayName("NIQ"); setPrimaryColor(DEFAULT_ORGANIZATION_BRANDING.primaryColor); setSecondaryColor(DEFAULT_ORGANIZATION_BRANDING.secondaryColor); }}>Reset</Button><Button type="submit" isDisabled={!canManage || loading || saving}>{saving ? "Saving…" : saved ? "Saved" : "Save settings"}</Button></div>
        </form>
      </Card>
      <Card className="surface preview-panel"><p className="page-eyebrow">Live preview</p><div className="brand-preview"><div className="preview-sidebar"><div className="brand-logo">N</div><strong>{branding.displayName}</strong><span /><span /><span /></div><div className="preview-content"><div className="preview-header" /><div className="preview-heading" /><div className="preview-cards"><i /><i /><i /></div><Button size="sm">Primary action</Button></div></div><p className="muted">On shared sign-in URLs, NIQ branding is shown until the organization is identified.</p></Card>
    </div>
  </>;
}
