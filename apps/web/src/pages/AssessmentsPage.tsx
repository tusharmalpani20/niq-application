import type { AssessmentSummary, AuthenticatedUser, Facility } from "@niq/application-contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { listAssessments, listFacilities } from "../lib/api";
import { assessments, patients } from "../lib/demo-data";
import { Icon } from "../lib/icons";

import { DateDisplay } from "../components/DateDisplay";
import { assessmentStatusLabels } from "../lib/patient-display";

const assessmentPageSize = 10;
const assessmentDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);

export function AssessmentsPage() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [records, setRecords] = useState<AssessmentSummary[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    Promise.all([listAssessments(user.organizationId), listFacilities(user.organizationId)]).then(([items, facilities]) => { if (active) { setRecords(items); setFacilities(facilities); setLoadState("ready"); } }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, [user.organizationId, reload]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesQuery = !normalizedQuery || `${record.patient.reference} ${record.patient.displayName} ${record.facility?.name ?? ""}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (facility === "all" || record.facility?.id === facility) && (status === "all" || record.status === status);
    });
  }, [facility, query, records, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / assessmentPageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * assessmentPageSize, currentPage * assessmentPageSize);
  const columns: Array<DataTableColumn<AssessmentSummary>> = [
    { id: "patient", header: "Patient", cell: ({ row }) => <div className="grid gap-1"><Link className="text-primary font-semibold" to={`/patients/${row.original.patient.reference}`}>{row.original.patient.displayName}</Link><span className="text-xs text-muted-foreground">{row.original.patient.reference}</span></div> },
    { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "—" },
    { id: "created", header: "Started", cell: ({ row }) => <DateDisplay value={row.original.createdAt} /> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={assessmentStatusLabels[row.original.status]} /> },
  ];
  const hasFilters = query.trim() || facility !== "all" || status !== "all";
  const emptyContent = <div className="table-empty-content">{loadState === "loading" ? <span>Loading assessments…</span> : loadState === "error" ? <><strong>Assessments could not be loaded</strong><Button variant="outline" onPress={() => setReload(value => value + 1)}>Retry</Button></> : hasFilters ? <><strong>No matching assessments</strong><span>Try changing the search or filters.</span></> : <><strong>Create your first assessment</strong><span>Your assessments will appear here.</span><RouterButtonLink to="/assessments/new"><Icon name="plus" size={18} />New assessment</RouterButtonLink></>}</div>;
  return <>
    <h1 className="patient-page-title">Assessments</h1>
    <div className="patient-list-header">
      <div className="patient-list-heading"><span className="patient-list-label">Assessments</span><span>{records.length}</span></div>
      <div className="patient-search-actions"><InputGroup className="h-10"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search assessments" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search assessments…" /></InputGroup><TooltipTrigger><Button className="size-10 shrink-0" size="icon-lg" aria-label="New assessment" onPress={() => navigate("/assessments/new")}><Icon name="plus" size={20}/></Button><Tooltip>New assessment</Tooltip></TooltipTrigger></div>
    </div>
    <div className="patient-filter-bar assessment-filter-bar">
      <Select aria-label="Filter by facility" selectedKey={facility} onSelectionChange={(key) => { setFacility(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All facilities</SelectItem>{facilities.map(item => <SelectItem id={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select aria-label="Filter by status" selectedKey={status} onSelectionChange={(key) => { setStatus(String(key)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem id="all">All statuses</SelectItem>{Object.entries(assessmentStatusLabels).map(([id, label]) => <SelectItem id={id} key={id}>{label}</SelectItem>)}</SelectContent></Select>
    </div>
    <section className="surface table-surface"><div className="mobile-card-list">{visible.length ? visible.map((record) => <article className="mobile-data-card" key={record.id}><div><strong>{record.patient.reference}</strong><span>{record.patient.displayName}</span></div><StatusBadge status={assessmentStatusLabels[record.status]}/><span>{record.facility?.name ?? "No facility"} · {assessmentDate(record.createdAt)}</span></article>) : emptyContent}</div><div className="desktop-table p-5"><DataTable columns={columns} data={visible} label="Assessments" emptyContent={emptyContent} /></div></section>
    {filtered.length > 0 && <Pagination className="mt-4" aria-label="Assessments pagination"><PaginationContent><PaginationItem><Button variant="outline" size="sm" isDisabled={loadState !== "ready" || currentPage === 1} onPress={() => setPage(currentPage - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2 text-sm text-muted-foreground" role="status">Page {currentPage} of {pageCount} · {filtered.length} total</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" isDisabled={loadState !== "ready" || currentPage === pageCount} onPress={() => setPage(currentPage + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination>}
  </>;
}

export function StartAssessmentPage() {
  const [step, setStep] = useState(0); const [scanStatus, setScanStatus] = useState<"ready"|"checking"|"manual">("ready");
  const steps = ["Patient", "Measurements", "Questionnaire", "Review"];
  function tryScan(){ setScanStatus("checking"); window.setTimeout(()=>setScanStatus("manual"),700); }
  return <><PageHeader eyebrow="New assessment" title={steps[step]!} description="Draft questionnaire · not approved for clinical use"/>
    <div className="progress-surface"><div className="stepper">{steps.map((label,index)=><Button variant={index===step ? "default" : "ghost"} key={label} className={index<step ? "complete":undefined} onPress={()=>setStep(index)}><span>{index<step ? "✓" : index+1}</span><em>{label}</em></Button>)}</div></div>
    <Card className="surface assessment-form"><Alert className="rounded-none border-x-0 border-t-0"><Icon name="alert" size={18}/><AlertTitle>Development questionnaire</AlertTitle><AlertDescription>Fields and scoring may change after clinical approval.</AlertDescription></Alert>
      {step===0 && <div className="form-content"><p className="section-kicker">Select patient</p><RadioGroup name="patient" defaultValue={patients[0]?.id} className="choice-grid">{patients.map((patient)=><FieldLabel className="choice-card has-data-selected:border-primary has-data-selected:bg-primary/5" key={patient.id}><RadioGroupItem value={patient.id}/><span><strong>{patient.displayName}</strong><em>{patient.reference} · {patient.age} years · {patient.facility}</em></span></FieldLabel>)}</RadioGroup></div>}
      {step===1 && <div className="form-content"><p className="section-kicker">Automated measurement capture</p><div className="scan-card"><div className="scan-visual"><span className="face-outline">◎</span></div><div><h2>{scanStatus==="checking" ? "Checking face-scan service…" : scanStatus==="manual" ? "Face scan unavailable" : "Ready for face scan"}</h2><p>{scanStatus==="manual" ? "The service could not be reached. Required measurements are shown below automatically; the clinician does not choose the source." : "NIQ will attempt a secure face scan before showing manual fallback fields."}</p>{scanStatus==="ready" && <Button onPress={tryScan}>Start secure scan</Button>}</div></div>{scanStatus==="manual" && <div className="fallback-fields"><Alert><Icon name="alert"/><AlertTitle>Automated manual fallback</AlertTitle><AlertDescription>Measurement provenance will be recorded automatically.</AlertDescription></Alert><div className="field-grid"><Field><FieldLabel>Height (cm)</FieldLabel><Input type="number" inputMode="decimal"/></Field><Field><FieldLabel>Weight (kg)</FieldLabel><Input type="number" inputMode="decimal"/></Field></div></div>}</div>}
      {step===2 && <div className="form-content"><p className="section-kicker">Nutrition screening</p><div className="question-block"><h2>Has food intake reduced during the past week?</h2><p>Select the observation reported during the assessment.</p><RadioGroup name="intake" className="option-row" orientation="horizontal">{["No change","Some reduction","Significant reduction"].map((value)=><FieldLabel className="rounded-full border px-4 py-2 has-data-selected:border-primary has-data-selected:bg-primary has-data-selected:text-primary-foreground" key={value}><RadioGroupItem className="sr-only" value={value}/><span>{value}</span></FieldLabel>)}</RadioGroup></div><div className="question-block"><h2>Has the patient experienced unplanned weight loss?</h2><RadioGroup name="loss" className="option-row" orientation="horizontal">{["No","Yes","Unknown"].map((value)=><FieldLabel className="rounded-full border px-4 py-2 has-data-selected:border-primary has-data-selected:bg-primary has-data-selected:text-primary-foreground" key={value}><RadioGroupItem className="sr-only" value={value}/><span>{value}</span></FieldLabel>)}</RadioGroup></div></div>}
      {step===3 && <div className="form-content"><div className="review-hero"><span className="review-icon"><Icon name="check" size={28}/></span><h2>Ready to save</h2><p>The assessment will be saved before scoring is requested. If scoring is unavailable, it can be retried later.</p></div><dl className="definition-grid"><div><dt>Patient</dt><dd>Patient NIQ-1042</dd></div><div><dt>Facility</dt><dd>Chennai Central</dd></div><div><dt>Scoring version</dt><dd>Latest assigned draft</dd></div><div><dt>Clinical status</dt><dd>Not approved</dd></div></dl></div>}
      <div className="assessment-actions"><Button variant="outline" isDisabled={step===0} onPress={()=>setStep(Math.max(0,step-1))}>Back</Button>{step<3 ? <Button onPress={()=>setStep(step+1)}>Continue <Icon name="arrow" size={17}/></Button> : <Button>Save and request score</Button>}</div>
    </Card></>;
}

export function AssessmentDetailPage() {
  const { assessmentId }=useParams(); const item=assessments.find(a=>a.id===assessmentId)??assessments[0]!;
  return <><div className="breadcrumb"><Link to="/assessments">Assessments</Link><span>/</span><span>{item.id}</span></div><PageHeader eyebrow={item.id} title={item.patient} description={`${item.facility} · ${item.date}`} action={<StatusBadge status={item.status}/>}/>
    {item.status==="Scoring unavailable" && <Alert variant="destructive"><Icon name="alert"/><AlertTitle>Scoring is currently unavailable</AlertTitle><AlertDescription>The completed assessment is safely stored. Retry when the service is restored.</AlertDescription><Button variant="outline" size="sm">Retry scoring</Button></Alert>}
    {item.status==="Pending scoring" && <Alert><Icon name="clock"/><AlertTitle>Waiting for a scoring result</AlertTitle><AlertDescription>You can leave this page. The assessment will update when processing completes.</AlertDescription></Alert>}
    <div className="detail-grid"><Card className="surface"><div className="section-heading"><div><p className="page-eyebrow">Assessment data</p><h2>Recorded responses</h2></div><Button variant="link">View audit history</Button></div><dl className="definition-grid"><div><dt>Questionnaire</dt><dd>Nutrition screening draft</dd></div><div><dt>Measurement source</dt><dd>Automated face scan</dd></div><div><dt>Food intake</dt><dd>Some reduction</dd></div><div><dt>Weight loss</dt><dd>Not recorded</dd></div></dl></Card><Card className="surface"><div className="section-heading"><div><p className="page-eyebrow">Score record</p><h2>Traceability</h2></div></div><dl className="stacked-definition"><div><dt>Rule version</dt><dd>{item.version}</dd></div><div><dt>Clinical approval</dt><dd><span className="draft-label">Draft — not approved</span></dd></div><div><dt>Result stored</dt><dd>{item.status==="Completed"||item.status==="Under review" ? item.date : "Not yet"}</dd></div></dl></Card></div>
  </>;
}
