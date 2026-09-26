import { hasPermission } from "@niq/application-contracts";
import type { AssessmentSummary, AuthenticatedUser, Patient } from "@niq/application-contracts";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { listAssessments, listPatients } from "../lib/api";

type SearchResult = { key: string; kind: "Patient" | "Assessment"; title: string; detail: string; to: string };

export function WorkspaceSearch({ user, onNavigate }: { user: AuthenticatedUser; onNavigate: (to: string) => void }) {
  const canReadPatients = hasPermission(user.role, "patients.read");
  const canReadAssessments = hasPermission(user.role, "assessments.read");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const showResults = open && Boolean(query.trim());

  useEffect(() => {
    if (!showResults) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    Promise.allSettled([
      canReadPatients ? listPatients(user.organizationId) : Promise.resolve([]),
      canReadAssessments ? listAssessments(user.organizationId) : Promise.resolve([]),
    ]).then(([patientResult, assessmentResult]) => {
      if (!active) return;
      setPatients(patientResult.status === "fulfilled" ? patientResult.value : []);
      setAssessments(assessmentResult.status === "fulfilled" ? assessmentResult.value : []);
      setFailed(patientResult.status === "rejected" || assessmentResult.status === "rejected");
      setLoading(false);
    });
    return () => { active = false; };
  }, [showResults, user.organizationId, canReadPatients, canReadAssessments]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    const matches = (values: Array<string | undefined>) => values.some(value => value?.toLocaleLowerCase().includes(term));
    const patientResults: SearchResult[] = patients.filter(patient => matches([patient.displayName, patient.reference, patient.medicalRecordNumber])).map(patient => ({
      key: `patient-${patient.id}`, kind: "Patient", title: patient.displayName, detail: `${patient.reference} · ${patient.homeFacility?.name ?? "No facility"}`, to: `/patients/${patient.reference}`,
    }));
    const assessmentResults: SearchResult[] = assessments.filter(assessment => matches([assessment.reference, assessment.patient.displayName, assessment.patient.reference])).map(assessment => ({
      key: `assessment-${assessment.id}`, kind: "Assessment", title: assessment.reference, detail: `${assessment.patient.displayName} · ${assessment.patient.reference}`, to: `/assessments/${assessment.reference}`,
    }));
    return [...patientResults, ...assessmentResults];
  }, [query, patients, assessments]);

  function select(to: string) {
    setOpen(false);
    setQuery("");
    onNavigate(to);
  }

  return <div className="relative min-w-0 max-w-sm flex-1" ref={rootRef}>
    <div className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-border/80 bg-background/70 px-3 transition-colors focus-within:border-primary/60 focus-within:bg-background">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input ref={inputRef} type="text" inputMode="search" aria-label="Search patients and assessments" aria-autocomplete="list" aria-expanded={showResults} aria-controls={showResults ? "workspace-search-results" : undefined} aria-activedescendant={showResults && !loading && results[activeIndex] ? `workspace-search-result-${activeIndex}` : undefined} role="combobox" value={query} onFocus={() => { if (query.trim()) setOpen(true); }} onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(Boolean(event.target.value.trim())); }} onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
        if (event.key === "ArrowDown" && showResults && results.length) { event.preventDefault(); setActiveIndex(index => (index + 1) % results.length); }
        if (event.key === "ArrowUp" && showResults && results.length) { event.preventDefault(); setActiveIndex(index => (index - 1 + results.length) % results.length); }
        if (event.key === "Enter" && showResults && results[activeIndex]) { event.preventDefault(); select(results[activeIndex].to); }
      }} placeholder="Search patients or assessments" className="w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground" style={{ border: 0, boxShadow: "none", outline: "none", padding: 0 }} />
      {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>}
    </div>
    {showResults && <div className="absolute left-1/2 top-[calc(100%+.5rem)] z-50 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-lg" id="workspace-search-results" role="listbox" aria-label="Search results">
      {loading ? <p className="px-3 py-3 text-sm text-muted-foreground">Searching accessible records…</p>
        : <>
            {failed && <p className="px-3 py-2 text-xs text-destructive">Some records could not be loaded. Try reopening search.</p>}
            {!results.length && <p className="px-3 py-3 text-sm text-muted-foreground">{failed ? "No matches in the records that loaded." : "No matching records found."}</p>}
            <div className="max-h-80 overflow-y-auto">{results.map((result, index) => <button key={result.key} id={`workspace-search-result-${index}`} role="option" aria-selected={index === activeIndex} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result.to)} className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-primary/10 ${index === activeIndex ? "bg-primary/5" : ""}`}><span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.detail}</span></span><span className="shrink-0 text-xs text-muted-foreground">{result.kind}</span></button>)}</div>
          </>}
    </div>}
  </div>;
}
