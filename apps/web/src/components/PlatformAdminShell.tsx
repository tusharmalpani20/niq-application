import type { AuthenticatedUser } from "@niq/application-contracts";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "../lib/api";
import { Icon } from "../lib/icons";

const navigation = [
  { to: "/admin/organizations", label: "Organizations", icon: "building" },
];

export function PlatformAdminShell({ user }: { user: AuthenticatedUser }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const current = navigation.find((item) => location.pathname.startsWith(item.to));

  async function handleSignOut() {
    await signOut().catch(() => undefined);
    navigate("/sign-in", { replace: true });
  }

  return <div className="app-shell admin-shell">
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-logo">N</div><div><strong>NIQ Admin</strong><span>Platform operations</span></div><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
      <nav aria-label="Platform navigation">{navigation.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-context"><span className="context-label">Access level</span><strong>NIQ platform administrator</strong><span>All client organizations</span></div>
      <div className="sidebar-user"><div className="avatar">{initials}</div><div><strong>{user.displayName}</strong><span>NIQ administrator</span></div><button className="icon-button" type="button" aria-label="Sign out" onClick={handleSignOut}><Icon name="logout" size={18} /></button></div>
    </aside>
    <div className="app-main"><header className="topbar"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setOpen(true)}><Icon name="menu" /></button><div className="topbar-path"><span>NIQ Admin Console</span><strong>{current?.label ?? "Platform"}</strong></div><div className="topbar-actions"><span className="environment-pill">India · Development</span><div className="avatar avatar-small">{initials}</div></div></header><main className="content"><Outlet /></main></div>
  </div>;
}
