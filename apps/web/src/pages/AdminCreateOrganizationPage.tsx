import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_ORGANIZATION_BRANDING, type OnboardOrganizationResponse } from "@niq/application-contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError, onboardOrganization } from "../lib/api";
import { PageHeader } from "../components/Page";
import { Icon } from "../lib/icons";
import { ORGANIZATION_LOGO_ACCEPT, organizationLogoError, organizationLogoPayload, organizationUrlName } from "../lib/organization-onboarding";
import { CheckCircle2, CircleAlert } from "lucide-react";

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
  const [userLimit, setUserLimit] = useState("");
  const [unlimitedUsers, setUnlimitedUsers] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [firstAdminEmail, setFirstAdminEmail] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_ORGANIZATION_BRANDING.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState<string>(DEFAULT_ORGANIZATION_BRANDING.secondaryColor);
  const [patientReferencePrefix, setPatientReferencePrefix] = useState("PAT");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"name" | "email" | null>(null);
  const [created, setCreated] = useState<OnboardOrganizationResponse | null>(null);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  function markDirty() { setMessage(null); setErrorField(null); onDirtyChange?.(true); }

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
    setErrorField(null);
    try {
      const result = await onboardOrganization({
        legalName: displayName, displayName, slug,
        firstAdminEmail,
        primaryColor, secondaryColor, patientReferencePrefix,
        userLimit: unlimitedUsers ? null : Number(userLimit),
        logo: await organizationLogoPayload(logo),
      });
      setCreated(result);
      onDirtyChange?.(false);
      onCreated?.();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const field = error.response.error.details?.field;
        if (field === "name") { setErrorField("name"); setStep(0); }
        if (field === "email") { setErrorField("email"); setStep(1); }
      }
      setMessage(error instanceof ApiRequestError || error instanceof Error ? error.message : "The organization could not be created. Please try again.");
    } finally { setBusy(false); }
  }

  if (created) {
    const invitationUrl = created.activationToken ? `${window.location.origin}/invite/${created.activationToken}` : null;
    return <section className="onboarding-success"><div><h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />Organization created</h2><p>{created.organization.displayName} and its first administrator invitation were created.</p></div>
      {invitationUrl ? <Field><FieldLabel>Invitation link</FieldLabel><Textarea aria-label="Invitation link" readOnly value={invitationUrl} /><FieldDescription>Share this link with {created.invitation.email}.</FieldDescription><Button type="button" variant="outline" onPress={async () => { try { await navigator.clipboard.writeText(invitationUrl); setLinkCopied(true); } catch { setMessage("Could not copy the link. Select and copy it above."); } }}>{linkCopied ? "Copied" : "Copy link"}</Button></Field> : <Alert><AlertDescription>An invitation was created for {created.invitation.email}.</AlertDescription></Alert>}
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
      <div className="form-actions onboarding-success-actions">{onCancel ? <Button variant="outline" type="button" onPress={onCancel}>Close</Button> : <Link className={buttonVariants({ variant: "outline" })} to="/admin/organizations">All organizations</Link>}<Link className={buttonVariants()} to={`/admin/organizations/${created.organization.slug}`}>Manage organization</Link></div>
    </section>;
  }

  return <form ref={formRef} className="admin-onboarding-form onboarding-wizard" onSubmit={submit} onChange={markDirty}>
    <Tabs selectedKey={step} onSelectionChange={(key) => setStep(Number(key) as Step)} className="min-h-0 min-w-0 flex-1 gap-0">
    <TabsList variant="line" className="onboarding-tabs h-auto w-full min-w-0 rounded-none bg-background" aria-label="Organization setup steps">{steps.map((label, index) => {
      const isComplete = index < furthestStep;
      return <TabsTrigger id={index} key={label} isDisabled={index > furthestStep} data-complete={isComplete || undefined} className="h-11 min-w-0 gap-2 overflow-hidden rounded-none px-3 shadow-none"><span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs">{isComplete ? <Icon name="check" size={14} /> : index + 1}</span><strong className="truncate">{label}</strong></TabsTrigger>;
    })}</TabsList>

    <TabsContent id={0} className="onboarding-panel" data-onboarding-step="0">
      <FieldGroup className="field-grid"><Field><FieldLabel className="min-h-5" htmlFor="displayName">Name</FieldLabel><Input id="displayName" name="displayName" required minLength={2} value={displayName} placeholder="Example Health Network" aria-invalid={errorField === "name"} onChange={(event) => { const value = event.target.value; setDisplayName(value); setSlug(organizationUrlName(value)); }} />{errorField === "name" && message && <FieldError>{message}</FieldError>}</Field><Field><FieldLabel className="min-h-5" htmlFor="slug">URL name</FieldLabel><Input id="slug" name="slug" required readOnly value={slug} placeholder="example-health" /><FieldDescription>Generated automatically from the organization name.</FieldDescription></Field><Field><FieldLabel className="min-h-5" htmlFor="patientReferencePrefix">Patient prefix</FieldLabel><Input id="patientReferencePrefix" name="patientReferencePrefix" required minLength={2} maxLength={12} pattern="[A-Za-z][A-Za-z0-9]{1,11}" value={patientReferencePrefix} onChange={(event) => setPatientReferencePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} /><FieldDescription>Example: {patientReferencePrefix || "PREFIX"}-1</FieldDescription></Field><Field>
        <div className="flex min-h-5 items-center justify-between gap-4">
          <FieldLabel className="min-h-5" htmlFor="userLimit">User limit</FieldLabel>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Unlimited</span><Switch aria-label="Unlimited users" isSelected={unlimitedUsers} onChange={(value) => { setUnlimitedUsers(value); markDirty(); }} /></div>
        </div>
        <Input id="userLimit" name="userLimit" type={unlimitedUsers ? "text" : "number"} inputMode={unlimitedUsers ? undefined : "numeric"} disabled={unlimitedUsers} required={!unlimitedUsers} min={1} step={1} value={unlimitedUsers ? "Unlimited" : userLimit} placeholder={unlimitedUsers ? undefined : "Enter a user limit"} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setUserLimit(event.target.value); }} />
        <FieldDescription>{unlimitedUsers ? "No limit on organization users." : "Maximum number of organization users."}</FieldDescription>
      </Field></FieldGroup>
    </TabsContent>

    <TabsContent id={1} className="onboarding-panel" data-onboarding-step="1">
      <FieldGroup><Field><FieldLabel htmlFor="firstAdminEmail">Email</FieldLabel><Input id="firstAdminEmail" name="firstAdminEmail" type="email" required value={firstAdminEmail} placeholder="admin@example-health.test" autoComplete="email" aria-invalid={errorField === "email"} onChange={(event) => setFirstAdminEmail(event.target.value)} />{errorField === "email" && message && <FieldError>{message}</FieldError>}<FieldDescription>This person will be invited to manage the organization and its users.</FieldDescription></Field></FieldGroup>
    </TabsContent>

    <TabsContent id={2} className="onboarding-panel" data-onboarding-step="2">
      <p className="mb-5 text-sm text-muted-foreground">Branding is optional. Keep the defaults or add your own logo and colours.</p>
      <div className="branding-wizard-grid brand-customization-grid">
        <Field className="logo-field branding-card"><FieldLabel>Logo <small>Optional</small></FieldLabel><label className="logo-dropzone"><input type="file" accept={ORGANIZATION_LOGO_ACCEPT} onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)} /><span className="logo-preview">{logoPreview ? <img src={logoPreview} alt="Organization logo preview" /> : <Icon name="building" size={26} />}</span><span><strong>{logo ? logo.name : "Upload a logo"}</strong><small>PNG, JPEG or WebP · maximum 2 MB</small></span></label>{logoMessage && <Alert variant="destructive"><AlertDescription>{logoMessage}</AlertDescription></Alert>}</Field>
        <div className="brand-colour-panel branding-card"><span className="branding-card-title">Brand colours</span><div className="brand-colour-grid"><label>Primary<span className="brand-colour-input"><input name="primaryColor" type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())} /><span>{primaryColor}</span></span></label><label>Secondary<span className="brand-colour-input"><input name="secondaryColor" type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value.toUpperCase())} /><span>{secondaryColor}</span></span></label></div></div>
      </div>
    </TabsContent>
    </Tabs>

    {message && !errorField && <Alert variant="destructive" className="onboarding-error"><CircleAlert aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
    <footer className="form-footer wizard-footer"><div>{onCancel ? <Button variant="outline" type="button" onPress={onCancel}>Cancel</Button> : <Link className={buttonVariants({ variant: "outline" })} to="/admin/organizations">Cancel</Link>}</div><div>{step > 0 && <Button variant="outline" type="button" onPress={() => setStep((step - 1) as Step)}>Back</Button>}{step < 2 ? <Button key="continue" type="button" onPress={moveNext}>Continue</Button> : <Button key="submit" type="submit" isDisabled={busy}>{busy ? "Creating…" : "Create organization"}</Button>}</div></footer>
  </form>;
}

export function AdminCreateOrganizationPage() {
  return <><div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>New organization</span></div><PageHeader title="Add organization" /><section className="surface"><OrganizationOnboardingForm /></section></>;
}
