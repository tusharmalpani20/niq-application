import { hasPermission } from "@niq/application-contracts";
import type { AuthenticatedUser, OrganizationDetails } from "@niq/application-contracts";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { ScoringConnectionPanel } from "../components/ScoringConnection";
import { ErrorState, LoadingState, PageHeader } from "../components/Page";
import { getOrganization } from "../lib/api";

export function ScoringConnectionPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(() => {
    setState("loading");
    getOrganization(user.organizationId).then((value) => { setDetails(value); setState("ready"); }).catch(() => setState("error"));
  }, [user.organizationId]);
  useEffect(() => { load(); }, [load]);

  if (!hasPermission(user.role, "scoring.manage")) return <Navigate replace to="/" />;
  if (state === "loading") return <section className="surface"><LoadingState label="Loading scoring connection" /></section>;
  if (state === "error" || !details) return <ErrorState retry={load} />;
  return <><PageHeader title="Scoring connection" /><ScoringConnectionPanel organizationId={user.organizationId} connection={details.scoringConnection} onActivated={(connection) => setDetails({ ...details, scoringConnection: connection })} onDisconnected={() => setDetails({ ...details, scoringConnection: null })} className="surface admin-detail-card" showHeading={false} /></>;
}
