import type { OrganizationDetails } from "@niq/application-contracts";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { activateScoring, ApiRequestError } from "../lib/api";

type ScoringConnection = OrganizationDetails["scoringConnection"];

export function ScoringConnectionPanel({ organizationId, connection, onActivated, className = "surface admin-detail-card admin-detail-wide", showHeading = true }: {
  organizationId: string;
  connection: ScoringConnection;
  onActivated: (connection: NonNullable<ScoringConnection>) => void;
  className?: string;
  showHeading?: boolean;
}) {
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivating(true);
    setMessage(null);
    const form = event.currentTarget;
    const activationToken = String(new FormData(form).get("activationToken"));
    try {
      const result = await activateScoring(organizationId, { activationToken });
      form.reset();
      onActivated(result);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "The scoring connection could not be activated.");
    } finally {
      setActivating(false);
    }
  }

  return <section className={className}>
    {showHeading && <div className="section-heading"><div><h2>Scoring connection</h2></div></div>}
    {connection ? <div className="connection-summary"><span className="health-ok" /><div><strong>Connected</strong><small>Activated {connection.activatedAt.toLocaleString()}</small></div></div> : <>
      <Alert><AlertTitle>Not connected</AlertTitle><AlertDescription>Enter the one-time activation token supplied from NIQ Scoring.</AlertDescription></Alert>
      <form className="activation-form" onSubmit={submit}>
        <Field><FieldLabel htmlFor="activationToken">Activation token</FieldLabel><Input id="activationToken" name="activationToken" type="password" minLength={48} maxLength={256} autoComplete="off" required /><FieldDescription>The token is exchanged securely and is not saved in this browser.</FieldDescription></Field>
        {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
        <Button type="submit" isDisabled={activating}>{activating ? "Connecting…" : "Connect scoring"}</Button>
      </form>
    </>}
  </section>;
}
