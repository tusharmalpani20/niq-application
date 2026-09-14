import { DEFAULT_ORGANIZATION_BRANDING, type AuthenticatedUser, type Organization } from "@niq/application-contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getOrganization, updateOrganization } from "../lib/api";
import { brandingFromOrganization } from "../lib/branding";
import { useBranding } from "../lib/branding-context";
import { ORGANIZATION_LOGO_ACCEPT, organizationLogoError, organizationLogoPayload } from "../lib/organization-onboarding";

const hex = /^#[0-9a-fA-F]{6}$/;
function settingsFrom(org: Organization) {
  return { displayName: org.displayName, primaryColor: org.primaryColor.toUpperCase(), secondaryColor: org.secondaryColor.toUpperCase(), patientReferencePrefix: org.patientReferencePrefix };
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = label === "Primary colour" ? "branding-primary" : "branding-secondary";
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <div className="flex items-center gap-3 rounded-lg border px-3">
      <input type="color" aria-label={label + " picker"} className="size-7 shrink-0 cursor-pointer border-0 bg-transparent p-0" value={hex.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      <Input id={id} className="h-11 border-0 bg-transparent font-mono shadow-none" required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
    </div>
  </Field>;
}

export function BrandingPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { branding, updateBranding } = useBranding();
  const [draft, setDraft] = useState({ displayName: branding.displayName, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, patientReferencePrefix: "PAT" });
  const [baseline, setBaseline] = useState<typeof draft | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = baseline !== null && (JSON.stringify(draft) !== JSON.stringify(baseline) || logo !== null);
  const disabled = user.role !== "ORGANIZATION_ADMIN" || !baseline || saving;

  useEffect(() => {
    let active = true;
    getOrganization(user.organizationId).then(({ organization }) => {
      if (!active) return;
      setDraft(settingsFrom(organization)); setBaseline(settingsFrom(organization));
      updateBranding(brandingFromOrganization(organization));
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Settings could not be loaded."); });
    return () => { active = false; };
  }, [updateBranding, user.organizationId]);

  useEffect(() => {
    if (!logo) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(logo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  function change(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value })); setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !dirty) return;
    setSaving(true); setSaved(false); setMessage(null);
    try {
      const upload = await organizationLogoPayload(logo);
      const organization = await updateOrganization(user.organizationId, { ...draft, ...(upload ? { logo: upload } : {}) });
      setDraft(settingsFrom(organization)); setBaseline(settingsFrom(organization));
      updateBranding(brandingFromOrganization(organization));
      setLogo(null);
      if (fileInput.current) fileInput.current.value = "";
      setSaved(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setSaving(false); }
  }

  const logoUrl = previewUrl ?? branding.logoUrl;
  return <>
    <h1 className="patient-page-title">Branding</h1>
    <Card className="surface p-6 sm:p-8">
      <form className="grid gap-5" onSubmit={submit}>
        <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          <div className="grid items-center gap-5 sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white">
                {logoUrl ? <img src={logoUrl} alt="Organization logo" className="size-full object-contain p-1" /> : <span className="text-2xl text-muted-foreground">{draft.displayName.charAt(0) || "N"}</span>}
              </div>
              <div className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Organization logo</span>
                <input ref={fileInput} className="sr-only" type="file" tabIndex={-1} aria-label="Upload organization logo" accept={ORGANIZATION_LOGO_ACCEPT} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const error = organizationLogoError(file);
                  if (error) { setMessage(error); event.target.value = ""; return; }
                  setMessage(null); setLogo(file); setSaved(false);
                }} />
                <Button className="w-fit" type="button" variant="outline" size="sm" isDisabled={disabled} onPress={() => fileInput.current?.click()}>{logoUrl ? "Change logo" : "Upload logo"}</Button>
                <span className="text-xs text-muted-foreground">PNG, JPEG or WebP · Up to 2 MB</span>
                {logo && <span className="truncate text-xs text-muted-foreground">{logo.name} · Unsaved</span>}
              </div>
            </div>
            <Field><FieldLabel htmlFor="branding-name">Display name</FieldLabel><Input id="branding-name" required minLength={2} maxLength={120} value={draft.displayName} onChange={(event) => change("displayName", event.target.value)} /></Field>
          </div>
          <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
            <ColourField label="Primary colour" value={draft.primaryColor} onChange={(value) => change("primaryColor", value)} />
            <ColourField label="Secondary colour" value={draft.secondaryColor} onChange={(value) => change("secondaryColor", value)} />
          </div>
          <section className="grid gap-3 border-t pt-5">
            <h2 className="m-0 text-sm font-semibold">Patient numbering</h2>
            <Field className="max-w-sm"><FieldLabel htmlFor="patientReferencePrefix">Patient prefix</FieldLabel><Input id="patientReferencePrefix" required minLength={2} maxLength={12} pattern="[A-Z][A-Z0-9]{1,11}" value={draft.patientReferencePrefix} onChange={(event) => change("patientReferencePrefix", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /><FieldDescription>Applies to new patients only. Existing references stay unchanged.</FieldDescription></Field>
          </section>
        </fieldset>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="outline" isDisabled={disabled} onPress={() => { setDraft((current) => ({ ...current, ...DEFAULT_ORGANIZATION_BRANDING })); setSaved(false); }}>Reset colours</Button>
          <div className="flex items-center gap-3"><span role="status" className="text-sm text-muted-foreground">{saved ? "Changes saved" : dirty ? "Unsaved changes" : ""}</span><Button type="submit" isDisabled={disabled || !dirty}>{saving ? "Saving…" : "Save changes"}</Button></div>
        </div>
      </form>
    </Card>
  </>;
}
