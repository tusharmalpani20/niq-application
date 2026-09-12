import type { AuthenticatedUser } from "@niq/application-contracts";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useBranding } from "../lib/branding-context";
import { signOut } from "../lib/api";
const navigation = [
  { to: "/", label: "Overview", icon: "dashboard", end: true }, { to: "/patients", label: "Patients", icon: "patient" },
  { to: "/assessments", label: "Assessments", icon: "clipboard" }, { to: "/facilities", label: "Facilities", icon: "building" },
  { to: "/users", label: "Users", icon: "users" }, { to: "/settings/branding", label: "Branding", icon: "palette" },
];
export function AppShell({ user }: { user: AuthenticatedUser }) {
  const [open, setOpen] = useState(false); const { branding } = useBranding(); const location = useLocation(); const navigate = useNavigate();
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  async function handleSignOut() { await signOut().catch(() => undefined); navigate("/sign-in", { replace: true }); }
  return <div className="app-shell">
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-logo">N</div><div><strong>{branding.displayName}</strong><span>Nutrition intelligence</span></div><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
      <nav aria-label="Main navigation">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-context"><span className="context-label">Current facility</span><strong>All facilities</strong><span>India · IST</span></div>
      <div className="sidebar-user"><div className="avatar">{initials}</div><div><strong>{user.displayName}</strong><span>{user.role === "ORGANIZATION_ADMIN" ? "Organization admin" : user.role === "MEDICAL" ? "Medical user" : "Support user"}</span></div><button className="icon-button" type="button" aria-label="Sign out" onClick={handleSignOut}><Icon name="logout" size={18} /></button></div>
    </aside>
    <div className="app-main"><header className="topbar"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setOpen(true)}><Icon name="menu" /></button><div className="topbar-path"><span>NIQ Workspace</span><strong>{navigation.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label ?? "Workspace"}</strong></div><div className="topbar-actions"><span className="environment-pill">India · Development</span><button className="icon-button" aria-label="Notifications"><Icon name="bell" /></button><div className="avatar avatar-small">{initials}</div></div></header><main className="content"><Outlet /></main></div>
  </div>;
}
