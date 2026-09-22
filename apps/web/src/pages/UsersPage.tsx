import { type AuthenticatedUser, type Facility, type OrganizationDetails, type OrganizationUser } from "@niq/application-contracts";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Search, RefreshCw, CircleX, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateDisplay } from "../components/DateDisplay";
import { EmptyState } from "../components/Page";
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
import { UserInvitationDialog, userRoleLabels } from "../components/UserInvitationDialog";
import { getOrganization, listFacilities, listOrganizationUsers } from "../lib/api";

type Invitation = OrganizationDetails["invitations"][number];
export function UsersPage() {
  const currentUser = useOutletContext<AuthenticatedUser>();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState("users");
  const [page, setPage] = useState(1);
  const [allFacilities, setAllFacilities] = useState(false);
  const [invitationTarget, setInvitationTarget] = useState<InvitationActionTarget | null>(null);
  const [accessTarget, setAccessTarget] = useState<OrganizationUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [invite, setInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canManage = currentUser.role === "ORGANIZATION_ADMIN";
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [records, details, locations, access] = await Promise.all([listOrganizationUsers(currentUser.organizationId), getOrganization(currentUser.organizationId), listFacilities(currentUser.organizationId), getInvitationAccess(currentUser.organizationId)]);
      setUsers(records);
      setInvitations(details.invitations.filter((item) => item.status === "PENDING" || item.status === "EXPIRED"));
      setAllFacilities(access.allFacilities);
      setFacilities(locations.filter((item) => item.status === "ACTIVE"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Users could not be loaded."); }
    finally { setLoading(false); }
  }, [currentUser.organizationId]);
  useEffect(() => { void load(); }, [load]);
  const normalized = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => (user.displayName + " " + user.email).toLowerCase().includes(normalized) && (role === "all" || user.role === role) && (status === "all" || (status === "active" ? user.active && user.status === "ACTIVE" : !user.active || user.status !== "ACTIVE")));
  const filteredInvitations = invitations.filter((item) => item.email.toLowerCase().includes(normalized) && (role === "all" || item.role === role));
  const total = tab === "users" ? filteredUsers.length : filteredInvitations.length;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * 10;
  async function changeAccess() {
    if (!accessTarget || busy) return;
    setBusy(true); setActionError("");
    try {
      await setOrganizationUserActive(currentUser.organizationId, accessTarget.membershipId, !accessTarget.active);
      setAccessTarget(null); await load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Access could not be updated."); }
    finally { setBusy(false); }
  }
  const columns: DataTableColumn<OrganizationUser>[] = [
    { id: "user", header: "User", cell: ({ row }) => <div className="grid gap-1"><span>{row.original.displayName}{row.original.userId === currentUser.userId ? " (you)" : ""}</span><span className="text-xs text-muted-foreground">{row.original.email}</span></div> },
    { id: "role", header: "Role", cell: ({ row }) => userRoleLabels[row.original.role] },
    { id: "facilities", header: "Facility access", cell: ({ row }) => row.original.facilities?.length ? row.original.facilities.map((item) => item.name).join(", ") : row.original.facilities ? "All facilities" : "Unavailable" },
    { id: "status", header: "Status", cell: ({ row }) => <Badge variant="outline" className={row.original.active && row.original.status === "ACTIVE" ? "border-success/20 bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{row.original.status === "SUSPENDED" ? "Account suspended" : row.original.status === "DEACTIVATED" ? "Account deactivated" : row.original.status === "INVITED" ? "Invitation pending" : row.original.active ? "Enabled" : "Disabled"}</Badge> },
  ];
  if (canManage) columns.push({ id: "actions", header: "Actions", cell: ({ row }) => row.original.userId === currentUser.userId ? <span className="text-xs text-muted-foreground">Your account</span> : row.original.status !== "ACTIVE" ? <span className="text-xs text-muted-foreground">Contact NIQ support</span> : <TooltipTrigger><Button size="icon" variant={row.original.active ? "destructive-outline" : "outline"} aria-label={`${row.original.active ? "Disable" : "Enable"} ${row.original.displayName}`} onPress={() => { setActionError(""); setAccessTarget(row.original); }}><Power aria-hidden="true" /></Button><Tooltip>{row.original.active ? "Disable user" : "Enable user"}</Tooltip></TooltipTrigger> });
  const invitationColumns: DataTableColumn<Invitation>[] = [
    { accessorKey: "email", header: "Invitee" },
    { id: "role", header: "Role", cell: ({ row }) => userRoleLabels[row.original.role] },
    { id: "expires", header: "Expires", cell: ({ row }) => <DateDisplay value={new Date(row.original.expiresAt)} /> },
    { id: "status", header: "Status", cell: ({ row }) => {
      const expired = row.original.status === "EXPIRED" || new Date(row.original.expiresAt).getTime() <= Date.now();
      return <Badge variant="outline" className={expired ? "border-border bg-muted text-muted-foreground" : "border-warning/20 bg-warning/10 text-warning"}>{expired ? "Expired" : "Pending"}</Badge>;
    } },
  ];
  if (canManage) invitationColumns.push({ id: "actions", header: "Actions", cell: ({ row }) => <div className="flex gap-2"><TooltipTrigger><Button variant="outline" size="icon" aria-label={`Create new link for ${row.original.email}`} onPress={() => setInvitationTarget({ invitation: row.original, action: "regenerate" })}><RefreshCw aria-hidden="true" /></Button><Tooltip>Create new link</Tooltip></TooltipTrigger><TooltipTrigger><Button variant="destructive-outline" size="icon" aria-label={`Revoke invitation for ${row.original.email}`} onPress={() => setInvitationTarget({ invitation: row.original, action: "revoke" })}><CircleX aria-hidden="true" /></Button><Tooltip>Revoke invitation</Tooltip></TooltipTrigger></div> });
  const hasFilters = Boolean(query || role !== "all" || (tab === "users" && status !== "all"));
  const empty = hasFilters ? <EmptyState title="No matches" description="Try changing the search or filters." icon={null} className="min-h-36" /> : canManage ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><strong>Invite your first colleague</strong><Button onPress={() => setInvite(true)}><Plus aria-hidden="true" />Invite a colleague</Button></div> : <EmptyState title="No records to show" icon={null} className="min-h-36" />;
  return <>
    <h1 className="patient-page-title">Users</h1>
    <Tabs selectedKey={tab} onSelectionChange={(key) => { setTab(String(key)); setPage(1); setQuery(""); setStatus("all"); }}>
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-2">
      <TabsList variant="line" aria-label="User lists" className="shrink-0"><TabsTrigger id="users">Users <Badge variant="secondary">{users.length}</Badge></TabsTrigger><TabsTrigger id="invitations">Invitations <Badge variant="secondary">{invitations.length}</Badge></TabsTrigger></TabsList>
      <div className="flex w-full items-center gap-2 sm:w-80"><InputGroup className="h-10"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={tab === "users" ? "Search users" : "Search invitations"} placeholder={tab === "users" ? "Search users…" : "Search invitations…"} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></InputGroup>{canManage && <TooltipTrigger><Button size="icon-lg" className="size-10 shrink-0" aria-label="Invite user" isDisabled={loading || !!error} onPress={() => setInvite(true)}><Plus /></Button><Tooltip>Invite user</Tooltip></TooltipTrigger>}</div>
    </div>
    <TabsContent key={tab} id={tab} className="space-y-4 pt-4">
    <div className="patient-filter-bar">
      <Select aria-label="Filter by role" selectedKey={role} onSelectionChange={(key) => { setRole(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All roles</SelectItem>{Object.entries(userRoleLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select>
      {tab === "users" && <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="active">Enabled</SelectItem><SelectItem id="disabled">Disabled</SelectItem></SelectContent></Select>}
    </div>
    {error ? <div role="alert" className="surface p-5"><p>{error}</p><Button variant="outline" onPress={() => void load()}>Retry</Button></div> :
      <section className="surface table-surface"><div className="overflow-x-auto p-5">{loading ? <p role="status" className="p-6 text-muted-foreground">Loading users…</p> : tab === "users" ? <DataTable columns={columns} data={filteredUsers.slice(start, start + 10)} label="Users" emptyContent={empty} /> : <DataTable columns={invitationColumns} data={filteredInvitations.slice(start, start + 10)} label="Invitations" emptyContent={empty} />}</div></section>}
    {!error && !loading && total > 0 && <Pagination className="mt-4" aria-label="Users pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={loading || currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {total} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={loading || currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    </TabsContent></Tabs>
    {invitationTarget && <TenantInvitationActionDialog organizationId={currentUser.organizationId} target={invitationTarget} onClose={() => setInvitationTarget(null)} onUpdated={() => void load()} />}
    {accessTarget && <Dialog ariaLabel={accessTarget.active ? "Disable user?" : "Enable user?"} isOpen isDismissable={!busy} showCloseButton={!busy} onOpenChange={(open) => { if (!open && !busy) setAccessTarget(null); }} className="sm:max-w-md"><DialogHeader><DialogTitle>{accessTarget.active ? "Disable user?" : "Enable user?"}</DialogTitle></DialogHeader><p className="text-muted-foreground">{accessTarget.active ? `Are you sure you want to disable ${accessTarget.displayName}? They will lose access to this organization.` : `Enable access for ${accessTarget.displayName}?`}</p>{actionError && <p role="alert" className="text-destructive">{actionError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" isDisabled={busy} onPress={() => setAccessTarget(null)}>Go back</Button><Button variant={accessTarget.active ? "destructive" : "default"} isDisabled={busy} onPress={changeAccess}>{busy ? "Saving…" : accessTarget.active ? "Disable user" : "Enable user"}</Button></div></Dialog>}
    {invite && <UserInvitationDialog user={currentUser} facilities={facilities} allFacilities={allFacilities} onClose={() => setInvite(false)} onCreated={() => { setTab("invitations"); setPage(1); setQuery(""); setRole("all"); setStatus("all"); void load(); }} />}
  </>;
}
