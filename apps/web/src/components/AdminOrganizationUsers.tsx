import { membershipRoleLabels, type OrganizationUser } from "@niq/application-contracts";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { DateDisplay } from "./DateDisplay";
import { StatusBadge } from "./StatusBadge";
import { TeamEmptyIllustration } from "./TeamEmptyIllustration";
import { listOrganizationUsersPage } from "../lib/api";

const pageSize = 10;
const roleLabels = membershipRoleLabels;
const statusLabels = { INVITED: "Invited", ACTIVE: "Active", SUSPENDED: "Suspended", DEACTIVATED: "Deactivated" } as const;

function UserStatus({ user }: { user: OrganizationUser }) {
  if (!user.active || user.status === "DEACTIVATED") return <Badge variant="secondary">Deactivated</Badge>;
  return <StatusBadge status={statusLabels[user.status]} />;
}

export function OrganizationUsersSkeleton() {
  return <section className="surface table-surface" role="status" aria-label="Loading organization users">
    <span className="sr-only">Loading organization users…</span>
    <div className="mobile-card-list" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <article className="mobile-data-card" key={index}><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-44 max-w-full" /><div className="mt-2 flex justify-between gap-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-6 w-20 rounded-full" /></div></article>)}</div>
    <div className="desktop-table p-5" aria-hidden="true"><div className="overflow-x-auto"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>{Array.from({ length: 6 }, (_, index) => <tr key={index}><td><div className="grid gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-40" /></div></td><td><Skeleton className="h-4 w-28" /></td><td><Skeleton className="h-6 w-20 rounded-full" /></td><td><Skeleton className="h-4 w-24" /></td></tr>)}</tbody></table></div></div>
  </section>;
}

export function AdminOrganizationUsers({ organizationId, active, onTotalChange }: { organizationId: string; active: boolean; onTotalChange: (total: number) => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!active) return;
    if (search.trim() !== debouncedSearch) { setState("loading"); return; }
    let cancelled = false;
    setState("loading");
    listOrganizationUsersPage(organizationId, { page, pageSize, search: debouncedSearch }).then((result) => {
      if (cancelled) return;
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > lastPage) { setPage(lastPage); return; }
      setUsers(result.items);
      setTotal(result.total);
      setState("ready");
      if (!debouncedSearch) onTotalChange(result.total);
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [active, debouncedSearch, organizationId, onTotalChange, page, reload, search]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const empty = <div className="table-empty-content illustrated-empty-state">{search ? <><strong>No matching users</strong><span>Try a different name or email.</span></> : <><TeamEmptyIllustration /><strong>No users yet</strong><span>This organization’s users will appear here.</span></>}</div>;

  return <>
    <div className="mb-3 flex justify-end"><div className="relative w-full sm:w-64"><Input aria-label="Search users" placeholder="Search users…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="pr-9" />{search && <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear search users" className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground" onPress={() => { setSearch(""); setPage(1); }}><X aria-hidden="true" /></Button>}</div></div>
    {state === "loading" ? <OrganizationUsersSkeleton /> : state === "error" ? <section className="surface flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center" role="alert"><strong>Users could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></section> : <section className="surface table-surface">
      <div className="mobile-card-list">{users.length ? users.map(user => <article className="mobile-data-card" key={user.membershipId}><div className="min-w-0"><strong className="break-words">{user.displayName}</strong><span className="break-all">{user.email}</span></div><div className="flex flex-wrap items-center justify-between gap-2"><span>{roleLabels[user.role]}</span><UserStatus user={user} /></div><span>Added <DateDisplay value={user.createdAt} /></span></article>) : empty}</div>
      <div className="desktop-table p-5"><div className="overflow-x-auto"><table aria-label="Organization users"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>{users.length ? users.map(user => <tr key={user.membershipId}><td><strong>{user.displayName}</strong><span className="cell-subtitle">{user.email}</span></td><td>{roleLabels[user.role]}</td><td><UserStatus user={user} /></td><td><DateDisplay value={user.createdAt} /></td></tr>) : <tr><td colSpan={4} className="p-0">{empty}</td></tr>}</tbody></table></div></div>
    </section>}
    {state === "ready" && total > 0 && <Pagination className="mt-4" aria-label="Organization users pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
  </>;
}
