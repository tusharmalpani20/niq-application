import type { OrganizationUser } from "@niq/application-contracts";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { DataTable, type DataTableColumn } from "./DataTable";
import { EmptyState } from "./Page";
import { StatusBadge } from "./StatusBadge";

const pageSize = 10;
const roleLabels = { ORGANIZATION_ADMIN: "Organization admin", MEDICAL: "Medical", SUPPORT: "Support" } as const;
const statusLabels = { INVITED: "Invited", ACTIVE: "Active", SUSPENDED: "Suspended", DEACTIVATED: "Deactivated" } as const;

function UserStatus({ user }: { user: OrganizationUser }) {
  if (!user.active || user.status === "DEACTIVATED") return <Badge variant="secondary">Deactivated</Badge>;
  return <StatusBadge status={statusLabels[user.status]} />;
}

export function AdminOrganizationUsers({ users }: { users: OrganizationUser[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return users.filter((user) => [user.displayName, user.email, roleLabels[user.role]].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [search, users]);
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const columns: Array<DataTableColumn<OrganizationUser>> = [
    { id: "user", header: "User", cell: ({ row }) => <div><strong>{row.original.displayName}</strong><span className="cell-subtitle">{row.original.email}</span></div> },
    { id: "role", header: "Access", cell: ({ row }) => roleLabels[row.original.role] },
    { id: "status", header: "Status", cell: ({ row }) => <UserStatus user={row.original} /> },
    { id: "created", header: "Created", cell: ({ row }) => row.original.createdAt.toLocaleDateString() },
  ];

  return <section className="surface table-surface">
    <div className="toolbar"><div className="relative w-full sm:w-64"><Input aria-label="Search users" placeholder="Search users…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-9 pr-9" />{search && <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear search users" className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground" onPress={() => { setSearch(""); setPage(1); }}><X aria-hidden="true" /></Button>}</div></div>
    {users.length === 0 ? <EmptyState title="No users" description="This organization does not have any users yet." /> : filteredUsers.length === 0 ? <EmptyState title="No matching users" description="Try a different name, email, or access level." /> : <div className="p-5 pt-0"><DataTable columns={columns} data={visibleUsers} label="Organization users" /></div>}
    {filteredUsers.length > pageSize && <Pagination className="pb-4" aria-label="Users pagination"><PaginationContent>
      <PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem>
      <PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {filteredUsers.length} total</span></PaginationItem>
      <PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem>
    </PaginationContent></Pagination>}
  </section>;
}
