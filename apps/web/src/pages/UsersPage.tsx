import { useMemo, useState } from "react";
import { users } from "../lib/demo-data";
import { Icon } from "../lib/icons";
import { EmptyState, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";

export function UsersPage() {
  const [query, setQuery] = useState(""); const [invite, setInvite] = useState(false);
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <><PageHeader eyebrow="Access management" title="Users" description="Invite and manage people who can access your organization." action={<button className="btn btn-primary" onClick={() => setInvite(!invite)}><Icon name="plus" size={18}/>Invite user</button>}/>
    <section className="surface seat-panel"><div><span className="page-eyebrow">User allowance</span><strong>74 of 100 seats used</strong><p>70 active users and 4 pending invitations count toward the limit.</p></div><div className="seat-chart"><div style={{width:"74%"}}/><span>26 seats available</span></div></section>
    {invite && <section className="surface inline-form"><div className="section-heading"><div><p className="page-eyebrow">Invite user</p><h2>Send a secure invitation</h2></div><button className="text-button" onClick={() => setInvite(false)}>Cancel</button></div><form><div className="field-grid three"><label>Work email<input type="email" placeholder="name@hospital.org" required/></label><label>Access level<select><option>Medical user</option><option>Organization admin</option></select></label><label>Facility<select><option>All facilities</option><option>Chennai Central</option><option>Hyderabad</option><option>Bengaluru</option></select></label></div><div className="form-actions"><button type="button" className="btn btn-primary">Send invitation</button></div></form></section>}
    <section className="surface table-surface"><div className="toolbar"><label className="search-control"><Icon name="search" size={18}/><span className="sr-only">Search users</span><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search by name or email"/></label><select aria-label="Filter by status"><option>All statuses</option><option>Active</option><option>Invited</option></select></div>
      {filtered.length ? <div className="responsive-table"><table><thead><tr><th>User</th><th>Access</th><th>Facility</th><th>MFA</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((user)=><tr key={user.email}><td><div className="person-cell"><div className="avatar avatar-small">{user.name.split(" ").map(v=>v[0]).join("")}</div><div><strong>{user.name}</strong><span>{user.email}</span></div></div></td><td>{user.role}</td><td>{user.facility}</td><td>{user.mfa ? "Enabled" : "Not set up"}</td><td><StatusBadge status={user.status}/></td><td><button className="text-button">Manage</button></td></tr>)}</tbody></table></div> : <EmptyState title="No users found" description="Try a different name or email."/>}
    </section>
  </>;
}
