import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { users } from "../lib/demo-data";
import { Icon } from "../lib/icons";
import { EmptyState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";

export function UsersPage() {
  const [query, setQuery] = useState(""); const [invite, setInvite] = useState(false);
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const columns: Array<DataTableColumn<(typeof users)[number]>> = [
    { id: "user", header: "User", cell: ({ row }) => <div className="person-cell"><Avatar className="size-8"><AvatarFallback>{row.original.name.split(" ").map((value) => value[0]).join("")}</AvatarFallback></Avatar><div><strong>{row.original.name}</strong><span>{row.original.email}</span></div></div> },
    { accessorKey: "role", header: "Access" }, { accessorKey: "facility", header: "Facility" },
    { id: "mfa", header: "MFA", cell: ({ row }) => row.original.mfa ? "Enabled" : "Not set up" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, cell: () => <Button variant="link" size="sm">Manage</Button> },
  ];
  return <><PageHeader eyebrow="Access management" title="Users" description="Invite and manage people who can access your organization." action={<Button onPress={() => setInvite(!invite)}><Icon name="plus" size={18}/>Invite user</Button>}/>
    <Card className="surface seat-panel"><div><span className="page-eyebrow">User allowance</span><strong>74 of 100 seats used</strong><p>70 active users and 4 pending invitations count toward the limit.</p></div><div><Progress value={74} aria-label="74 of 100 seats used"/><span className="mt-2 block text-xs text-muted-foreground">26 seats available</span></div></Card>
    {invite && <Card className="surface inline-form"><div className="section-heading"><div><p className="page-eyebrow">Invite user</p><h2>Send a secure invitation</h2></div><Button variant="link" onPress={() => setInvite(false)}>Cancel</Button></div><form><div className="field-grid three"><Field><FieldLabel>Email</FieldLabel><Input type="email" placeholder="name@hospital.org" required/></Field><Field><FieldLabel>Access level</FieldLabel><NativeSelect className="w-full"><NativeSelectOption>Medical user</NativeSelectOption><NativeSelectOption>Organization admin</NativeSelectOption></NativeSelect></Field><Field><FieldLabel>Facility</FieldLabel><NativeSelect className="w-full"><NativeSelectOption>All facilities</NativeSelectOption><NativeSelectOption>Chennai Central</NativeSelectOption><NativeSelectOption>Hyderabad</NativeSelectOption><NativeSelectOption>Bengaluru</NativeSelectOption></NativeSelect></Field></div><div className="form-actions"><Button type="button">Send invitation</Button></div></form></Card>}
    <section className="surface table-surface"><div className="toolbar"><InputGroup className="max-w-sm"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="Search users" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search by name or email"/></InputGroup><NativeSelect aria-label="Filter by status"><NativeSelectOption>All statuses</NativeSelectOption><NativeSelectOption>Active</NativeSelectOption><NativeSelectOption>Invited</NativeSelectOption></NativeSelect></div>
      {filtered.length ? <DataTable columns={columns} data={filtered} /> : <EmptyState title="No users found" description="Try a different name or email."/>}
    </section>
  </>;
}
