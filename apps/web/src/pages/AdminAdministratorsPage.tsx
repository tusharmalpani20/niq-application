import { type AuthenticatedUser, type PlatformAdministrator } from "@niq/application-contracts";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { DataTableColumn } from "../components/DataTable";
import { AdministratorInvitationDialog } from "../components/AdministratorInvitationDialog";
import { DateDisplay } from "../components/DateDisplay";
import { StatusBadge } from "../components/StatusBadge";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "../components/DataTable";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/Page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiRequestError, listPlatformAdministrators, setPlatformAdministratorActive } from "../lib/api";

type AdministratorUser = Extract<PlatformAdministrator, { kind: "USER" }>;
type AdministratorInvitation = Extract<PlatformAdministrator, { kind: "INVITATION" }>;
const pageSize = 10;

function OwnAccountLabel() {
  return <TooltipTrigger><Button variant="ghost" size="sm" aria-label="Your account. You cannot disable your own account.">Your account</Button><Tooltip>You cannot disable your own account.</Tooltip></TooltipTrigger>;
}

export function AdminAdministratorsPage() {
  const { user: currentUser } = useOutletContext<{ user: AuthenticatedUser }>();
  const [administrators, setAdministrators] = useState<PlatformAdministrator[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showInvite, setShowInvite] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"users" | "invitations">("users");
  const [accessTarget, setAccessTarget] = useState<AdministratorUser | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [invitationPage, setInvitationPage] = useState(1);
  const [search, setSearch] = useState("");
  const load = useCallback(() => {
    setState("loading");
    listPlatformAdministrators().then((items) => { setAdministrators(items); setState("ready"); }).catch(() => setState("error"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const users = administrators.filter((item): item is AdministratorUser => item.kind === "USER");
  const pendingInvitations = administrators.filter((item): item is AdministratorInvitation => item.kind === "INVITATION");
  const normalizedSearch = search.trim().toLowerCase();
  const showInvitationPrompt = selectedTab === "invitations" && pendingInvitations.length === 0 && !normalizedSearch;
  const filteredUsers = normalizedSearch ? users.filter((item) => `${item.displayName} ${item.email}`.toLowerCase().includes(normalizedSearch)) : users;
  const filteredInvitations = normalizedSearch ? pendingInvitations.filter((item) => item.email.toLowerCase().includes(normalizedSearch)) : pendingInvitations;
  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const invitationPageCount = Math.max(1, Math.ceil(filteredInvitations.length / pageSize));
  const visibleUsers = filteredUsers.slice((userPage - 1) * pageSize, userPage * pageSize);
  const visibleInvitations = filteredInvitations.slice((invitationPage - 1) * pageSize, invitationPage * pageSize);

  async function changeAccess() {
    if (!accessTarget || accessTarget.userId === currentUser.userId) return;
    setAccessBusy(true);
    setAccessMessage(null);
    try {
      const updated = await setPlatformAdministratorActive(accessTarget.membershipId, !accessTarget.active);
      setAdministrators((current) => current.map((item) => item.kind === "USER" && item.userId === accessTarget.userId ? updated : item));
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
  const invitationColumns: Array<DataTableColumn<AdministratorInvitation>> = [
    { id: "administrator", header: "Invitee", cell: ({ row }) => <strong>{row.original.email}</strong> },
    { id: "expires", header: "Expires", cell: ({ row }) => <DateDisplay value={row.original.expiresAt} /> },
  ];

  return <>
    <PageHeader title="Administrators" />
    {state === "loading" ? <section className="surface"><LoadingState label="Loading administrators" /></section> : state === "error" ? <ErrorState retry={load} /> : <div className="grid gap-4">
      {accessMessage && <Alert variant="destructive"><AlertDescription>{accessMessage}</AlertDescription></Alert>}
      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as "users" | "invitations")} className="gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b">
          <TabsList variant="line" aria-label="Administrator management" className="gap-5 p-0">
            <TabsTrigger id="users" className="rounded-none border-0 px-1 pb-3 text-foreground/75 shadow-none after:bg-primary data-selected:text-primary">Users <Badge variant="secondary" className="px-1.5 py-0 text-xs tabular-nums">{users.length}</Badge></TabsTrigger>
            <TabsTrigger id="invitations" className="rounded-none border-0 px-1 pb-3 text-foreground/75 shadow-none after:bg-primary data-selected:text-primary">Pending invitations <Badge variant="secondary" className="px-1.5 py-0 text-xs tabular-nums">{pendingInvitations.length}</Badge></TabsTrigger>
          </TabsList>
          <div className="mb-2 flex flex-1 items-center justify-end gap-2">
            <InputGroup className="h-10 max-w-72"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput value={search} onChange={(event) => { setSearch(event.target.value); setUserPage(1); setInvitationPage(1); }} placeholder={selectedTab === "users" ? "Search administrators..." : "Search invitations..."} aria-label={selectedTab === "users" ? "Search administrators" : "Search invitations"} /></InputGroup>
            {!showInvitationPrompt && <TooltipTrigger><Button size="icon-lg" className="size-10 shrink-0" aria-label="Invite administrator" onPress={() => setShowInvite(true)}><Plus aria-hidden="true" /></Button><Tooltip>Invite administrator</Tooltip></TooltipTrigger>}
          </div>
        </div>
        <TabsContent id="users" className="grid gap-4"><section className="surface table-surface">{filteredUsers.length === 0 ? <EmptyState title={normalizedSearch ? "No matching administrators" : "No administrators"} description={normalizedSearch ? "Try a different search." : "Invite an administrator to help manage this application."} /> : <><div className="desktop-table p-5"><DataTable columns={userColumns} data={visibleUsers} label="NIQ administrators" /></div><div className="mobile-card-list">{visibleUsers.map((administrator) => <article className="mobile-data-card" key={administrator.userId}><div><strong>{administrator.displayName}{administrator.userId === currentUser.userId ? " (you)" : ""}</strong><span>{administrator.email}</span></div><div className="flex items-center justify-between gap-3">{administrator.active ? <StatusBadge status="Active" /> : <Badge variant="secondary">Disabled</Badge>}{administrator.userId === currentUser.userId ? <OwnAccountLabel /> : <Button variant="outline" size="sm" onPress={() => setAccessTarget(administrator)}>{administrator.active ? "Disable" : "Enable"}</Button>}</div></article>)}</div></>}</section>{filteredUsers.length > 0 && <Pagination aria-label="Administrators pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={userPage === 1} onPress={() => setUserPage((page) => page - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {userPage} of {userPageCount} · {filteredUsers.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={userPage === userPageCount} onPress={() => setUserPage((page) => page + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}</TabsContent>
        <TabsContent id="invitations" className="grid gap-4">
          <section className="surface table-surface">
            {filteredInvitations.length === 0 ? (normalizedSearch ? <EmptyState title="No matching invitations" description="Try a different search." icon={null} className="min-h-32" /> : <div className="flex min-h-32 items-center justify-center p-6"><Button variant="outline" onPress={() => setShowInvite(true)}><Plus aria-hidden="true" />Invite a colleague</Button></div>) : <><div className="desktop-table p-5"><DataTable columns={invitationColumns} data={visibleInvitations} label="Pending administrator invitations" /></div><div className="mobile-card-list">{visibleInvitations.map((invitation) => <article className="mobile-data-card" key={invitation.invitationId}><strong>{invitation.email}</strong><div className="flex items-center justify-between gap-3"><Badge variant="secondary">Pending</Badge><span>Expires <DateDisplay value={invitation.expiresAt} /></span></div></article>)}</div></>}
          </section>
          {filteredInvitations.length > 0 && <Pagination aria-label="Invitations pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={invitationPage === 1} onPress={() => setInvitationPage((page) => page - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {invitationPage} of {invitationPageCount} · {filteredInvitations.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={invitationPage === invitationPageCount} onPress={() => setInvitationPage((page) => page + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
        </TabsContent>
      </Tabs>
    </div>}
    <AdministratorInvitationDialog open={showInvite} onClose={() => setShowInvite(false)} onCreated={load} />
    {accessTarget && <AlertDialog ariaLabel={accessTarget.active ? "Disable administrator" : "Enable administrator"} isOpen onOpenChange={(open) => { if (!open && !accessBusy) setAccessTarget(null); }} isDismissable={!accessBusy}>
      <AlertDialogHeader><AlertDialogMedia><AlertTriangle /></AlertDialogMedia><AlertDialogTitle>{accessTarget.active ? "Disable administrator?" : "Enable administrator?"}</AlertDialogTitle><AlertDialogDescription>{accessTarget.active ? `${accessTarget.displayName} will lose access to NIQ administration and their active sessions will be signed out.` : `${accessTarget.displayName} will regain access to NIQ administration.`}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel isDisabled={accessBusy}>Cancel</AlertDialogCancel><AlertDialogAction variant={accessTarget.active ? "destructive" : "default"} isDisabled={accessBusy} onPress={changeAccess}>{accessBusy ? "Saving…" : accessTarget.active ? "Disable" : "Enable"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialog>}
  </>;
}
