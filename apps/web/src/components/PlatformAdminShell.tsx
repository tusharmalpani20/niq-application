import type { AuthenticatedUser } from "@niq/application-contracts";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "../lib/api";
import { Icon } from "../lib/icons";

const navigation = [
  { to: "/admin/organizations", label: "Organizations", icon: "building" },
];

export function PlatformAdminShell({ user }: { user: AuthenticatedUser }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const navigate = useNavigate();
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  async function handleSignOut() {
    await signOut().catch(() => undefined);
    navigate("/sign-in", { replace: true });
  }

  return <div className={`app-shell admin-shell ${collapsed ? "is-nav-collapsed" : ""}`}>
    <aside className={`sidebar admin-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="sidebar-brand"><div className="brand-logo">N</div><div className="sidebar-label"><strong>NIQ Admin</strong></div><button className="sidebar-collapse-button" type="button" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} /></button></div>
      <nav aria-label="Platform navigation">{navigation.map((item) => <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon name={item.icon} /><span className="sidebar-label">{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-user"><div className="avatar">{initials}</div><div className="sidebar-label"><strong>{user.displayName}</strong></div><button className="icon-button" type="button" title="Sign out" aria-label="Sign out" onClick={handleSignOut}><Icon name="logout" size={18} /></button></div>
    </aside>
    <div className="app-main"><main className="content"><Outlet /></main></div>
  </div>;
}
