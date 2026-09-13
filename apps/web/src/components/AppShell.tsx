import type { AuthenticatedUser } from "@niq/application-contracts";
import { Bell, LogOut } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "../lib/api";
import { useBranding } from "../lib/branding-context";
import { Icon } from "../lib/icons";

const navigation = [
  { to: "/", label: "Overview", icon: "dashboard", end: true },
  { to: "/patients", label: "Patients", icon: "patient" },
  { to: "/assessments", label: "Assessments", icon: "clipboard" },
  { to: "/facilities", label: "Facilities", icon: "building" },
  { to: "/users", label: "Users", icon: "users" },
  { to: "/settings/branding", label: "Branding", icon: "palette" },
];

function OrganizationSidebar({ user, onSignOut }: { user: AuthenticatedUser; onSignOut: () => void }) {
  const { branding } = useBranding();
  const { isMobile, state, setOpen, setOpenMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = state === "collapsed" && !isMobile;
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  function isActive(to: string, end?: boolean) { return end ? location.pathname === to : location.pathname.startsWith(to); }
  function go(to: string) { navigate(to); setOpenMobile(false); }

  return <Sidebar collapsible="icon" className="border-r border-sidebar-border">
    <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-1">
      <div className="flex h-11 items-center gap-2 group-data-[collapsible=icon]:justify-center">
        {collapsed
          ? <Button variant="ghost" size="icon" className="size-10 rounded-xl rounded-bl-sm bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" aria-label="Expand navigation" onPress={() => setOpen(true)}>N</Button>
          : <><Link className="grid size-10 shrink-0 place-items-center rounded-xl rounded-bl-sm bg-primary font-bold text-primary-foreground" to="/" aria-label={`${branding.displayName} home`}>N</Link><div className="grid min-w-0 flex-1"><strong className="truncate text-sm">{branding.displayName}</strong><span className="truncate text-xs text-muted-foreground">Nutrition intelligence</span></div><SidebarTrigger aria-label="Collapse navigation" /></>}
      </div>
    </SidebarHeader>
    <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>
      {navigation.map((item) => <SidebarMenuItem key={item.to}>
        <SidebarMenuButton isActive={isActive(item.to, item.end)} tooltip={item.label} onPress={() => go(item.to)} className="h-10 text-sm">
          <Icon name={item.icon} /><span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
    </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-1">
      <div className="flex items-center gap-2 overflow-hidden group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <Avatar className="size-9 shrink-0"><AvatarFallback>{initials}</AvatarFallback></Avatar>
        <div className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><strong className="truncate text-xs">{user.displayName}</strong><span className="truncate text-[.68rem] text-muted-foreground">{user.role === "ORGANIZATION_ADMIN" ? "Organization admin" : user.role === "MEDICAL" ? "Medical user" : "Support user"}</span></div>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" onPress={onSignOut}><LogOut /></Button>
      </div>
    </SidebarFooter>
  </Sidebar>;
}

export function AppShell({ user }: { user: AuthenticatedUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const currentPage = navigation.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label ?? "Workspace";
  async function handleSignOut() { await signOut().catch(() => undefined); navigate("/sign-in", { replace: true }); }

  return <SidebarProvider>
    <OrganizationSidebar user={user} onSignOut={handleSignOut} />
    <SidebarInset className="min-w-0">
      <header className="topbar"><SidebarTrigger aria-label="Toggle navigation" /><div className="topbar-path"><strong>{currentPage}</strong></div><div className="topbar-actions"><Button variant="ghost" size="icon-sm" aria-label="Notifications"><Bell /></Button><Avatar className="size-8"><AvatarFallback>{initials}</AvatarFallback></Avatar></div></header>
      <main className="content"><Outlet /></main>
    </SidebarInset>
  </SidebarProvider>;
}
