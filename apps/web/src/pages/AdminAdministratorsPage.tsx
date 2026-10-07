import { type AuthenticatedUser, type PlatformAdministrator } from "@niq/application-contracts";
import { AlertTriangle, Plus, Search, RefreshCw, CircleX, MailPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { DataTableColumn } from "../components/DataTable";
import { AdministratorInvitationActionDialog, type InvitationActionTarget } from "../components/AdministratorInvitationActionDialog";
import { AdministratorInvitationDialog } from "../components/AdministratorInvitationDialog";
import { DateDisplay } from "../components/DateDisplay";
import { StatusBadge } from "../components/StatusBadge";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "../components/DataTable";
import { AdminListSkeleton } from "../components/AdminListSkeleton";
import { EmptyState, ErrorState, PageHeader } from "../components/Page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiRequestError, listPlatformAdministratorsPage, setPlatformAdministratorActive } from "../lib/api";

type AdministratorUser = Extract<PlatformAdministrator, { kind: "USER" }>;
type AdministratorInvitation = Extract<PlatformAdministrator, { kind: "INVITATION" }>;
const pageSize = 10;

function OwnAccountLabel() {
  return <TooltipTrigger><Button variant="ghost" size="sm" aria-label="Your account. You cannot disable your own account.">Your account</Button><Tooltip>You cannot disable your own account.</Tooltip></TooltipTrigger>;
}

export function AdminAdministratorsPage() {
  const { user: currentUser } = useOutletContext<{ user: AuthenticatedUser }>();
  const [administrators, setAdministrators] = useState<PlatformAdministrator[]>([]);
  const [total, setTotal] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showInvite, setShowInvite] = useState(false);
  const [invitationTarget, setInvitationTarget] = useState<InvitationActionTarget | null>(null);
  const [selectedTab, setSelectedTab] = useState<"users" | "invitations">("users");
  const [accessTarget, setAccessTarget] = useState<AdministratorUser | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [invitationPage, setInvitationPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const page = selectedTab === "users" ? userPage : invitationPage;
  useEffect(() => {
    let active = true;
    setState("loading");
    listPlatformAdministratorsPage({ kind: selectedTab === "users" ? "USER" : "INVITATION", page, pageSize, search: debouncedSearch }).then((result) => {
      if (!active) return;
      setAdministrators(result.items);
      setTotal(result.total);
      setUserCount(result.userCount);
      setInvitationCount(result.invitationCount);
      setState("ready");
      if (result.total > 0 && result.items.length === 0 && page > 1) {
        const next = Math.max(1, Math.ceil(result.total / pageSize));
        if (selectedTab === "users") setUserPage(next); else setInvitationPage(next);
      }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [selectedTab, page, debouncedSearch, reload]);
  const load = useCallback(() => setReload((value) => value + 1), []);
  const users = administrators.filter((item): item is AdministratorUser => item.kind === "USER");
  const pendingInvitations = administrators.filter((item): item is AdministratorInvitation => item.kind === "INVITATION");
  const showLoading = state === "loading" || search.trim() !== debouncedSearch;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  async function changeAccess() {
    if (!accessTarget || accessTarget.userId === currentUser.userId) return;
    setAccessBusy(true);
    setAccessMessage(null);
    try {
      const updated = await setPlatformAdministratorActive(accessTarget.membershipId, !accessTarget.active);
      setAdministrators((current) => current.map((item) => item.kind === "USER" && item.userId === accessTarget.userId ? updated : item));
      load();
      setAccessTarget(null);
    } catch (error) {
      setAccessMessage(error instanceof ApiRequestError || error instanceof Error ? error.message : "Administrator access could not be changed.");
      setAccessTarget(null);
    } finally {
      setAccessBusy(false);
    }
  }

  const userColumns: Array<DataTableColumn<AdministratorUser>> = [
    { id: "administrator", header: "Administrator", cell: ({ row }) => <><strong>{row.original.displayName}{row.original.userId === currentUser.userId ? " (you)" : ""}</strong><span className="cell-subtitle">{row.original.email}</span></> },
    { id: "status", header: "Status", cell: ({ row }) => row.original.active ? <StatusBadge status="Active" /> : <Badge variant="secondary">Disabled</Badge> },
    { id: "actions", header: "Actions", cell: ({ row }) => row.original.userId === currentUser.userId ? <OwnAccountLabel /> : <Button variant="outline" size="sm" onPress={() => setAccessTarget(row.original)}>{row.original.active ? "Disable" : "Enable"}</Button> },
  ];
  function invitationActions(invitation: AdministratorInvitation) {
    return <div className="flex flex-wrap gap-2">
      <TooltipTrigger><Button variant="outline" size="icon" aria-label={`Create new link for ${invitation.email}`} onPress={() => setInvitationTarget({ invitation, action: "regenerate" })}><RefreshCw aria-hidden="true" /></Button><Tooltip>Create new link</Tooltip></TooltipTrigger>
      <TooltipTrigger><Button variant="destructive-outline" size="icon" aria-label={`Revoke invitation for ${invitation.email}`} onPress={() => setInvitationTarget({ invitation, action: "revoke" })}><CircleX aria-hidden="true" /></Button><Tooltip>Revoke invitation</Tooltip></TooltipTrigger>
    </div>;
  }
  const invitationColumns: Array<DataTableColumn<AdministratorInvitation>> = [
    { id: "administrator", header: "Invitee", cell: ({ row }) => <strong>{row.original.email}</strong> },
    { id: "expires", header: "Expires", cell: ({ row }) => <DateDisplay value={row.original.expiresAt} /> },
    { id: "actions", header: "Actions", cell: ({ row }) => invitationActions(row.original) },
  ];
  const invitationEmpty = search.trim() ? <EmptyState title="No matching invitations" description="Try a different search." icon={null} className="min-h-64" /> : <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
    <div aria-hidden="true" className="relative grid size-20 place-items-center rounded-3xl border border-primary/15 bg-primary/5 text-primary"><span className="absolute -right-2 -top-2 size-5 rounded-full bg-primary/15" /><span className="absolute -bottom-1 -left-3 size-3 rounded-full bg-primary/25" /><MailPlus className="size-10" /></div>
    <div><h2 className="font-semibold text-foreground">No pending invitations</h2><p className="mt-1 text-sm text-muted-foreground">Invite a colleague to help manage NIQ.</p></div>
    <Button onPress={() => setShowInvite(true)}><Plus aria-hidden="true" />Invite a colleague</Button>
  </div>;

  return <>
    <PageHeader title="Administrators" />
    <div className="grid gap-4">
      {accessMessage && <Alert variant="destructive"><AlertDescription>{accessMessage}</AlertDescription></Alert>}
      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as "users" | "invitations")} className="gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b">
          <TabsList variant="line" aria-label="Administrator management" className="gap-5 p-0">
            <TabsTrigger id="users" className="rounded-none border-0 px-1 pb-3 text-foreground/75 shadow-none after:bg-primary data-selected:text-primary">Users <span className="tab-count ml-1 text-xs tabular-nums">{userCount}</span></TabsTrigger>
            <TabsTrigger id="invitations" className="rounded-none border-0 px-1 pb-3 text-foreground/75 shadow-none after:bg-primary data-selected:text-primary">Pending invitations <span className="tab-count ml-1 text-xs tabular-nums">{invitationCount}</span></TabsTrigger>
          </TabsList>
          <div className="mb-2 flex flex-1 items-center justify-end gap-2">
            <InputGroup className="h-10 max-w-72"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput value={search} onChange={(event) => { setSearch(event.target.value); setUserPage(1); setInvitationPage(1); }} placeholder={selectedTab === "users" ? "Search administrators..." : "Search invitations..."} aria-label={selectedTab === "users" ? "Search administrators" : "Search invitations"} /></InputGroup>
            <TooltipTrigger><Button size="icon-lg" className="size-10 shrink-0" aria-label="Invite administrator" onPress={() => setShowInvite(true)}><Plus aria-hidden="true" /></Button><Tooltip>Invite administrator</Tooltip></TooltipTrigger>
          </div>
        </div>
        <TabsContent id="users" className="grid gap-4">
          {showLoading ? <AdminListSkeleton label="administrators" columns={["Administrator", "Status", "Actions"]} /> : state === "error" ? <ErrorState retry={load} /> : <section className="surface table-surface">{users.length === 0 ? <EmptyState title={search.trim() ? "No matching administrators" : "No administrators"} description={search.trim() ? "Try a different search." : "Invite an administrator to help manage this application."} /> : <><div className="desktop-table p-5"><DataTable columns={userColumns} data={users} label="NIQ administrators" /></div><div className="mobile-card-list">{users.map((administrator) => <article className="mobile-data-card" key={administrator.userId}><div><strong>{administrator.displayName}{administrator.userId === currentUser.userId ? " (you)" : ""}</strong><span>{administrator.email}</span></div><div className="flex items-center justify-between gap-3">{administrator.active ? <StatusBadge status="Active" /> : <Badge variant="secondary">Disabled</Badge>}{administrator.userId === currentUser.userId ? <OwnAccountLabel /> : <Button variant="outline" size="sm" onPress={() => setAccessTarget(administrator)}>{administrator.active ? "Disable" : "Enable"}</Button>}</div></article>)}</div></>}</section>}
          {!showLoading && state === "ready" && total > 0 && <Pagination aria-label="Administrators pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={userPage === 1} onPress={() => setUserPage((page) => page - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {userPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={userPage === pageCount} onPress={() => setUserPage((page) => page + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
        </TabsContent>
        <TabsContent id="invitations" className="grid gap-4">
          {showLoading ? <AdminListSkeleton label="invitations" columns={["Invitee", "Expires", "Actions"]} /> : state === "error" ? <ErrorState retry={load} /> : <section className="surface table-surface">
            <div className="desktop-table p-5"><DataTable columns={invitationColumns} data={pendingInvitations} label="Pending administrator invitations" emptyContent={invitationEmpty} /></div>
            <div className="mobile-card-list">{pendingInvitations.length === 0 ? invitationEmpty : pendingInvitations.map((invitation) => <article className="mobile-data-card" key={invitation.invitationId}><strong>{invitation.email}</strong><div className="flex items-center justify-between gap-3"><Badge variant="secondary">Pending</Badge><span>Expires <DateDisplay value={invitation.expiresAt} /></span></div>{invitationActions(invitation)}</article>)}</div>
          </section>}
          {!showLoading && state === "ready" && total > 0 && <Pagination aria-label="Invitations pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={invitationPage === 1} onPress={() => setInvitationPage((page) => page - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {invitationPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={invitationPage === pageCount} onPress={() => setInvitationPage((page) => page + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
        </TabsContent>
      </Tabs>
    </div>
    {invitationTarget && <AdministratorInvitationActionDialog target={invitationTarget} onClose={() => setInvitationTarget(null)} onUpdated={load} />}
    <AdministratorInvitationDialog open={showInvite} onClose={() => setShowInvite(false)} onCreated={load} />
    {accessTarget && <AlertDialog ariaLabel={accessTarget.active ? "Disable administrator" : "Enable administrator"} isOpen onOpenChange={(open) => { if (!open && !accessBusy) setAccessTarget(null); }} isDismissable={!accessBusy}>
      <AlertDialogHeader><AlertDialogMedia><AlertTriangle /></AlertDialogMedia><AlertDialogTitle>{accessTarget.active ? "Disable administrator?" : "Enable administrator?"}</AlertDialogTitle><AlertDialogDescription>{accessTarget.active ? `${accessTarget.displayName} will lose access to NIQ administration and their active sessions will be signed out.` : `${accessTarget.displayName} will regain access to NIQ administration.`}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel isDisabled={accessBusy}>Cancel</AlertDialogCancel><AlertDialogAction variant={accessTarget.active ? "destructive" : "default"} isDisabled={accessBusy} onPress={changeAccess}>{accessBusy ? "Saving…" : accessTarget.active ? "Disable" : "Enable"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>}
  </>;
}
