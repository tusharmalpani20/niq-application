import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "../components/Page";
import { RouterButtonLink } from "../components/RouterButtonLink";
import { StatusBadge } from "../components/StatusBadge";
import { assessments, patients } from "../lib/demo-data";
import { Icon } from "../lib/icons";

export function AssessmentsPage() {
  const [query, setQuery] = useState(""); const [tab, setTab] = useState("All");
  const visible = useMemo(()=>assessments.filter((a)=>(tab==="All" || a.status===tab) && `${a.id} ${a.patient} ${a.facility}`.toLowerCase().includes(query.toLowerCase())),[query,tab]);
  return <><PageHeader eyebrow="Clinical workflow" title="Assessments" description="Review assessment progress and scoring status." action={<RouterButtonLink to="/assessments/new"><Icon name="plus" size={18}/>Start assessment</RouterButtonLink>}/>
    <section className="surface queue-surface"><Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))} className="gap-0 p-3 pb-0"><TabsList aria-label="Assessment status" className="w-full">{["All","Pending scoring","Under review","Completed"].map((value)=><TabsTrigger className="text-foreground/80" id={value} key={value}>{value}</TabsTrigger>)}</TabsList><TabsContent id={tab}>
        <div className="toolbar"><InputGroup className="max-w-md"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="Search assessments" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search patient, assessment or facility"/></InputGroup></div>
        <div className="assessment-list">{visible.length ? visible.map((item)=><Link className="assessment-card" to={`/assessments/${item.id}`} key={item.id}><div className="assessment-card-head"><div><span className="record-id">{item.id}</span><h2>{item.patient}</h2><p>{item.facility} · {item.date}</p></div><StatusBadge status={item.status}/></div><div className="assessment-card-foot"><span>Scoring version</span><strong>{item.version}</strong><Icon name="chevron" size={18}/></div></Link>) : <EmptyState title="No assessments found" description="Try another search or queue."/>}</div>
      </TabsContent></Tabs>
    </section></>;
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
