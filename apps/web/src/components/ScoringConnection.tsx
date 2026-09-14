import type { ApiError, OrganizationDetails, ScoringOrganizationInfo } from "@niq/application-contracts";
import { Activity, AlertCircle, Eye, EyeOff, Gauge, RefreshCw, ScanFace, Server, Unplug } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { activateScoring, ApiRequestError, disconnectScoring, getScoringOrganizationInfo } from "../lib/api";

type ScoringConnection = OrganizationDetails["scoringConnection"];
const modeLabels = { NIQ_HOSTED: "NIQ hosted", CLIENT_CLOUD: "Client cloud", ON_PREMISES: "On-premises" } as const;
type ErrorNotice = { title: string; description: string };
const scoringErrorNotices: Partial<Record<ApiError["error"]["code"], ErrorNotice>> = {
  SCORING_NOT_CONFIGURED: { title: "NIQ Scoring isn’t configured", description: "Complete the NIQ Scoring server configuration before connecting an organization." },
  SCORING_UNAVAILABLE: { title: "NIQ Scoring is unavailable", description: "The scoring service could not complete this request. Please try again." },
  INVALID_OR_EXPIRED_TOKEN: { title: "Connection credentials rejected", description: "The activation token or saved connection is invalid or has expired." },
};
function scoringErrorNotice(error: unknown, fallback: ErrorNotice): ErrorNotice {
  return error instanceof ApiRequestError ? scoringErrorNotices[error.response.error.code] ?? fallback : fallback;
}

function usageMonth(period: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
}

function UsageMetric({ label, used, limit, icon }: { label: string; used: number; limit: number | null; icon: ReactNode }) {
  const remaining = limit == null ? 0 : Math.max(limit - used, 0);
  const percentage = limit == null || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
  return <div className="scoring-usage-metric">
    <div className="scoring-usage-title"><span className="scoring-section-icon">{icon}</span><span>{label}</span></div>
    <p><strong>{used.toLocaleString()}</strong><span>used this month</span></p>
    {limit == null
      ? <small>No monthly limit</small>
      : <><div className="scoring-usage-track" role="progressbar" aria-label={`${label} monthly usage`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}><span style={{ width: `${percentage}%` }} /></div><small>{remaining.toLocaleString()} of {limit.toLocaleString()} remaining</small></>}
  </div>;
}

export function ScoringConnectionPanel({ organizationId, connection, onActivated, onDisconnected, className = "surface admin-detail-card admin-detail-wide", showHeading = true }: {
  organizationId: string;
  connection: ScoringConnection;
  onActivated: (connection: NonNullable<ScoringConnection>) => void;
  onDisconnected: () => void;
  className?: string;
  showHeading?: boolean;
}) {
  const [activating, setActivating] = useState(false);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [information, setInformation] = useState<ScoringOrganizationInfo | null>(null);
  const [informationState, setInformationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const loadInformation = useCallback(async () => {
    if (!connection) return;
    setInformationState("loading");
    setErrorNotice(null);
    try {
      setInformation(await getScoringOrganizationInfo(organizationId));
      setInformationState("ready");
    } catch (error) {
      setErrorNotice(scoringErrorNotice(error, { title: "Unable to load NIQ Scoring", description: "Current scoring information could not be loaded. Please try again." }));
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
    setErrorNotice(null);
    const form = event.currentTarget;
    const activationToken = String(new FormData(form).get("activationToken"));
    try {
      const result = await activateScoring(organizationId, { activationToken });
      form.reset();
      setErrorNotice(null);
      setReconnectRequired(false);
      onActivated(result);
    } catch (error) {
      setErrorNotice(scoringErrorNotice(error, { title: "Connection failed", description: "The scoring connection could not be activated. Please try again." }));
    } finally {
      setActivating(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setErrorNotice(null);
    try {
      await disconnectScoring(organizationId);
      setInformation(null);
      setInformationState("idle");
      setReconnectRequired(false);
      setConfirmingDisconnect(false);
      onDisconnected();
    } catch (error) {
      setErrorNotice(scoringErrorNotice(error, { title: "Disconnect failed", description: "The scoring connection could not be removed. Please try again." }));
      setConfirmingDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  }

  return <section className={className}>
    {showHeading && <div className="section-heading"><div><h2>Scoring connection</h2></div></div>}
    {connection && !reconnectRequired ? <>
      <div className="connection-summary"><span className="connection-summary-icon"><Activity aria-hidden="true" /></span><div><strong>NIQ Scoring connected</strong><small>Connected since {connection.activatedAt.toLocaleString()}</small></div><Button className="ml-auto" variant="outline" size="sm" onPress={() => setConfirmingDisconnect(true)}><Unplug aria-hidden="true" />Disconnect</Button></div>
      {informationState === "loading" && <p className="muted scoring-information-message" role="status">Loading current NIQ Scoring information…</p>}
      {informationState === "error" && errorNotice && <Alert variant="destructive" className="scoring-information-message"><AlertCircle aria-hidden="true" /><AlertTitle>{errorNotice.title}</AlertTitle><AlertDescription>{errorNotice.description}</AlertDescription><Button variant="outline" size="sm" aria-label="Retry NIQ Scoring information" onPress={loadInformation}><RefreshCw aria-hidden="true" />Retry</Button></Alert>}
      {informationState === "ready" && information && <div className="scoring-information-grid">
        <section className="scoring-information-card"><h3><span className="scoring-section-icon"><Server aria-hidden="true" /></span>Deployment</h3><dl className="scoring-detail-list"><div><dt>Mode</dt><dd>{modeLabels[information.deployment.mode]}</dd></div><div><dt>Environment</dt><dd className="capitalize">{information.deployment.environment}</dd></div><div><dt>Status</dt><dd><span className="scoring-state" data-enabled={information.deployment.status === "ACTIVE"}>{information.deployment.status === "ACTIVE" ? "Active" : "Disabled"}</span></dd></div></dl></section>
        <section className="scoring-information-card"><h3><span className="scoring-section-icon"><Gauge aria-hidden="true" /></span>Services</h3><dl className="scoring-detail-list"><div><dt>Scoring</dt><dd><span className="scoring-state" data-enabled={information.services.scoring.enabled}>{information.services.scoring.enabled ? "Enabled" : "Disabled"}</span></dd></div><div><dt>Face scan</dt><dd><span className="scoring-state" data-enabled={information.services.faceScan.enabled}>{information.services.faceScan.enabled ? "Enabled" : "Disabled"}</span></dd></div></dl></section>
        <section className="scoring-information-card scoring-usage-card"><div className="scoring-usage-heading"><div><h3>Usage this month</h3><p>{usageMonth(information.usage.period)} · UTC</p></div>{information.updatedAt && <small>Updated {new Date(information.updatedAt).toLocaleString()}</small>}</div><div className="scoring-usage-grid"><UsageMetric label="Scores" used={information.usage.scores} limit={information.limits.scoresPerMonth} icon={<Gauge aria-hidden="true" />} /><UsageMetric label="Face scans" used={information.usage.faceScans} limit={information.limits.faceScansPerMonth} icon={<ScanFace aria-hidden="true" />} /></div></section>
      </div>}
    </> : <>
      {reconnectRequired && <Alert><AlertTitle>Reconnect required</AlertTitle><AlertDescription>The saved service credential is no longer valid. Enter a new one-time activation token from NIQ Scoring.</AlertDescription></Alert>}
      <form className="activation-form" onSubmit={submit}>
        <Field><FieldLabel htmlFor="activationToken">Activation token</FieldLabel><div className="activation-token-controls"><InputGroup className="h-11 overflow-hidden"><InputGroupInput id="activationToken" name="activationToken" type={showToken ? "text" : "password"} minLength={48} maxLength={256} autoComplete="off" required /><InputGroupAddon align="inline-end" className="mr-0! self-stretch border-l bg-accent p-0"><InputGroupButton className="m-0! h-full w-11 rounded-none border-0 bg-clip-border text-primary hover:bg-secondary" aria-label={showToken ? "Hide activation token" : "Show activation token"} aria-controls="activationToken" aria-pressed={showToken} onPress={() => setShowToken((visible) => !visible)} size="icon-sm">{showToken ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup><Button type="submit" className="h-11" isDisabled={activating}>{activating ? "Connecting…" : "Connect"}</Button></div></Field>
        {errorNotice && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{errorNotice.title}</AlertTitle><AlertDescription>{errorNotice.description}</AlertDescription></Alert>}
      </form>
    </>}
    <AlertDialog ariaLabel="Disconnect NIQ Scoring" isOpen={confirmingDisconnect} onOpenChange={(open) => { if (!disconnecting) setConfirmingDisconnect(open); }} isDismissable={!disconnecting}>
      <AlertDialogHeader><AlertDialogMedia><Unplug /></AlertDialogMedia><AlertDialogTitle>Disconnect NIQ Scoring?</AlertDialogTitle><AlertDialogDescription>The saved service credential will be permanently removed from this application. The organization’s setup in NIQ Scoring will not be changed.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel isDisabled={disconnecting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" isDisabled={disconnecting} onPress={disconnect}>{disconnecting ? "Disconnecting…" : "Disconnect"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>
  </section>;
}
