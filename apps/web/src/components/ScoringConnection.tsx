import type { OrganizationDetails, ScoringOrganizationInfo } from "@niq/application-contracts";
import { RefreshCw, Unplug } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { activateScoring, ApiRequestError, disconnectScoring, getScoringOrganizationInfo } from "../lib/api";

type ScoringConnection = OrganizationDetails["scoringConnection"];
const modeLabels = { NIQ_HOSTED: "NIQ hosted", CLIENT_CLOUD: "Client cloud", ON_PREMISES: "On-premises" } as const;
const limitLabel = (used: number, limit: number | null) => `${used.toLocaleString()} / ${limit == null ? "Unlimited" : limit.toLocaleString()}`;

export function ScoringConnectionPanel({ organizationId, connection, onActivated, onDisconnected, className = "surface admin-detail-card admin-detail-wide", showHeading = true }: {
  organizationId: string;
  connection: ScoringConnection;
  onActivated: (connection: NonNullable<ScoringConnection>) => void;
  onDisconnected: () => void;
  className?: string;
  showHeading?: boolean;
}) {
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [information, setInformation] = useState<ScoringOrganizationInfo | null>(null);
  const [informationState, setInformationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadInformation = useCallback(async () => {
    if (!connection) return;
    setInformationState("loading");
    setMessage(null);
    try {
      setInformation(await getScoringOrganizationInfo(organizationId));
      setInformationState("ready");
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "NIQ Scoring information could not be loaded.");
      if (error instanceof ApiRequestError && error.response.error.code === "INVALID_OR_EXPIRED_TOKEN") setReconnectRequired(true);
      setInformationState("error");
    }
  }, [connection, organizationId]);

  useEffect(() => {
    if (connection) void loadInformation();
    else { setInformation(null); setInformationState("idle"); }
  }, [connection, loadInformation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivating(true);
    setMessage(null);
    const form = event.currentTarget;
    const activationToken = String(new FormData(form).get("activationToken"));
    try {
      const result = await activateScoring(organizationId, { activationToken });
      form.reset();
      setMessage(null);
      setReconnectRequired(false);
      onActivated(result);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The scoring connection could not be activated.");
    } finally {
      setActivating(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setMessage(null);
    try {
      await disconnectScoring(organizationId);
      setInformation(null);
      setInformationState("idle");
      setReconnectRequired(false);
      setConfirmingDisconnect(false);
      onDisconnected();
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The scoring connection could not be removed.");
      setConfirmingDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  }

  return <section className={className}>
    {showHeading && <div className="section-heading"><div><h2>Scoring connection</h2></div></div>}
    {connection && !reconnectRequired ? <>
      <div className="connection-summary"><span className="health-ok" /><div><strong>Connected</strong><small>Activated {connection.activatedAt.toLocaleString()}</small></div><Button className="ml-auto" variant="outline" size="sm" onPress={() => setConfirmingDisconnect(true)}><Unplug aria-hidden="true" />Disconnect</Button></div>
      {informationState === "loading" && <p className="muted scoring-information-message" role="status">Loading current NIQ Scoring information…</p>}
      {informationState === "error" && <Alert variant="destructive" className="scoring-information-message"><AlertDescription>{message}</AlertDescription><Button variant="outline" size="sm" aria-label="Retry NIQ Scoring information" onPress={loadInformation}><RefreshCw aria-hidden="true" />Retry</Button></Alert>}
      {informationState === "ready" && information && <div className="scoring-information-grid">
        <section className="branding-card"><h3>Deployment</h3><dl className="stacked-definition"><div><dt>Mode</dt><dd>{modeLabels[information.deployment.mode]}</dd></div><div><dt>Environment</dt><dd>{information.deployment.environment}</dd></div><div><dt>Status</dt><dd>{information.deployment.status === "ACTIVE" ? "Active" : "Disabled"}</dd></div></dl></section>
        <section className="branding-card"><h3>Services</h3><dl className="stacked-definition"><div><dt>Scoring</dt><dd>{information.services.scoring.enabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Face scan</dt><dd>{information.services.faceScan.enabled ? "Enabled" : "Disabled"}</dd></div></dl></section>
        <section className="branding-card scoring-usage-card"><h3>Current usage</h3><p className="muted">UTC month {information.usage.period}</p><dl className="definition-grid"><div><dt>Scores</dt><dd>{limitLabel(information.usage.scores, information.limits.scoresPerMonth)}</dd></div><div><dt>Face scans</dt><dd>{limitLabel(information.usage.faceScans, information.limits.faceScansPerMonth)}</dd></div></dl>{information.updatedAt && <small className="scoring-updated-at">Updated {new Date(information.updatedAt).toLocaleString()}</small>}</section>
      </div>}
    </> : <>
      {reconnectRequired ? <Alert><AlertTitle>Reconnect required</AlertTitle><AlertDescription>The saved service credential is no longer valid. Enter a new one-time activation token from NIQ Scoring.</AlertDescription></Alert> : <p className="muted scoring-token-intro">Enter the one-time activation token supplied from NIQ Scoring.</p>}
      <form className="activation-form" onSubmit={submit}>
        <Field><FieldLabel htmlFor="activationToken">Activation token</FieldLabel><Input id="activationToken" name="activationToken" type="password" minLength={48} maxLength={256} autoComplete="off" required /><FieldDescription>The token is exchanged securely and is not saved in this browser.</FieldDescription></Field>
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        <Button type="submit" isDisabled={activating}>{activating ? "Connecting…" : "Connect scoring"}</Button>
      </form>
    </>}
    <AlertDialog ariaLabel="Disconnect NIQ Scoring" isOpen={confirmingDisconnect} onOpenChange={(open) => { if (!disconnecting) setConfirmingDisconnect(open); }} isDismissable={!disconnecting}>
      <AlertDialogHeader><AlertDialogMedia><Unplug /></AlertDialogMedia><AlertDialogTitle>Disconnect NIQ Scoring?</AlertDialogTitle><AlertDialogDescription>The saved service credential will be permanently removed from this application. The organization’s setup in NIQ Scoring will not be changed.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel isDisabled={disconnecting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" isDisabled={disconnecting} onPress={disconnect}>{disconnecting ? "Disconnecting…" : "Disconnect"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>
  </section>;
}
