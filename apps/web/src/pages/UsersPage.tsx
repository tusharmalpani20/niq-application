import { UserEditDialog, canEditOrganizationUser } from "../components/UserEditDialog";
import { hasPermission } from "@niq/application-contracts";
import { type AuthenticatedUser, type Facility, type OrganizationDetails, type OrganizationUser } from "@niq/application-contracts";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Pencil, Plus, Search, RefreshCw, CircleX, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateDisplay } from "../components/DateDisplay";
import { TenantInvitationActionDialog, type InvitationActionTarget } from "../components/TenantInvitationActionDialog";
import { getInvitationAccess, setOrganizationUserActive } from "../lib/user-invitations";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { AdminListSkeleton } from "../components/AdminListSkeleton";
import { TeamEmptyIllustration } from "../components/TeamEmptyIllustration";
import { UserInvitationDialog, userRoleLabels } from "../components/UserInvitationDialog";
import { listFacilities, listOrganizationInvitationsPage, listOrganizationUsersPage } from "../lib/api";
import { useWorkspaceRevision } from "../features/notifications/useWorkspaceRevision";

type Invitation = OrganizationDetails["invitations"][number];
const pageSize = 10;
export function UsersPage() {
  const workspaceRevision = useWorkspaceRevision(["users", "facility"]);
  const currentUser = useOutletContext<AuthenticatedUser>();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<OrganizationUser["role"] | "all">("all");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [tab, setTab] = useState("users");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [allFacilities, setAllFacilities] = useState(false);
  const [invitationTarget, setInvitationTarget] = useState<InvitationActionTarget | null>(null);
  const [accessTarget, setAccessTarget] = useState<OrganizationUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editTarget, setEditTarget] = useState<OrganizationUser | null>(null);
  const [invite, setInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canManage = hasPermission(currentUser.role, "users.manage");
  const load = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true;
    Promise.all([listFacilities(currentUser.organizationId), getInvitationAccess(currentUser.organizationId)]).then(([locations, access]) => {
      if (!active) return;
      setFacilities(locations);
      setAllFacilities(access.allFacilities);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "User access could not be loaded."); });
    return () => { active = false; };
  }, [currentUser.organizationId, workspaceRevision, reload]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const org = currentUser.organizationId;
    const usersRequest = listOrganizationUsersPage(org, { page: tab === "users" ? page : 1, pageSize: tab === "users" ? pageSize : 1, search: tab === "users" ? debouncedQuery : "", role: tab === "users" ? role : "all", status: tab === "users" ? status : "all" });
    const invitationsRequest = listOrganizationInvitationsPage(org, { page: tab === "invitations" ? page : 1, pageSize: tab === "invitations" ? pageSize : 1, search: tab === "invitations" ? debouncedQuery : "", role: tab === "invitations" ? role : "all" });
    Promise.all([usersRequest, invitationsRequest]).then(([userResult, invitationResult]) => {
      if (!active) return;
      setUsers(tab === "users" ? userResult.items : []);
      setInvitations(tab === "invitations" ? invitationResult.items : []);
      setUserCount(tab === "users" ? userResult.total : userResult.unfilteredTotal);
      setInvitationCount(tab === "invitations" ? invitationResult.total : invitationResult.unfilteredTotal);
      const selected = tab === "users" ? userResult : invitationResult;
      setTotal(selected.total);
      setLoading(false);
      if (selected.total > 0 && selected.items.length === 0 && page > 1) setPage(Math.max(1, Math.ceil(selected.total / pageSize)));
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Users could not be loaded.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [currentUser.organizationId, tab, page, role, status, debouncedQuery, workspaceRevision, reload]);
  const showLoading = loading || query.trim() !== debouncedQuery;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  async function changeAccess() {
    if (!accessTarget || busy) return;
    setBusy(true); setActionError("");
    try {
      await setOrganizationUserActive(currentUser.organizationId, accessTarget.membershipId, !accessTarget.active);
      setAccessTarget(null); load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Access could not be updated."); }
    finally { setBusy(false); }
  }
  function userStatus(user: OrganizationUser) {
    return <Badge variant="outline" className={user.active && user.status === "ACTIVE" ? "border-success/20 bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{user.status === "SUSPENDED" ? "Account suspended" : user.status === "DEACTIVATED" ? "Account deactivated" : user.status === "INVITED" ? "Invitation pending" : user.active ? "Enabled" : "Disabled"}</Badge>;
  }
  function userActions(user: OrganizationUser) {
    if (!canManage) return null;
    return <div className="flex items-center gap-2"><TooltipTrigger><Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.displayName}`} isDisabled={!canEditOrganizationUser(user, facilities, allFacilities)} onPress={() => setEditTarget(user)}><Pencil className="size-4" aria-hidden="true" /></Button><Tooltip>{canEditOrganizationUser(user, facilities, allFacilities) ? "Edit user" : "Outside your facility access"}</Tooltip></TooltipTrigger>{user.userId === currentUser.userId ? null : user.status !== "ACTIVE" ? <span className="text-xs text-muted-foreground">Contact NIQ support</span> : <TooltipTrigger><Button size="icon" variant={user.active ? "destructive-outline" : "outline"} aria-label={`${user.active ? "Disable" : "Enable"} ${user.displayName}`} onPress={() => { setActionError(""); setAccessTarget(user); }}><Power aria-hidden="true" /></Button><Tooltip>{user.active ? "Disable user" : "Enable user"}</Tooltip></TooltipTrigger>}</div>;
  }
  function invitationStatus(invitation: Invitation) {
    const expired = invitation.status === "EXPIRED" || new Date(invitation.expiresAt).getTime() <= Date.now();
    return <Badge variant="outline" className={expired ? "border-border bg-muted text-muted-foreground" : "border-warning/20 bg-warning/10 text-warning"}>{expired ? "Expired" : "Pending"}</Badge>;
  }
  function invitationActions(invitation: Invitation) {
    if (!canManage) return null;
    return <div className="flex gap-2"><TooltipTrigger><Button variant="outline" size="icon" aria-label={`Create new link for ${invitation.email}`} onPress={() => setInvitationTarget({ invitation, action: "regenerate" })}><RefreshCw aria-hidden="true" /></Button><Tooltip>Create new link</Tooltip></TooltipTrigger><TooltipTrigger><Button variant="destructive-outline" size="icon" aria-label={`Revoke invitation for ${invitation.email}`} onPress={() => setInvitationTarget({ invitation, action: "revoke" })}><CircleX aria-hidden="true" /></Button><Tooltip>Revoke invitation</Tooltip></TooltipTrigger></div>;
  }
  const columns: DataTableColumn<OrganizationUser>[] = [
    { id: "user", header: "User", cell: ({ row }) => <div className="grid gap-1"><span>{row.original.displayName}{row.original.userId === currentUser.userId ? " (you)" : ""}</span><span className="text-xs text-muted-foreground">{row.original.email}</span></div> },
    { id: "role", header: "Role", cell: ({ row }) => userRoleLabels[row.original.role] },
    { id: "facilities", header: "Facility access", cell: ({ row }) => row.original.facilities?.length ? row.original.facilities.map((item) => item.name).join(", ") : row.original.facilities ? "All facilities" : "Unavailable" },
    { id: "status", header: "Status", cell: ({ row }) => userStatus(row.original) },
  ];
  if (canManage) columns.push({ id: "actions", header: "Actions", cell: ({ row }) => userActions(row.original) });
  const invitationColumns: DataTableColumn<Invitation>[] = [
    { accessorKey: "email", header: "Invitee" },
    { id: "role", header: "Role", cell: ({ row }) => userRoleLabels[row.original.role] },
    { id: "expires", header: "Expires", cell: ({ row }) => <DateDisplay value={new Date(row.original.expiresAt)} /> },
    { id: "status", header: "Status", cell: ({ row }) => invitationStatus(row.original) },
  ];
  if (canManage) invitationColumns.push({ id: "actions", header: "Actions", cell: ({ row }) => invitationActions(row.original) });
  const hasFilters = Boolean(query || role !== "all" || (tab === "users" && status !== "all"));
  const empty = <div className="table-empty-content illustrated-empty-state"><TeamEmptyIllustration /><strong>{hasFilters ? tab === "invitations" ? "No matching invitations" : "No matching users" : tab === "invitations" ? "No invitations yet" : "No users yet"}</strong><span>{hasFilters ? "Try changing the search or filters, or invite a colleague." : tab === "invitations" ? "Invitations will appear here when colleagues are invited." : "Your organization members will appear here."}</span>{canManage && <Button onPress={() => setInvite(true)}><Plus aria-hidden="true" />Invite a colleague</Button>}</div>;
  return <>
    <h1 className="patient-page-title">Users</h1>
    <Tabs selectedKey={tab} onSelectionChange={(key) => { setTab(String(key)); setPage(1); setQuery(""); setStatus("all"); }}>
    <div className="flex flex-wrap items-end justify-between gap-4 border-b">
      <TabsList variant="line" aria-label="User lists" className="user-list-tabs shrink-0 gap-5 p-0"><TabsTrigger id="users" className="rounded-none border-0 text-foreground/75 shadow-none after:bg-primary data-selected:text-primary">Users <span className="tab-count text-xs tabular-nums">{userCount}</span></TabsTrigger><TabsTrigger id="invitations" className="rounded-none border-0 text-foreground/75 shadow-none after:bg-primary data-selected:text-primary">Invitations <span className="tab-count text-xs tabular-nums">{invitationCount}</span></TabsTrigger></TabsList>
      <div className="flex w-full items-center gap-2 sm:w-80"><InputGroup className="h-10"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={tab === "users" ? "Search users" : "Search invitations"} placeholder={tab === "users" ? "Search users…" : "Search invitations…"} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></InputGroup>{canManage && <TooltipTrigger><Button size="icon-lg" className="size-10 shrink-0" aria-label="Invite user" onPress={() => setInvite(true)}><Plus /></Button><Tooltip>Invite user</Tooltip></TooltipTrigger>}</div>
    </div>
    <TabsContent key={tab} id={tab} className="space-y-4 pt-4">
    <div className="patient-filter-bar">
      <Select aria-label="Filter by role" selectedKey={role} onSelectionChange={(key) => { setRole(String(key) as typeof role); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All roles</SelectItem>{Object.entries(userRoleLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select>
      {tab === "users" && <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key) as typeof status); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="active">Enabled</SelectItem><SelectItem id="disabled">Disabled</SelectItem></SelectContent></Select>}
    </div>
    {error ? <div role="alert" className="surface p-5"><p>{error}</p><Button variant="outline" onPress={load}>Retry</Button></div> : showLoading ? <AdminListSkeleton label={tab} columns={tab === "users" ? ["User", "Role", "Facility access", "Status", "Actions"] : ["Invitee", "Role", "Expires", "Status", "Actions"]} /> : <section className="surface table-surface mobile-list-surface">{total === 0 ? empty : <><div className="desktop-table p-5">{tab === "users" ? <DataTable columns={columns} data={users} label="Users" /> : <DataTable columns={invitationColumns} data={invitations} label="Invitations" />}</div><div className="mobile-card-list">{tab === "users" ? users.map((user) => <article className="mobile-data-card list-mobile-card" key={user.membershipId}><div className="mobile-card-heading"><div className="mobile-card-primary"><strong>{user.displayName}{user.userId === currentUser.userId ? " (you)" : ""}</strong><span>{user.email}</span></div>{userStatus(user)}</div><div className="mobile-card-meta"><span>{userRoleLabels[user.role]}</span><span>·</span><span>{user.facilities?.length ? user.facilities.map((item) => item.name).join(", ") : user.facilities ? "All facilities" : "Unavailable"}</span></div>{canManage && <div className="mobile-card-actions">{userActions(user)}</div>}</article>) : invitations.map((invitation) => <article className="mobile-data-card list-mobile-card" key={invitation.id}><div className="mobile-card-heading"><div className="mobile-card-primary"><strong>{invitation.email}</strong><span>{userRoleLabels[invitation.role]}</span></div>{invitationStatus(invitation)}</div><div className="mobile-card-meta"><span>Expires <DateDisplay value={new Date(invitation.expiresAt)} /></span></div>{canManage && <div className="mobile-card-actions">{invitationActions(invitation)}</div>}</article>)}</div></>}</section>}
    {!error && !showLoading && total > 0 && <Pagination className="mt-4" aria-label={`${tab === "users" ? "Users" : "Invitations"} pagination`}><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={page === 1} onPress={() => setPage(page - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {page} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={page === pageCount} onPress={() => setPage(page + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    </TabsContent></Tabs>
    {invitationTarget && <TenantInvitationActionDialog organizationId={currentUser.organizationId} target={invitationTarget} onClose={() => setInvitationTarget(null)} onUpdated={() => void load()} />}
    {accessTarget && <Dialog ariaLabel={accessTarget.active ? "Disable user?" : "Enable user?"} isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={(open) => { if (!open && !busy) setAccessTarget(null); }} className="sm:max-w-md"><DialogHeader><DialogTitle>{accessTarget.active ? "Disable user?" : "Enable user?"}</DialogTitle></DialogHeader><p className="text-muted-foreground">{accessTarget.active ? `Are you sure you want to disable ${accessTarget.displayName}? They will lose access to this organization.` : `Enable access for ${accessTarget.displayName}?`}</p>{actionError && <p role="alert" className="text-destructive">{actionError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => setAccessTarget(null)}>Go back</Button><Button variant={accessTarget.active ? "destructive" : "default"} isDisabled={busy} onPress={changeAccess}>{busy ? "Saving…" : accessTarget.active ? "Disable user" : "Enable user"}</Button></div></Dialog>}
    {editTarget && <UserEditDialog user={currentUser} target={editTarget} facilities={facilities} allFacilities={allFacilities} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); void load(); }} />}
    {invite && <UserInvitationDialog user={currentUser} facilities={facilities.filter(item => item.status === "ACTIVE")} allFacilities={allFacilities} initialRole={role === "all" ? null : role} onClose={() => setInvite(false)} onCreated={() => { setTab("invitations"); setPage(1); setQuery(""); setRole("all"); setStatus("all"); void load(); }} />}
  </>;
}
