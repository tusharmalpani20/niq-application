import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OnboardOrganizationResponse } from "@niq/application-contracts";
import { ApiRequestError, onboardOrganization } from "../lib/api";
import { PageHeader } from "../components/Page";
import { Icon } from "../lib/icons";
import { ORGANIZATION_LOGO_ACCEPT, organizationLogoError, organizationLogoPayload, organizationUrlName } from "../lib/organization-onboarding";

type LimitName = "userLimit" | "scoringMonthlyLimit" | "faceScanMonthlyLimit";
type Step = 0 | 1 | 2;

const steps = ["Organization", "Deployment & limits", "Branding"] as const;
const limitFields: Array<{ name: LimitName; label: string; help: string; unit: string }> = [
  { name: "userLimit", label: "Users", help: "Active users and pending invitations", unit: "users" },
  { name: "scoringMonthlyLimit", label: "Scores", help: "Completed requests each month", unit: "per month" },
  { name: "faceScanMonthlyLimit", label: "Face scans", help: "Automated scans each month", unit: "per month" },
];
const deploymentOptions = [
  { value: "NIQ_HOSTED", label: "NIQ hosted", help: "Runs in infrastructure managed by NIQ" },
  { value: "CLIENT_CLOUD", label: "Client cloud", help: "Runs in the client’s cloud account" },
  { value: "ON_PREM", label: "On-premises", help: "Runs inside the client’s network" },
] as const;

type FormProps = { onCancel?: () => void; onCreated?: () => void; onDirtyChange?: (dirty: boolean) => void };

export function OrganizationOnboardingForm({ onCancel, onCreated, onDirtyChange }: FormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [furthestStep, setFurthestStep] = useState<Step>(0);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#175CD3");
  const [secondaryColor, setSecondaryColor] = useState("#0E9384");
  const [unlimited, setUnlimited] = useState<Record<LimitName, boolean>>({ userLimit: true, scoringMonthlyLimit: true, faceScanMonthlyLimit: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<OnboardOrganizationResponse | null>(null);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  function markDirty() { onDirtyChange?.(true); }

  function moveNext() {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-onboarding-step="${step}"]`);
    const fields = panel?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
    if (fields && !Array.from(fields).every((field) => field.reportValidity())) return;
    const next = Math.min(2, step + 1) as Step;
    setStep(next);
    setFurthestStep((current) => Math.max(current, next) as Step);
  }

  function chooseLogo(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setLogoPreview(null);
    setLogoMessage(null);
    setLogo(null);
    if (!file) return;
    const error = organizationLogoError(file);
    if (error) { setLogoMessage(error); return; }
    const preview = URL.createObjectURL(file);
    previewUrlRef.current = preview;
    setLogoPreview(preview);
    setLogo(file);
    markDirty();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const limit = (name: LimitName) => unlimited[name] ? null : Number(data.get(name));
    try {
      const result = await onboardOrganization({
        legalName: String(data.get("legalName")), displayName, slug,
        firstAdminEmail: String(data.get("firstAdminEmail")),
        deploymentMode: String(data.get("deploymentMode")) as "NIQ_HOSTED" | "CLIENT_CLOUD" | "ON_PREM",
        primaryColor, secondaryColor,
        scoringEnabled: data.get("scoringEnabled") === "on", faceScanEnabled: data.get("faceScanEnabled") === "on",
        userLimit: limit("userLimit"), scoringMonthlyLimit: limit("scoringMonthlyLimit"), faceScanMonthlyLimit: limit("faceScanMonthlyLimit"),
        logo: await organizationLogoPayload(logo),
      });
      setCreated(result);
      onDirtyChange?.(false);
      onCreated?.();
    } catch (error) {
      setMessage(error instanceof ApiRequestError || error instanceof Error ? error.message : "The organization could not be created. Please try again.");
    } finally { setBusy(false); }
  }

  if (created) {
    const invitationUrl = created.activationToken ? `${window.location.origin}/invite/${created.activationToken}` : null;
    return <section className="onboarding-success"><div className="success-icon"><Icon name="check" /></div><div><h2>{created.organization.displayName} created</h2><p>The organization, usage limits and administrator invitation were saved together.</p></div>
      {invitationUrl ? <label>Local invitation link<textarea readOnly value={invitationUrl} /><span className="field-help">Visible only in development. Production delivery will use the configured notification provider.</span></label> : <div className="notice notice-info"><div><strong>Invitation created</strong><span>The delivery provider will send the activation link to {created.invitation.email}.</span></div></div>}
      <div className="form-actions">{onCancel ? <button className="btn btn-outline" type="button" onClick={onCancel}>Close</button> : <Link className="btn btn-outline" to="/admin/organizations">All organizations</Link>}<Link className="btn btn-primary" to={`/admin/organizations/${created.organization.id}`}>Manage organization</Link></div>
    </section>;
  }

  return <form ref={formRef} className="admin-onboarding-form onboarding-wizard" onSubmit={submit} onChange={markDirty}>
    <div className="onboarding-tabs" role="tablist" aria-label="Organization setup steps">{steps.map((label, index) => <button key={label} role="tab" type="button" aria-selected={step === index} className={step === index ? "active" : index < step ? "complete" : ""} disabled={index > furthestStep} onClick={() => setStep(index as Step)}><span>{index < step ? <Icon name="check" size={14} /> : index + 1}</span><strong>{label}</strong></button>)}</div>

    <div className="onboarding-panel" role="tabpanel" hidden={step !== 0} data-onboarding-step="0">
      <div className="wizard-heading"><h2>Organization details</h2><p>Set up the client account and invite its first administrator.</p></div>
      <div className="field-grid">
        <label>Display name<input name="displayName" required minLength={2} value={displayName} placeholder="Apollo Hospitals" onChange={(event) => { const value = event.target.value; setDisplayName(value); if (!slugEdited) setSlug(organizationUrlName(value)); }} /></label>
        <label>Legal name<input name="legalName" required minLength={2} placeholder="Apollo Hospitals Enterprise Ltd." /></label>
        <label>URL name<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} placeholder="apollo-hospitals" aria-describedby="url-name-help" onChange={(event) => { setSlugEdited(true); setSlug(organizationUrlName(event.target.value)); }} /><small id="url-name-help" className="field-help">Used in organization links. You can edit it.</small></label>
        <label>First administrator email<input name="firstAdminEmail" type="email" required placeholder="admin@hospital.org" /></label>
      </div>
    </div>

    <div className="onboarding-panel" role="tabpanel" hidden={step !== 1} data-onboarding-step="1">
      <div className="wizard-heading"><h2>Deployment and usage</h2><p>Choose where the application runs and set any account limits.</p></div>
      <fieldset className="wizard-fieldset"><legend>Deployment type</legend><div className="deployment-choice-grid">{deploymentOptions.map((option) => <label className="deployment-choice" key={option.value}><input type="radio" name="deploymentMode" value={option.value} defaultChecked={option.value === "NIQ_HOSTED"} /><span className="choice-mark" /><span><strong>{option.label}</strong><small>{option.help}</small></span></label>)}</div></fieldset>
      <div className="service-toggle-grid">
        <label className="switch-row"><span><strong>Scoring</strong><small>Allow this organization to request scores</small></span><input name="scoringEnabled" type="checkbox" defaultChecked /><i aria-hidden="true" /></label>
        <label className="switch-row"><span><strong>Face scan</strong><small>Allow automated face-scan requests</small></span><input name="faceScanEnabled" type="checkbox" defaultChecked /><i aria-hidden="true" /></label>
      </div>
      <fieldset className="wizard-fieldset"><legend>Usage limits</legend><div className="wizard-limit-list">{limitFields.map((field) => <div className="wizard-limit-row" key={field.name}><div><strong>{field.label}</strong><small>{field.help}</small></div>{!unlimited[field.name] && <label className="limit-value"><span className="sr-only">{field.label} limit</span><input name={field.name} type="number" inputMode="numeric" min="1" defaultValue="100" required /><em>{field.unit}</em></label>}<label className="unlimited-toggle"><input type="checkbox" checked={unlimited[field.name]} onChange={(event) => setUnlimited((current) => ({ ...current, [field.name]: event.target.checked }))} /><span>Unlimited</span></label></div>)}</div></fieldset>
    </div>

    <div className="onboarding-panel" role="tabpanel" hidden={step !== 2} data-onboarding-step="2">
      <div className="wizard-heading"><h2>Branding</h2><p>Add the organization’s logo and colours. These appear after its users sign in.</p></div>
      <div className="branding-wizard-grid">
        <div className="logo-field"><span className="field-label">Organization logo <small>Optional</small></span><label className="logo-dropzone"><input type="file" accept={ORGANIZATION_LOGO_ACCEPT} onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)} /><span className="logo-preview">{logoPreview ? <img src={logoPreview} alt="Organization logo preview" /> : <Icon name="building" size={26} />}</span><span><strong>{logo ? logo.name : "Choose a logo"}</strong><small>PNG, JPEG or WebP · maximum 2 MB</small></span></label>{logoMessage && <p className="error-message" role="alert">{logoMessage}</p>}</div>
        <div className="brand-colour-grid"><label>Primary colour<span className="brand-colour-input"><input name="primaryColor" type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())} /><span>{primaryColor}</span></span></label><label>Secondary colour<span className="brand-colour-input"><input name="secondaryColor" type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value.toUpperCase())} /><span>{secondaryColor}</span></span></label></div>
      </div>
    </div>

    {message && <p className="error-message onboarding-error" role="alert">{message}</p>}
    <footer className="form-footer wizard-footer"><div>{onCancel ? <button className="btn btn-outline" type="button" onClick={onCancel}>Cancel</button> : <Link className="btn btn-outline" to="/admin/organizations">Cancel</Link>}</div><div>{step > 0 && <button className="btn btn-outline" type="button" onClick={() => setStep((step - 1) as Step)}>Back</button>}{step < 2 ? <button key="continue" className="btn btn-primary" type="button" onClick={(event) => { event.preventDefault(); moveNext(); }}>Continue</button> : <button key="submit" className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create organization"}</button>}</div></footer>
  </form>;
}

export function AdminCreateOrganizationPage() {
  return <><div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>New organization</span></div><PageHeader title="Add organization" /><section className="surface"><OrganizationOnboardingForm /></section></>;
}
