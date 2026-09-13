import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OnboardOrganizationResponse } from "@niq/application-contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
      {invitationUrl ? <Field><FieldLabel>Local invitation link</FieldLabel><Textarea readOnly value={invitationUrl} /><FieldDescription>Visible only in development. Production delivery will use the configured notification provider.</FieldDescription></Field> : <Alert><AlertDescription>The delivery provider will send the activation link to {created.invitation.email}.</AlertDescription></Alert>}
      <div className="form-actions">{onCancel ? <Button variant="outline" type="button" onPress={onCancel}>Close</Button> : <Link className={buttonVariants({ variant: "outline" })} to="/admin/organizations">All organizations</Link>}<Link className={buttonVariants()} to={`/admin/organizations/${created.organization.id}`}>Manage organization</Link></div>
    </section>;
  }

  return <form ref={formRef} className="admin-onboarding-form onboarding-wizard" onSubmit={submit} onChange={markDirty}>
    <Tabs selectedKey={step} onSelectionChange={(key) => setStep(Number(key) as Step)} className="min-h-0 min-w-0 flex-1 gap-0">
    <TabsList className="onboarding-tabs h-auto w-full min-w-0 rounded-none border-b bg-muted/40 p-2" aria-label="Organization setup steps">{steps.map((label, index) => <TabsTrigger id={index} key={label} isDisabled={index > furthestStep} className="h-12 min-w-0 gap-2 overflow-hidden"><span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs">{index < step ? <Icon name="check" size={14} /> : index + 1}</span><strong className="truncate">{label}</strong></TabsTrigger>)}</TabsList>

    <TabsContent id={0} className="onboarding-panel" data-onboarding-step="0">
      <div className="wizard-heading"><h2>Organization details</h2><p>Set up the client account and invite its first administrator.</p></div>
      <FieldGroup className="field-grid"><Field><FieldLabel htmlFor="displayName">Display name</FieldLabel><Input id="displayName" name="displayName" required minLength={2} value={displayName} placeholder="Apollo Hospitals" onChange={(event) => { const value = event.target.value; setDisplayName(value); if (!slugEdited) setSlug(organizationUrlName(value)); }} /></Field><Field><FieldLabel htmlFor="legalName">Legal name</FieldLabel><Input id="legalName" name="legalName" required minLength={2} placeholder="Apollo Hospitals Enterprise Ltd." /></Field><Field><FieldLabel htmlFor="slug">URL name</FieldLabel><Input id="slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} placeholder="apollo-hospitals" onChange={(event) => { setSlugEdited(true); setSlug(organizationUrlName(event.target.value)); }} /><FieldDescription>Used in organization links. You can edit it.</FieldDescription></Field><Field><FieldLabel htmlFor="firstAdminEmail">First administrator email</FieldLabel><Input id="firstAdminEmail" name="firstAdminEmail" type="email" required placeholder="admin@hospital.org" /></Field></FieldGroup>
    </TabsContent>

    <TabsContent id={1} className="onboarding-panel" data-onboarding-step="1">
      <div className="wizard-heading"><h2>Deployment and usage</h2><p>Choose where the application runs and set any account limits.</p></div>
      <FieldSet className="wizard-fieldset"><FieldLegend>Deployment type</FieldLegend><RadioGroup name="deploymentMode" defaultValue="NIQ_HOSTED" className="deployment-choice-grid">{deploymentOptions.map((option) => <FieldLabel className="deployment-choice" key={option.value}><RadioGroupItem value={option.value} /><span><strong>{option.label}</strong><small>{option.help}</small></span></FieldLabel>)}</RadioGroup></FieldSet>
      <div className="service-toggle-grid"><Field orientation="horizontal" className="switch-row"><FieldLabel className="grid flex-1 gap-1"><strong>Scoring</strong><small>Allow this organization to request scores</small></FieldLabel><Switch name="scoringEnabled" defaultSelected aria-label="Enable scoring" /></Field><Field orientation="horizontal" className="switch-row"><FieldLabel className="grid flex-1 gap-1"><strong>Face scan</strong><small>Allow automated face-scan requests</small></FieldLabel><Switch name="faceScanEnabled" defaultSelected aria-label="Enable face scan" /></Field></div>
      <FieldSet className="wizard-fieldset"><FieldLegend>Usage limits</FieldLegend><div className="wizard-limit-list">{limitFields.map((field) => <div className="wizard-limit-row" key={field.name}><div><strong>{field.label}</strong><small>{field.help}</small></div>{!unlimited[field.name] && <div className="limit-value"><Input aria-label={`${field.label} limit`} name={field.name} type="number" inputMode="numeric" min="1" defaultValue="100" required /><em>{field.unit}</em></div>}<Checkbox isSelected={unlimited[field.name]} onChange={(selected) => setUnlimited((current) => ({ ...current, [field.name]: selected }))}>Unlimited</Checkbox></div>)}</div></FieldSet>
    </TabsContent>

    <TabsContent id={2} className="onboarding-panel" data-onboarding-step="2">
      <div className="wizard-heading"><h2>Branding</h2><p>Add the organization’s logo and colours. These appear after its users sign in.</p></div>
      <div className="branding-wizard-grid">
        <Field className="logo-field"><FieldLabel>Organization logo <small>Optional</small></FieldLabel><label className="logo-dropzone"><input type="file" accept={ORGANIZATION_LOGO_ACCEPT} onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)} /><span className="logo-preview">{logoPreview ? <img src={logoPreview} alt="Organization logo preview" /> : <Icon name="building" size={26} />}</span><span><strong>{logo ? logo.name : "Choose a logo"}</strong><small>PNG, JPEG or WebP · maximum 2 MB</small></span></label>{logoMessage && <Alert variant="destructive"><AlertDescription>{logoMessage}</AlertDescription></Alert>}</Field>
        <div className="brand-colour-grid"><label>Primary colour<span className="brand-colour-input"><input name="primaryColor" type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())} /><span>{primaryColor}</span></span></label><label>Secondary colour<span className="brand-colour-input"><input name="secondaryColor" type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value.toUpperCase())} /><span>{secondaryColor}</span></span></label></div>
      </div>
    </TabsContent>
    </Tabs>

    {message && <Alert variant="destructive" className="onboarding-error"><AlertDescription>{message}</AlertDescription></Alert>}
    <footer className="form-footer wizard-footer"><div>{onCancel ? <Button variant="outline" type="button" onPress={onCancel}>Cancel</Button> : <Link className={buttonVariants({ variant: "outline" })} to="/admin/organizations">Cancel</Link>}</div><div>{step > 0 && <Button variant="outline" type="button" onPress={() => setStep((step - 1) as Step)}>Back</Button>}{step < 2 ? <Button key="continue" type="button" onPress={moveNext}>Continue</Button> : <Button key="submit" type="submit" isDisabled={busy}>{busy ? "Creating…" : "Create organization"}</Button>}</div></footer>
  </form>;
}

export function AdminCreateOrganizationPage() {
  return <><div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>New organization</span></div><PageHeader title="Add organization" /><section className="surface"><OrganizationOnboardingForm /></section></>;
}
