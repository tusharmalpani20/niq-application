import { hasPermission } from "@niq/application-contracts";
import { DEFAULT_ORGANIZATION_BRANDING, type AuthenticatedUser, type Organization } from "@niq/application-contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { getOrganization, updateOrganization } from "../lib/api";
import { contrastingForeground } from "../lib/colour-contrast";
import { brandingFromOrganization } from "../lib/branding";
import { useBranding } from "../lib/branding-context";
import { ORGANIZATION_LOGO_ACCEPT, organizationLogoError, organizationLogoPayload } from "../lib/organization-onboarding";
import { ApplicationLogo } from "../components/ApplicationLogo";

const hex = /^#[0-9a-fA-F]{6}$/;
function settingsFrom(org: Organization) {
  return { displayName: org.displayName, primaryColor: org.primaryColor.toUpperCase(), secondaryColor: org.secondaryColor.toUpperCase(), patientReferencePrefix: org.patientReferencePrefix };
}
type BrandingDraft = ReturnType<typeof settingsFrom>;
type BrandingErrors = Partial<Record<keyof BrandingDraft, string>>;

function validateDraft(draft: BrandingDraft): BrandingErrors {
  const errors: BrandingErrors = {};
  if (draft.displayName.trim().length < 2) errors.displayName = "Enter a display name with at least 2 characters.";
  if (!hex.test(draft.primaryColor)) errors.primaryColor = "Enter a six-digit hex colour, such as #3BB9BD.";
  if (!hex.test(draft.secondaryColor)) errors.secondaryColor = "Enter a six-digit hex colour, such as #4F5052.";
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(draft.patientReferencePrefix)) errors.patientReferencePrefix = "Use 2–12 uppercase letters or numbers, starting with a letter.";
  return errors;
}

function ColourField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }) {
  const id = label === "Primary colour" ? "branding-primary" : "branding-secondary";
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <div className="flex items-center gap-3 rounded-lg border px-3">
      <input type="color" aria-label={label + " picker"} className="size-7 shrink-0 cursor-pointer border-0 bg-transparent p-0" value={hex.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      <Input id={id} className="h-11 border-0 bg-transparent font-mono shadow-none" required pattern="#[0-9a-fA-F]{6}" maxLength={7} aria-invalid={Boolean(error)} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
    </div>
    {error && <FieldError>{error}</FieldError>}
  </Field>;
}

export function BrandingPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const { branding, updateBranding } = useBranding();
  const [draft, setDraft] = useState({ displayName: branding.displayName, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, patientReferencePrefix: "PAT" });
  const [baseline, setBaseline] = useState<typeof draft | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<BrandingErrors>({});
  const dirty = baseline !== null && (JSON.stringify(draft) !== JSON.stringify(baseline) || logo !== null || removeLogo);
  const disabled = !hasPermission(user.role, "organization.manage") || !baseline || saving;

  useEffect(() => {
    let active = true;
    setLoadError(false); setMessage(null);
    getOrganization(user.organizationId).then(({ organization }) => {
      if (!active) return;
      setDraft(settingsFrom(organization)); setBaseline(settingsFrom(organization));
      setLogo(null); setRemoveLogo(false); setFieldErrors({});
      updateBranding(brandingFromOrganization(organization));
    }).catch((error) => { if (active) { setLoadError(true); setMessage(error instanceof Error ? error.message : "Settings could not be loaded."); } });
    return () => { active = false; };
  }, [updateBranding, user.organizationId, loadAttempt]);

  useEffect(() => {
    if (!logo) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(logo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    // The shell dispatches this before button-driven navigation and sign out.
    // BrowserRouter does not provide the data router's useBlocker API.
    const canLeave = () => !saving && window.confirm("Discard your unsaved branding changes?");
    const guardNavigation = (event: Event) => { if (!canLeave()) event.preventDefault(); };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.href === window.location.href) return;
      if (!canLeave()) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("niq:before-navigation", guardNavigation);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("niq:before-navigation", guardNavigation); document.removeEventListener("click", guardLink, true); };
  }, [dirty, saving]);

  function discard() {
    if (!baseline) return;
    setDraft(baseline); setLogo(null); setRemoveLogo(false); setFieldErrors({}); setSaved(false); setMessage(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function change(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined })); setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !dirty) return;
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const firstInvalid = Object.keys(errors)[0] as keyof BrandingDraft;
      document.getElementById({ displayName: "branding-name", primaryColor: "branding-primary", secondaryColor: "branding-secondary", patientReferencePrefix: "patientReferencePrefix" }[firstInvalid])?.focus();
      return;
    }
    setSaving(true); setSaved(false); setMessage(null);
    try {
      const upload = await organizationLogoPayload(logo);
      const organization = await updateOrganization(user.organizationId, { ...draft, ...(upload ? { logo: upload } : removeLogo ? { logoObjectKey: null } : {}) });
      setDraft(settingsFrom(organization)); setBaseline(settingsFrom(organization));
      updateBranding(brandingFromOrganization(organization));
      setLogo(null); setRemoveLogo(false);
      if (fileInput.current) fileInput.current.value = "";
      setSaved(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setSaving(false); }
  }

  const logoUrl = removeLogo ? null : previewUrl ?? branding.logoUrl;
  return <>
    <h1 className="patient-page-title">Branding</h1>
    <Card className="surface p-6 sm:p-8">
      <form className="grid gap-5" noValidate onSubmit={submit}>
        <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          <div className="grid items-center gap-5 sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-card">
                {logoUrl ? <img src={logoUrl} alt="Organization logo" className="size-full object-contain p-1" /> : <ApplicationLogo className="size-full object-contain p-1" />}
              </div>
              <div className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Organization logo</span>
                <input ref={fileInput} className="sr-only" type="file" tabIndex={-1} aria-label="Upload organization logo" accept={ORGANIZATION_LOGO_ACCEPT} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const error = organizationLogoError(file);
                  if (error) { setMessage(error); event.target.value = ""; return; }
                  setMessage(null); setLogo(file); setRemoveLogo(false); setSaved(false);
                }} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" isDisabled={disabled} onPress={() => fileInput.current?.click()}>{logoUrl ? "Change logo" : "Upload logo"}</Button>
                  {logoUrl && <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove organization logo" isDisabled={disabled} onPress={() => {
                    setLogo(null); setRemoveLogo(Boolean(branding.logoUrl)); setSaved(false);
                    if (fileInput.current) fileInput.current.value = "";
                  }}><X aria-hidden="true" /></Button>}
                </div>
                <span className="text-xs text-muted-foreground">PNG, JPEG or WebP · Up to 2 MB</span>
                {removeLogo && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Nutra-IQ logo will appear after saving.</span><Button type="button" variant="link" size="sm" isDisabled={disabled} onPress={() => setRemoveLogo(false)}>Undo</Button></div>}
                {logo && <><span className="truncate text-xs text-muted-foreground">{logo.name} · Unsaved</span><Button type="button" variant="ghost" size="sm" isDisabled={disabled} onPress={() => { setLogo(null); if (fileInput.current) fileInput.current.value = ""; }}>Undo logo change</Button></>}
              </div>
            </div>
            <Field><FieldLabel htmlFor="branding-name">Display name</FieldLabel><Input id="branding-name" required minLength={2} maxLength={120} aria-invalid={Boolean(fieldErrors.displayName)} value={draft.displayName} onChange={(event) => change("displayName", event.target.value)} />{fieldErrors.displayName && <FieldError>{fieldErrors.displayName}</FieldError>}</Field>
          </div>
          <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
            <ColourField label="Primary colour" value={draft.primaryColor} error={fieldErrors.primaryColor} onChange={(value) => change("primaryColor", value)} />
            <ColourField label="Secondary colour" value={draft.secondaryColor} error={fieldErrors.secondaryColor} onChange={(value) => change("secondaryColor", value)} />
          </div>
          <section className="grid gap-3 rounded-xl border p-4" aria-label="Brand preview">
            <h2 className="m-0 text-sm font-semibold">Preview</h2>
            <p className="text-sm text-muted-foreground">Primary is used for buttons and navigation. Secondary is used for accents.</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg px-4 py-2 font-medium" style={{ backgroundColor: draft.primaryColor, color: "#ffffff" }}>Primary button</span>
              <span className="rounded-lg border px-4 py-2" style={{ borderColor: draft.primaryColor, color: draft.primaryColor }}>Selected navigation</span>
              <span className="rounded-lg px-4 py-2" style={{ backgroundColor: draft.secondaryColor, color: contrastingForeground(draft.secondaryColor) }}>Accent</span>
            </div>
            <p className="text-xs text-muted-foreground">Primary buttons and selected navigation use white text.</p>
          </section>
          <section className="grid gap-3 border-t pt-5">
            <h2 className="m-0 text-sm font-semibold">Patient numbering</h2>
            <Field className="max-w-sm"><FieldLabel htmlFor="patientReferencePrefix">Patient prefix</FieldLabel><Input id="patientReferencePrefix" required minLength={2} maxLength={12} pattern="[A-Z][A-Z0-9]{1,11}" aria-invalid={Boolean(fieldErrors.patientReferencePrefix)} value={draft.patientReferencePrefix} onChange={(event) => change("patientReferencePrefix", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />{fieldErrors.patientReferencePrefix && <FieldError>{fieldErrors.patientReferencePrefix}</FieldError>}<FieldDescription>Example: {draft.patientReferencePrefix || "PAT"}-1. Applies to new patients only. Existing references stay unchanged.</FieldDescription></Field>
          </section>
        </fieldset>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        {loadError && <Button type="button" className="w-fit" variant="outline" onPress={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="outline" isDisabled={disabled} onPress={() => { setDraft((current) => ({ ...current, ...DEFAULT_ORGANIZATION_BRANDING })); setSaved(false); }}>Reset colours</Button>
          <div className="flex items-center gap-3"><span role="status" className="text-sm text-muted-foreground">{saved ? "Changes saved" : dirty ? "Unsaved changes" : ""}</span><Button type="button" variant="outline" isDisabled={disabled || !dirty} onPress={discard}>Discard changes</Button><Button type="submit" isDisabled={disabled || !dirty}>{saving ? "Saving…" : "Save changes"}</Button></div>
        </div>
      </form>
    </Card>
  </>;
}
