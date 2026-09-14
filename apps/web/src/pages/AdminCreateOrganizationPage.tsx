import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OnboardOrganizationResponse } from "@niq/application-contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError, onboardOrganization } from "../lib/api";
import { PageHeader } from "../components/Page";
import { Icon } from "../lib/icons";
import { ORGANIZATION_LOGO_ACCEPT, organizationLogoError, organizationLogoPayload, organizationUrlName } from "../lib/organization-onboarding";

type Step = 0 | 1 | 2;

const steps = ["Organization", "First administrator", "Branding"] as const;

type FormProps = { onCancel?: () => void; onCreated?: () => void; onDirtyChange?: (dirty: boolean) => void };

export function OrganizationOnboardingForm({ onCancel, onCreated, onDirtyChange }: FormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [furthestStep, setFurthestStep] = useState<Step>(0);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [firstAdminEmail, setFirstAdminEmail] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#175CD3");
  const [secondaryColor, setSecondaryColor] = useState("#0E9384");
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
    try {
      const result = await onboardOrganization({
        legalName: displayName, displayName, slug,
        firstAdminEmail,
        deploymentMode: "NIQ_HOSTED",
        primaryColor, secondaryColor,
        scoringEnabled: true, faceScanEnabled: true,
        userLimit: null, scoringMonthlyLimit: null, faceScanMonthlyLimit: null,
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
    return <section className="onboarding-success"><div className="success-icon"><Icon name="check" /></div><div><h2>{created.organization.displayName} created</h2><p>The organization and its first administrator invitation were created.</p></div>
      {invitationUrl ? <Field><FieldLabel>Local invitation link</FieldLabel><Textarea readOnly value={invitationUrl} /><FieldDescription>Visible only in development. Production delivery will use the configured notification provider.</FieldDescription></Field> : <Alert><AlertDescription>The delivery provider will send the activation link to {created.invitation.email}.</AlertDescription></Alert>}
      <div className="form-actions">{onCancel ? <Button variant="outline" type="button" onPress={onCancel}>Close</Button> : <Link className={buttonVariants({ variant: "outline" })} to="/admin/organizations">All organizations</Link>}<Link className={buttonVariants()} to={`/admin/organizations/${created.organization.id}`}>Manage organization</Link></div>
    </section>;
  }

  return <form ref={formRef} className="admin-onboarding-form onboarding-wizard" onSubmit={submit} onChange={markDirty}>
    <Tabs selectedKey={step} onSelectionChange={(key) => setStep(Number(key) as Step)} className="min-h-0 min-w-0 flex-1 gap-0">
    <TabsList variant="line" className="onboarding-tabs h-auto w-full min-w-0 rounded-none bg-background" aria-label="Organization setup steps">{steps.map((label, index) => {
      const isComplete = index < furthestStep;
      return <TabsTrigger id={index} key={label} isDisabled={index > furthestStep} data-complete={isComplete || undefined} className="h-11 min-w-0 gap-2 overflow-hidden rounded-none px-3 shadow-none"><span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs">{isComplete ? <Icon name="check" size={14} /> : index + 1}</span><strong className="truncate">{label}</strong></TabsTrigger>;
    })}</TabsList>

    <TabsContent id={0} className="onboarding-panel" data-onboarding-step="0">
      <div className="wizard-heading"><h2>Organization details</h2></div>
      <FieldGroup className="field-grid"><Field><FieldLabel htmlFor="displayName">Display name</FieldLabel><Input id="displayName" name="displayName" required minLength={2} value={displayName} placeholder="Example Health Network" onChange={(event) => { const value = event.target.value; setDisplayName(value); setSlug(organizationUrlName(value)); }} /></Field><Field><FieldLabel htmlFor="slug">URL name</FieldLabel><Input id="slug" name="slug" required readOnly value={slug} placeholder="example-health" /><FieldDescription>Generated from the display name.</FieldDescription></Field></FieldGroup>
    </TabsContent>

    <TabsContent id={1} className="onboarding-panel" data-onboarding-step="1">
      <div className="wizard-heading"><h2>First administrator</h2></div>
      <FieldGroup><Field><FieldLabel htmlFor="firstAdminEmail">Email address</FieldLabel><Input id="firstAdminEmail" name="firstAdminEmail" type="email" required value={firstAdminEmail} placeholder="admin@example-health.test" autoComplete="email" onChange={(event) => setFirstAdminEmail(event.target.value)} /><FieldDescription>We’ll create an invitation for this organization’s first administrator.</FieldDescription></Field></FieldGroup>
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
