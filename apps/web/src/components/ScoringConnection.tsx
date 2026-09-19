import type { ApiError, OrganizationDetails, ScoringOrganizationInfo } from "@niq/application-contracts";
import { Activity, AlertCircle, Eye, EyeOff, Gauge, RefreshCw, ScanFace, Server, Unplug } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { DateDisplay } from "./DateDisplay";
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

function ServiceCard({ label, used, limit, enabled, icon }: { label: string; used: number; limit: number | null; enabled: boolean; icon: ReactNode }) {
  const percentage = limit == null || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
  return <section className="rounded-xl border bg-card p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><span className="text-primary">{icon}</span>{label}</h3><span className={enabled ? "rounded-full bg-success-soft px-2 py-1 text-xs font-medium text-success" : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{enabled ? "Enabled" : "Disabled"}</span></div>
    <p className="mt-5 flex items-baseline gap-2"><strong className="text-3xl">{used.toLocaleString()}</strong><span className="text-sm text-muted-foreground">used this month</span></p>
    {limit == null ? <p className="mt-2 text-sm text-muted-foreground">Unlimited</p> : <><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${label} monthly usage`} aria-valuemin={0} aria-valuemax={limit || 1} aria-valuenow={Math.min(used, limit)} aria-valuetext={`${used} used of ${limit}`}><div className="h-full bg-primary" style={{ width: `${percentage}%` }} /></div><p className="mt-2 text-sm text-muted-foreground">{Math.max(limit - used, 0).toLocaleString()} of {limit.toLocaleString()} remaining</p></>}
  </section>;
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
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
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
      setRefreshedAt(new Date());
      setReconnectRequired(false);
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
      <div className="connection-summary"><span className="connection-summary-icon"><Activity aria-hidden="true" /></span><div><strong>{informationState === "error" ? "NIQ Scoring connection needs attention" : "NIQ Scoring connected"}</strong><small>Connected <DateDisplay value={connection.activatedAt} /></small></div><Button className="ml-auto" variant="outline" size="sm" onPress={() => setConfirmingDisconnect(true)}><Unplug aria-hidden="true" />Disconnect</Button></div>
      {informationState === "loading" && <p className="muted scoring-information-message" role="status">Updating scoring information…</p>}
      {informationState === "error" && errorNotice && <Alert variant="destructive" className="scoring-information-message"><AlertCircle aria-hidden="true" /><AlertTitle>{errorNotice.title}</AlertTitle><AlertDescription>{errorNotice.description}</AlertDescription><Button variant="outline" size="sm" aria-label="Retry NIQ Scoring information" onPress={loadInformation}><RefreshCw aria-hidden="true" />Retry</Button></Alert>}
      {information && <div className="mt-4 space-y-4" aria-busy={informationState === "loading"}>
        {informationState === "error" && <p className="text-sm text-warning">Showing the last loaded information. It may be out of date.</p>}
        <section className="rounded-xl border bg-card p-5"><h3 className="flex items-center gap-2 font-semibold"><Server className="size-4 text-primary" aria-hidden="true" />Deployment</h3><dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Hosting</dt><dd className="mt-1 font-medium">{modeLabels[information.deployment.mode]}</dd></div>
          <div><dt className="text-muted-foreground">Environment</dt><dd className="mt-1 capitalize font-medium">{information.deployment.environment}</dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1 font-medium">{information.deployment.status === "ACTIVE" ? "Active" : "Disabled"}</dd></div>
          <div><dt className="text-muted-foreground">Rule version</dt><dd className="mt-1 break-words font-medium">{information.ruleVersion?.version ? information.ruleVersion.mode === "DEFAULT" ? `Default (${information.ruleVersion.version})` : `${information.ruleVersion.version} · Specific version` : "Not available"}</dd></div>
        </dl></section>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Services and usage</h3><p className="text-sm text-muted-foreground">{usageMonth(information.usage.period)} · UTC</p></div><div className="flex items-center gap-2">{refreshedAt && <span className="text-xs text-muted-foreground">Last loaded <DateDisplay value={refreshedAt} /></span>}<Button variant="outline" size="sm" isDisabled={informationState === "loading"} onPress={loadInformation}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><ServiceCard label="Scoring" used={information.usage.scores} limit={information.limits.scoresPerMonth} enabled={information.services.scoring.enabled} icon={<Gauge className="size-4" aria-hidden="true" />} /><ServiceCard label="Face scans" used={information.usage.faceScans} limit={information.limits.faceScansPerMonth} enabled={information.services.faceScan.enabled} icon={<ScanFace className="size-4" aria-hidden="true" />} /></div>
      </div>}

    </> : <>
      {reconnectRequired && <Alert><AlertTitle>Reconnect required</AlertTitle><AlertDescription>This connection is no longer valid. Enter a new activation token from NIQ Scoring to reconnect.</AlertDescription></Alert>}
      <form className="activation-form" onSubmit={submit}>
        <Field><FieldLabel htmlFor="activationToken">Activation token</FieldLabel><div className="activation-token-controls"><InputGroup className="h-11 overflow-hidden"><InputGroupInput id="activationToken" name="activationToken" type={showToken ? "text" : "password"} minLength={48} maxLength={256} autoComplete="off" required /><InputGroupAddon align="inline-end" className="mr-0! self-stretch border-l bg-accent p-0"><InputGroupButton className="m-0! h-full w-11 rounded-none border-0 bg-clip-border text-primary hover:bg-primary/15" aria-label={showToken ? "Hide activation token" : "Show activation token"} aria-controls="activationToken" aria-pressed={showToken} onPress={() => setShowToken((visible) => !visible)} size="icon-sm">{showToken ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup><Button type="submit" className="h-11" isDisabled={activating}>{activating ? "Connecting…" : "Connect"}</Button></div></Field>
        {errorNotice && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{errorNotice.title}</AlertTitle><AlertDescription>{errorNotice.description}</AlertDescription></Alert>}
      </form>
    </>}
    <AlertDialog ariaLabel="Disconnect NIQ Scoring" isOpen={confirmingDisconnect} onOpenChange={(open) => { if (!disconnecting) setConfirmingDisconnect(open); }} isDismissable={!disconnecting}>
      <AlertDialogHeader><AlertDialogMedia><Unplug /></AlertDialogMedia><AlertDialogTitle>Disconnect NIQ Scoring?</AlertDialogTitle><AlertDialogDescription>This application will no longer be connected to NIQ Scoring. You will need a new activation token to reconnect. The deployment in NIQ Scoring will remain unchanged.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel isDisabled={disconnecting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" isDisabled={disconnecting} onPress={disconnect}>{disconnecting ? "Disconnecting…" : "Disconnect"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>
  </section>;
}
