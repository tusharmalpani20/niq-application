import type { AuthenticatedUser, Patient } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Building2, Users, UserRound, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganization, listFacilities, listOrganizationUsers, listPatients } from "../lib/api";

type Overview = { patients: Patient[]; facilityCount: number; enabledUsers: number | null; pendingInvitations: number };

export function DashboardPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const isAdmin = user.role === "ORGANIZATION_ADMIN";
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(false);
    Promise.all([
      listPatients(user.organizationId),
      listFacilities(user.organizationId),
      isAdmin ? listOrganizationUsers(user.organizationId) : Promise.resolve(null),
      isAdmin ? getOrganization(user.organizationId) : Promise.resolve(null),
    ]).then(([patients, facilities, members, organization]) => {
      if (!active) return;
      setData({
        patients,
        facilityCount: facilities.filter((item) => item.status === "ACTIVE").length,
        enabledUsers: members ? members.filter((item) => item.active && item.status === "ACTIVE").length : null,
        pendingInvitations: organization?.invitations.filter((item) => item.status === "PENDING" && item.expiresAt.getTime() > Date.now()).length ?? 0,
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user.organizationId, isAdmin, attempt]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthly = data?.patients.filter((item) => item.createdAt >= monthStart && item.createdAt <= now).length;
  const metrics = [
    { label: "Patients", value: data?.patients.length, detail: "In your accessible facilities", to: "/patients", icon: UserRound },
    { label: "Registered this month", value: monthly, detail: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }), to: "/patients", icon: CalendarDays },
    { label: "Active facilities", value: data?.facilityCount, detail: "Available to your account", to: "/facilities", icon: Building2 },
    ...(isAdmin ? [{ label: "Enabled users", value: data?.enabledUsers, detail: data ? data.pendingInvitations + " pending invitations" : "Organization-wide", to: "/users", icon: Users }] : []),
  ];
  return <>
    <h1 className="patient-page-title">Overview</h1>
    {error ? <Card className="surface p-6"><p role="alert">Overview could not be loaded.</p><Button className="w-fit" variant="outline" onPress={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <section aria-label="Workspace summary" aria-busy={!data} className={isAdmin ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"}>
        {metrics.map(({ label, value, detail, to, icon: MetricIcon }) => <Link key={label} to={to} className="surface grid gap-3 p-5 no-underline transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
          <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><MetricIcon className="size-5 text-primary" aria-hidden="true" /></div>
          <strong className="text-3xl font-semibold tracking-tight">{value ?? "—"}</strong>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </Link>)}
      </section>
    </>}
  </>;
}
