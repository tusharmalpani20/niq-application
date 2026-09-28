import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { LogOut } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOut } from "../lib/api";
import { Icon } from "../lib/icons";
import { BrandMarks } from "./BrandMarks";

const navigation = [
  { to: "/admin/organizations", label: "Organizations", icon: "building" },
  { to: "/admin/administrators", label: "Administrators", icon: "users" },
] as const;

export function PlatformAdminShell({ user }: { user: AuthenticatedUser }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useLayoutEffect(() => {
    document.documentElement.dataset.appArea = "platform";
    return () => { delete document.documentElement.dataset.appArea; };
  }, []);
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

  async function handleSignOut() { await signOut().catch(() => undefined); navigate("/sign-in", { replace: true }); }

  return <div className="admin-workspace min-h-svh min-w-0">
    <header className="workspace-header" aria-label="Administration header">
      <div className="workspace-header-inner">
        <button type="button" className="workspace-brand-group workspace-brand" aria-label="Go to organizations" onClick={() => navigate("/admin/organizations")}>
          <BrandMarks className="brand-marks-workspace" />
        </button>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Administration</span>
          <details className="workspace-account" ref={menuRef}>
            <summary aria-label={`Account menu for ${user.displayName}`}>
              <Avatar className="size-9 shrink-0"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
              <span className="workspace-account-name">{user.displayName}</span>
              <Icon name="chevron" size={16} />
            </summary>
            <div className="workspace-account-menu" data-has-management="false">
              <div className="workspace-account-identity"><span><strong>{user.displayName}</strong><small>Platform administrator</small></span></div>
              <Button variant="ghost" className="workspace-sign-out" onPress={handleSignOut}><LogOut className="size-4" />Sign out</Button>
            </div>
          </details>
        </div>
      </div>
    </header>
    <main className="content"><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading page…</p>}><Outlet context={{ user }} /></Suspense></main>
    <nav className="workspace-dock" aria-label="Administration navigation">
      {navigation.map((item) => <button type="button" key={item.to} className="workspace-dock-item" aria-current={pathname === item.to || pathname.startsWith(`${item.to}/`) ? "page" : undefined} onClick={() => navigate(item.to)}>
        <Icon name={item.icon} size={20} /><span>{item.label}</span>
      </button>)}
    </nav>
  </div>;
}
