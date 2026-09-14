import { type AuthenticatedUser, type Facility, type OrganizationDetails, type OrganizationUser } from "@niq/application-contracts";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [invite, setInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canManage = currentUser.role === "ORGANIZATION_ADMIN";
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [records, details, locations] = await Promise.all([listOrganizationUsers(currentUser.organizationId), getOrganization(currentUser.organizationId), listFacilities(currentUser.organizationId)]);
      setUsers(records);
      setInvitations(details.invitations.filter((item) => item.status === "PENDING" && new Date(item.expiresAt).getTime() > Date.now()));
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
  const columns: DataTableColumn<OrganizationUser>[] = [
    { id: "user", header: "User", cell: ({ row }) => <div className="grid gap-1"><strong>{row.original.displayName}{row.original.userId === currentUser.userId ? " (you)" : ""}</strong><span className="text-xs text-muted-foreground">{row.original.email}</span></div> },
    { id: "role", header: "Role", cell: ({ row }) => userRoleLabels[row.original.role] },
    { id: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.active && row.original.status === "ACTIVE" ? "default" : "secondary"}>{row.original.active && row.original.status === "ACTIVE" ? "Enabled" : "Disabled"}</Badge> },
  ];
  const invitationColumns: DataTableColumn<Invitation>[] = [
    { accessorKey: "email", header: "Invitee" },
    { id: "role", header: "Role", cell: ({ row }) => userRoleLabels[row.original.role] },
    { id: "expires", header: "Expires", cell: ({ row }) => new Date(row.original.expiresAt).toLocaleDateString() },
    { id: "status", header: "Status", cell: () => <Badge variant="secondary">Pending</Badge> },
  ];
  const empty = <div className="table-empty-content">{query || role !== "all" || status !== "all" ? <><strong>No matches</strong><span>Try changing the search or filters.</span></> : canManage ? <Button className="patient-empty-action" variant="outline" size="sm" onPress={() => setInvite(true)}><Plus />Invite user</Button> : <span>No records to show.</span>}</div>;
  return <>
    <h1 className="patient-page-title">Users</h1>
    <div className="patient-list-header">
      <div className="flex flex-wrap gap-4" role="group" aria-label="User lists">{[["users", "Users", users.length], ["invitations", "Pending invitations", invitations.length]].map(([id, label, count]) =>
        <button key={id} type="button" aria-pressed={tab === id} className={tab === id ? "patient-list-heading" : "flex items-center gap-2 px-1 pb-3 text-muted-foreground"} onClick={() => { setTab(String(id)); setPage(1); setQuery(""); setStatus("all"); }}><span className={tab === id ? "patient-list-label" : ""}>{label}</span><span>{loading ? "…" : count}</span></button>)}</div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={tab === "users" ? "Search users" : "Search invitations"} placeholder={tab === "users" ? "Search users…" : "Search invitations…"} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></InputGroup>{canManage && <Button size="icon-lg" className="size-10 shrink-0" aria-label="Invite user" onPress={() => setInvite(true)}><Plus /></Button>}</div>
    </div>
    <div className="patient-filter-bar">
      <Select aria-label="Filter by role" selectedKey={role} onSelectionChange={(key) => { setRole(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All roles</SelectItem>{Object.entries(userRoleLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select>
      {tab === "users" && <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem><SelectItem id="active">Enabled</SelectItem><SelectItem id="disabled">Disabled</SelectItem></SelectContent></Select>}
    </div>
    {error ? <div role="alert" className="surface p-5"><p>{error}</p><Button variant="outline" onPress={() => void load()}>Retry</Button></div> :
      <section className="surface table-surface"><div className="overflow-x-auto p-5">{loading ? <p role="status" className="p-6 text-muted-foreground">Loading users…</p> : tab === "users" ? <DataTable columns={columns} data={filteredUsers.slice(start, start + 10)} label="Users" emptyContent={empty} /> : <DataTable columns={invitationColumns} data={filteredInvitations.slice(start, start + 10)} label="Pending invitations" emptyContent={empty} />}</div></section>}
    {!error && <Pagination className="mt-4" aria-label="Users pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={loading || currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {total} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={loading || currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
    {invite && <UserInvitationDialog user={currentUser} facilities={facilities} onClose={() => setInvite(false)} onCreated={() => { setTab("invitations"); setPage(1); setQuery(""); setRole("all"); setStatus("all"); void load(); }} />}
  </>;
}
