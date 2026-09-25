import { useLayoutEffect } from "react";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { LogOut } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "../lib/api";
import { Icon } from "../lib/icons";
import { ApplicationLogo } from "./ApplicationLogo";

const navigation = [
  { to: "/admin/organizations", label: "Organizations", icon: "building" },
  { to: "/admin/administrators", label: "Administrators", icon: "users" },
];

function AdminSidebar({ user, onSignOut }: { user: AuthenticatedUser; onSignOut: () => void }) {
  const { isMobile, state, setOpen, setOpenMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = state === "collapsed" && !isMobile;
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  function go(to: string) {
    navigate(to);
    setOpenMobile(false);
  }

  return <Sidebar collapsible="icon" className="border-r border-sidebar-border">
    <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-1">
      <div className="flex h-11 items-center gap-2 group-data-[collapsible=icon]:justify-center">
        {collapsed
          ? <Button variant="ghost" size="icon" className="size-10" aria-label="Expand navigation" onPress={() => setOpen(true)}><ApplicationLogo className="h-8 w-10 object-contain" decorative /></Button>
          : <><Link className="grid size-12 shrink-0 place-items-center" to="/admin/organizations" aria-label="NIQ home"><ApplicationLogo className="size-full object-contain" decorative /></Link><strong className="min-w-0 flex-1 truncate text-sm">NIQ</strong><SidebarTrigger aria-label="Collapse navigation" /></>}
      </div>
    </SidebarHeader>
    <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu className="gap-1">
      {navigation.map((item) => <SidebarMenuItem key={item.to}>
        <SidebarMenuButton isActive={location.pathname.startsWith(item.to)} tooltip={item.label} onPress={() => go(item.to)} className="h-10 text-sm">
          <Icon name={item.icon} /><span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
    </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-1">
      <div className="flex items-center gap-2 overflow-hidden group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <Avatar className="size-9 shrink-0"><AvatarFallback>{initials}</AvatarFallback></Avatar>
        <strong className="min-w-0 flex-1 truncate text-xs group-data-[collapsible=icon]:hidden">{user.displayName}</strong>
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" onPress={onSignOut}><LogOut /></Button>
      </div>
    </SidebarFooter>
  </Sidebar>;
}

export function PlatformAdminShell({ user }: { user: AuthenticatedUser }) {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    document.documentElement.dataset.appArea = "platform";
    return () => { delete document.documentElement.dataset.appArea; };
  }, []);
  async function handleSignOut() { await signOut().catch(() => undefined); navigate("/sign-in", { replace: true }); }
  return <SidebarProvider className="admin-workspace" defaultOpen={!window.matchMedia("(max-width: 820px)").matches}>
    <AdminSidebar user={user} onSignOut={handleSignOut} />
    <SidebarInset className="min-w-0">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4 md:hidden">
        <SidebarTrigger aria-label="Open navigation" />
      </header>
      <main className="content"><Outlet context={{ user }} /></main>
    </SidebarInset>
  </SidebarProvider>;
}
