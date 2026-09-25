import { canVisitOrganizationRoute } from "../lib/route-permissions";
import { membershipRoleLabels } from "@niq/application-contracts";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { LogOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOut } from "../lib/api";
import { useBranding } from "../lib/branding-context";
import { Icon } from "../lib/icons";

const canVisit = (user: AuthenticatedUser, path: string) => canVisitOrganizationRoute(user.role, path);

const primaryNavigation = [
  { to: "/", label: "Overview", icon: "dashboard", end: true },
  { to: "/patients", label: "Patients", icon: "patient" },
  { to: "/assessments", label: "Assessments", icon: "clipboard" },
  { to: "/facilities", label: "Facilities", icon: "building" },
];

const managementNavigation = [
  { to: "/users", label: "Users", icon: "users" },
  { to: "/settings/branding", label: "Branding", icon: "palette" },
  { to: "/settings/scoring", label: "Scoring connection", icon: "link" },
];

function OrganizationMark({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return url && !failed
    ? <img src={url} alt="" className="size-10 object-contain" onError={() => setFailed(true)} />
    : <span className="grid size-10 place-items-center rounded-xl rounded-bl-sm bg-primary font-bold text-primary-foreground">N</span>;
}

function navigateWithGuard(to: string, navigate: ReturnType<typeof useNavigate>) {
  const proceed = () => navigate(to);
  if (window.dispatchEvent(new CustomEvent("niq:before-navigation", { cancelable: true, detail: { to, proceed } }))) proceed();
}

function WorkspaceHeader({ user, onSignOut }: { user: AuthenticatedUser; onSignOut: () => void }) {
  const { branding } = useBranding();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const managementItems = managementNavigation.filter((item) => canVisit(user, item.to));
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function go(to: string) {
    if (menuRef.current) menuRef.current.open = false;
    navigateWithGuard(to, navigate);
  }

  return <header className="workspace-header" aria-label="Workspace header">
    <div className="workspace-header-inner">
      <button type="button" className="workspace-brand" aria-label={`${branding.displayName} home`} onClick={() => go("/")}>
        <OrganizationMark key={branding.logoUrl} url={branding.logoUrl} />
        <span className="workspace-brand-text"><strong>{branding.displayName}</strong><small>Nutrition intelligence</small></span>
      </button>
      <details className="workspace-account" ref={menuRef}>
        <summary aria-label={`Account menu for ${user.displayName}`}>
          <Avatar className="size-9 shrink-0"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
          <span className="workspace-account-name">{user.displayName}</span>
          <Icon name="chevron" size={16} />
        </summary>
        <div className="workspace-account-menu">
          <div className="workspace-account-identity"><strong>{user.displayName}</strong><span>{membershipRoleLabels[user.role]}</span></div>
          {managementItems.map((item) => <button type="button" key={item.to} onClick={() => go(item.to)}>
            <Icon name={item.icon} size={18} />{item.label}
          </button>)}
          <Button variant="ghost" className="workspace-sign-out" onPress={onSignOut}><LogOut className="size-4" />Sign out</Button>
        </div>
      </details>
    </div>
  </header>;
}

function WorkspaceDock({ user }: { user: AuthenticatedUser }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return <nav className="workspace-dock" aria-label="Main navigation">
    {primaryNavigation.filter((item) => canVisit(user, item.to)).map((item) => {
      const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
      return <button type="button" key={item.to} className="workspace-dock-item" aria-current={active ? "page" : undefined} onClick={() => navigateWithGuard(item.to, navigate)}>
        <Icon name={item.icon} size={20} /><span>{item.label}</span>
      </button>;
    })}
  </nav>;
}

export function AppShell({ user }: { user: AuthenticatedUser }) {
  const { resetBranding } = useBranding();
  const { pathname } = useLocation();
  const allowed = canVisit(user, pathname);
  useLayoutEffect(() => {
    document.documentElement.dataset.appArea = "client";
    return () => { delete document.documentElement.dataset.appArea; };
  }, []);
  const navigate = useNavigate();
  function handleSignOut() {
    const proceed = async () => { await signOut().catch(() => undefined); resetBranding(); navigate("/sign-in", { replace: true }); };
    if (window.dispatchEvent(new CustomEvent("niq:before-navigation", { cancelable: true, detail: { proceed } }))) void proceed();
  }

  return <div className="client-workspace min-h-svh min-w-0">
    <WorkspaceHeader user={user} onSignOut={handleSignOut} />
    <main className="content">{!allowed ? <Navigate to="/" replace /> : <Outlet context={user} />}</main>
    <WorkspaceDock user={user} />
  </div>;
}
