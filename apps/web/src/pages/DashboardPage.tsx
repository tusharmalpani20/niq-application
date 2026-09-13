import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { assessments } from "../lib/demo-data";
import { Icon } from "../lib/icons";
import { PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";

export function DashboardPage() {
  return <><PageHeader eyebrow="Saturday, 13 September" title="Good morning, Ananya" description="Here is what needs attention across your organization today." action={<RouterButtonLink to="/assessments/new"><Icon name="plus" size={18} />Start assessment</RouterButtonLink>} />
    <section className="metric-grid" aria-label="Organization summary">
      <Card className="metric-card"><span>Active patients</span><strong>248</strong><em>Across 3 facilities</em></Card>
      <Card className="metric-card"><span>Assessments this month</span><strong>84</strong><em>12 awaiting review</em></Card>
      <Card className="metric-card"><span>Scoring status</span><strong className="metric-word">Connected</strong><em>Draft rules · India</em></Card>
      <Card className="metric-card"><span>Active users</span><strong>70 <small>/ 100</small></strong><em>4 invitations pending</em></Card>
    </section>
    <div className="dashboard-grid"><section className="surface"><div className="section-heading"><div><p className="page-eyebrow">Clinical queue</p><h2>Needs attention</h2></div><Link to="/assessments">View all</Link></div>
      <div className="compact-list">{assessments.slice(0,3).map((item) => <Link to={`/assessments/${item.id}`} className="compact-row" key={item.id}><div className="list-avatar">{item.patient.slice(-2)}</div><div className="row-primary"><strong>{item.patient}</strong><span>{item.id} · {item.facility}</span></div><StatusBadge status={item.status}/><Icon name="chevron" size={17}/></Link>)}</div>
    </section><aside className="surface"><div className="section-heading"><div><p className="page-eyebrow">Service health</p><h2>Clinical services</h2></div></div>
      <div className="health-list"><div><span className="health-ok"/><strong>Scoring platform</strong><em>Available</em></div><div><span className="health-ok"/><strong>Face scan</strong><em>Available</em></div><div><span className="health-warn"/><strong>Clinical rules</strong><em>Draft only</em></div></div>
      <Alert><Icon name="alert"/><AlertTitle>Draft scoring rules</AlertTitle><AlertDescription>Results are for development and must not guide clinical care.</AlertDescription></Alert>
    </aside></div>
  </>;
}
