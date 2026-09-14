import type { AuthenticatedUser, Patient } from "@niq/application-contracts";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowUpRight, Building2, Users, UserRound, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RouterButtonLink } from "../components/RouterButtonLink";
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
        patients: [...patients].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
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
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <Card className="surface gap-0 p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="m-0 text-base font-semibold">Recent patients</h2><RouterButtonLink to="/patients" variant="ghost" size="sm">View all<ArrowUpRight className="size-4" /></RouterButtonLink></div>
          {!data ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading overview…</p> : data.patients.length ? <ul className="m-0 list-none divide-y p-0">
            {data.patients.slice(0, 5).map((patient) => <li key={patient.id}><Link to={"/patients/" + encodeURIComponent(patient.reference)} className="flex items-center justify-between gap-3 rounded-md px-2 py-4 no-underline hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
              <div className="grid min-w-0 gap-1"><strong className="text-sm text-primary">{patient.reference}</strong><span className="truncate text-xs text-muted-foreground">{patient.homeFacility?.name ?? "No facility"}</span></div>
              <div className="flex shrink-0 items-center gap-3"><time className="text-xs text-muted-foreground" dateTime={patient.createdAt.toISOString()}>{patient.createdAt.toLocaleDateString()}</time><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /></div>
            </Link></li>)}
          </ul> : <div className="grid justify-items-center gap-3 py-10"><span className="text-sm text-muted-foreground">No registered patients yet.</span><RouterButtonLink to="/patients" variant="outline" size="sm">Go to patients<ArrowUpRight className="size-4" /></RouterButtonLink></div>}
        </Card>
        <Card className="surface gap-3 p-5">
          <h2 className="m-0 text-base font-semibold">Workspace</h2>
          <Link className="flex items-center justify-between rounded-md py-2 text-sm text-primary no-underline hover:underline" to="/facilities">Facilities<ArrowUpRight className="size-4" /></Link>
          {isAdmin && <><Link className="flex items-center justify-between rounded-md py-2 text-sm text-primary no-underline hover:underline" to="/users">Users and invitations<ArrowUpRight className="size-4" /></Link><Link className="flex items-center justify-between rounded-md py-2 text-sm text-primary no-underline hover:underline" to="/settings/branding">Branding<ArrowUpRight className="size-4" /></Link><Link className="flex items-center justify-between rounded-md py-2 text-sm text-primary no-underline hover:underline" to="/settings/scoring">Scoring connection<ArrowUpRight className="size-4" /></Link></>}
        </Card>
      </div>
    </>}
  </>;
}
