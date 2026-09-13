import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import type { OnboardOrganizationResponse } from "@niq/application-contracts";
import { ApiRequestError, onboardOrganization } from "../lib/api";
import { PageHeader } from "../components/Page";
import { Icon } from "../lib/icons";

type LimitName = "userLimit" | "scoringMonthlyLimit" | "faceScanMonthlyLimit";
const limitFields: Array<{ name: LimitName; label: string; help: string }> = [
  { name: "userLimit", label: "Users", help: "Active users plus pending invitations" },
  { name: "scoringMonthlyLimit", label: "Scores per month", help: "Completed scoring requests" },
  { name: "faceScanMonthlyLimit", label: "Face scans per month", help: "Face-scan requests" },
];

export function AdminCreateOrganizationPage() {
  const [unlimited, setUnlimited] = useState<Record<LimitName, boolean>>({ userLimit: true, scoringMonthlyLimit: true, faceScanMonthlyLimit: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<OnboardOrganizationResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const limit = (name: LimitName) => unlimited[name] ? null : Number(data.get(name));
    try {
      const result = await onboardOrganization({
        legalName: String(data.get("legalName")),
        displayName: String(data.get("displayName")),
        slug: String(data.get("slug")),
        firstAdminEmail: String(data.get("firstAdminEmail")),
        deploymentMode: String(data.get("deploymentMode")) as "NIQ_HOSTED" | "CLIENT_CLOUD" | "ON_PREM",
        primaryColor: String(data.get("primaryColor")),
        secondaryColor: String(data.get("secondaryColor")),
        scoringEnabled: data.get("scoringEnabled") === "on",
        faceScanEnabled: data.get("faceScanEnabled") === "on",
        userLimit: limit("userLimit"),
        scoringMonthlyLimit: limit("scoringMonthlyLimit"),
        faceScanMonthlyLimit: limit("faceScanMonthlyLimit"),
      });
      setCreated(result);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The organization could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const invitationUrl = created.activationToken ? `${window.location.origin}/invite/${created.activationToken}` : null;
    return <>
      <PageHeader eyebrow="Client onboarding" title="Organization created" description={`${created.organization.displayName} is ready for its first administrator.`} />
      <section className="surface onboarding-success"><div className="success-icon"><Icon name="check" /></div><div><h2>Client foundation created</h2><p>The organization, usage limits and administrator invitation were saved together.</p></div>
        {invitationUrl ? <label>Local invitation link<textarea readOnly value={invitationUrl} /><span className="field-help">Visible only in development. Production delivery will use the configured notification provider.</span></label> : <div className="notice notice-info"><div><strong>Invitation created</strong><span>The delivery provider will send the activation link to {created.invitation.email}.</span></div></div>}
        <div className="form-actions"><Link className="btn btn-outline" to="/admin/organizations">All organizations</Link><Link className="btn btn-primary" to={`/admin/organizations/${created.organization.id}`}>Manage organization</Link></div>
      </section>
    </>;
  }

  return <>
    <div className="breadcrumb"><Link to="/admin/organizations">Organizations</Link><span>/</span><span>New organization</span></div>
    <PageHeader eyebrow="Client onboarding" title="Add organization" description="Create the client boundary, limits and first administrator invitation in one step." />
    <form className="surface admin-onboarding-form" onSubmit={submit}>
      <section className="admin-form-section"><div><span className="form-step">1</span><h2>Organization</h2><p>The tenant identity shown throughout the platform.</p></div><div className="field-grid"><label>Legal name<input name="legalName" required minLength={2} /></label><label>Display name<input name="displayName" required minLength={2} /></label><label>Unique slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="apollo-hospitals" /></label><label>First administrator email<input name="firstAdminEmail" type="email" required /></label></div></section>
      <section className="admin-form-section"><div><span className="form-step">2</span><h2>Deployment</h2><p>Where the clinical application will run.</p></div><div className="form-fields"><label>Deployment type<select name="deploymentMode" defaultValue="NIQ_HOSTED"><option value="NIQ_HOSTED">NIQ hosted</option><option value="CLIENT_CLOUD">Client cloud</option><option value="ON_PREM">On-premises</option></select></label><div className="toggle-grid"><label className="checkbox-control"><input name="scoringEnabled" type="checkbox" defaultChecked /><span><strong>Scoring enabled</strong><small>Allow this organization to request scores</small></span></label><label className="checkbox-control"><input name="faceScanEnabled" type="checkbox" defaultChecked /><span><strong>Face scan enabled</strong><small>Allow automated face-scan requests</small></span></label></div></div></section>
      <section className="admin-form-section"><div><span className="form-step">3</span><h2>Usage limits</h2><p>Unlimited is the default and remains a valid setting.</p></div><div className="limit-grid">{limitFields.map((field) => <div className="limit-control" key={field.name}><label>{field.label}<input name={field.name} type="number" min="1" defaultValue="100" disabled={unlimited[field.name]} required={!unlimited[field.name]} /></label><label className="inline-check"><input type="checkbox" checked={unlimited[field.name]} onChange={(event) => setUnlimited((current) => ({ ...current, [field.name]: event.target.checked }))} />Unlimited</label><small>{field.help}</small></div>)}</div></section>
      <section className="admin-form-section"><div><span className="form-step">4</span><h2>Branding</h2><p>Applied after the client user signs in.</p></div><div className="field-grid"><label>Primary colour<input name="primaryColor" type="color" defaultValue="#175CD3" /></label><label>Secondary colour<input name="secondaryColor" type="color" defaultValue="#0E9384" /></label></div></section>
      {message && <p className="error-message" role="alert">{message}</p>}
      <footer className="form-footer"><Link className="btn btn-outline" to="/admin/organizations">Cancel</Link><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create organization and invite admin"}</button></footer>
    </form>
  </>;
}
