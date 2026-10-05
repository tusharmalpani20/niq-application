import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthenticatedUser, ClinicalReviewQueue as Queue, ClinicalReviewQueueItem } from "@niq/application-contracts";
import { Eye, Star, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { ClinicalReviewEmptyIllustration } from "@/components/ClinicalReviewEmptyIllustration";
import { RouterButtonLink } from "@/components/RouterButtonLink";
import { StatusBadge } from "@/components/StatusBadge";
import { AssessmentRequestError } from "./workflow-api";
import { changeClinicalReview, clinicalReviewLabels, listClinicalReviews } from "./clinical-review-api";
import { setAssessmentPriority } from "@/lib/api";
import { useWorkspaceRevision } from "../notifications/useWorkspaceRevision";

const reviewStage = (item: ClinicalReviewQueueItem) => item.review.state === "RETURNED" && !item.review.submittedAt ? "Reopened for corrections" : clinicalReviewLabels[item.review.state];
const reviewOwner = (item: ClinicalReviewQueueItem) => item.review.correctionPerson ? `Corrections: ${item.review.correctionPerson.displayName}` : item.review.assignee ? `Reviewer: ${item.review.assignee.displayName}` : "Awaiting reviewer";
const reviewDate = (item: ClinicalReviewQueueItem) => item.review.submittedAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.review.submittedAt)) : "—";
const openReview = (item: ClinicalReviewQueueItem) => <RouterButtonLink variant="outline" size="sm" className="whitespace-nowrap" to={`/assessments/${item.reference}`} aria-label={`View review ${item.reference}`}><Eye className="size-4" aria-hidden="true" />View review</RouterButtonLink>;

function ClinicalReviewSkeleton() {
  return <section className="surface table-surface" role="status" aria-label="Loading clinical reviews">
    <span className="sr-only">Loading clinical reviews…</span>
    <div className="mobile-card-list" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <article className="mobile-data-card list-mobile-card assessment-mobile-card" key={index}>
      <div className="mobile-card-heading"><div className="mobile-card-primary flex-1"><Skeleton className="h-4 w-28 motion-reduce:animate-none" /><Skeleton className="h-4 w-36 max-w-full motion-reduce:animate-none" /><Skeleton className="h-3 w-16 motion-reduce:animate-none" /></div><div className="mobile-card-actions"><Skeleton className="size-8 motion-reduce:animate-none" /></div></div>
      <Skeleton className="h-6 w-28 rounded-full motion-reduce:animate-none" />
      <Skeleton className="h-3 w-44 max-w-full motion-reduce:animate-none" />
      <Skeleton className="h-3 w-32 motion-reduce:animate-none" />
      <div className="assessment-card-footer"><Skeleton className="h-8 w-36 motion-reduce:animate-none" /><Skeleton className="h-8 w-20 motion-reduce:animate-none" /></div>
    </article>)}</div>
    <div className="desktop-table p-5" aria-hidden="true"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Assessment</th><th>Patient</th><th>Facility</th><th>Stage</th><th>Assigned to</th><th>Sent for review</th><th className="text-right">Actions</th></tr></thead><tbody>{Array.from({ length: 6 }, (_, index) => <tr key={index}>
      <td><Skeleton className="h-4 w-28 motion-reduce:animate-none" /></td>
      <td><div className="grid gap-2"><Skeleton className="h-4 w-32 motion-reduce:animate-none" /><Skeleton className="h-3 w-16 motion-reduce:animate-none" /></div></td>
      <td><Skeleton className="h-4 w-24 motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-6 w-28 rounded-full motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-4 w-32 motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-4 w-20 motion-reduce:animate-none" /></td>
      <td><div className="flex justify-end gap-2"><Skeleton className="h-8 w-24 motion-reduce:animate-none" /><Skeleton className="size-8 motion-reduce:animate-none" /></div></td>
    </tr>)}</tbody></table></div></div>
  </section>;
}

export function ClinicalReviewQueue({ user, query, facilityId, state, risk, canCreate, onPriorityChange, onViewAssessments }: { user: AuthenticatedUser; query: string; facilityId: string; state: string; risk: string; canCreate: boolean; onPriorityChange: (assessmentId: string, isPriority: boolean) => void; onViewAssessments: () => void }) {
  const workspaceRevision = useWorkspaceRevision(["assessment", "patient", "facility"]);
  const [data, setData] = useState<Queue | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState("");
  const [priorityBusy, setPriorityBusy] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState("");
  const claimKeys = useRef(new Map<string, string>());
  const claim = async (item: ClinicalReviewQueueItem) => {
    setClaiming(item.assessmentId); setClaimError("");
    const key = claimKeys.current.get(item.assessmentId) ?? crypto.randomUUID();
    claimKeys.current.set(item.assessmentId, key);
    try {
      await changeClinicalReview(user.organizationId, item.assessmentId, { action: "CLAIM", expectedRevision: item.review.revision, expectedScoreRevision: item.review.scoreRevision, requestKey: key });
      claimKeys.current.delete(item.assessmentId);
      setRetry(value => value + 1);
    } catch (cause) {
      if (cause instanceof AssessmentRequestError && cause.status === 409) {
        claimKeys.current.delete(item.assessmentId);
        setRetry(value => value + 1);
      }
      setClaimError(cause instanceof Error ? cause.message : "Could not claim this review. Please try again.");
    } finally { setClaiming(null); }
  };
  const togglePriority = async (item: ClinicalReviewQueueItem) => {
    setPriorityBusy(item.assessmentId); setPriorityError("");
    try {
      const next = !item.isPriority;
      await setAssessmentPriority(user.organizationId, item.assessmentId, next);
      setData(previous => previous && { ...previous, items: previous.items.map(current => current.assessmentId === item.assessmentId ? { ...current, isPriority: next } : current) });
      onPriorityChange(item.assessmentId, next);
    } catch (cause) { setPriorityError(cause instanceof Error ? cause.message : "Could not update priority. Please try again."); }
    finally { setPriorityBusy(null); }
  };
  const priorityButton = (item: ClinicalReviewQueueItem) => <Button variant="ghost" size="icon" className={item.isPriority ? "text-amber-600" : "text-muted-foreground"} aria-label={`${item.isPriority ? "Remove priority from" : "Mark as priority"} ${item.reference}`} aria-pressed={item.isPriority} isDisabled={priorityBusy !== null} onPress={() => { void togglePriority(item); }}><Star className={`size-4 ${item.isPriority ? "fill-current" : ""}`} aria-hidden="true" /></Button>;
  const canClaim = (item: ClinicalReviewQueueItem) => item.review.state === "QUEUED" && item.review.allowedActions?.includes("CLAIM");
  const claimButton = (item: ClinicalReviewQueueItem) => canClaim(item) && <Button variant="outline" size="sm" isDisabled={claiming !== null} onPress={() => { void claim(item); }}><UserRoundCheck className="size-4" aria-hidden="true" />{claiming === item.assessmentId ? "Claiming…" : "Claim"}</Button>;
  const reviewActions = (item: ClinicalReviewQueueItem) => <div className="flex items-center justify-end gap-2">{claimButton(item)}{openReview(item)}{priorityButton(item)}</div>;
  useEffect(() => { setPage(1); }, [query, facilityId, state, risk]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (query.trim()) params.set("search", query.trim());
      if (facilityId !== "all") params.set("facilityId", facilityId);
      if (state !== "all") params.set("state", state);
      if (risk !== "all") params.set("risk", risk);
      listClinicalReviews(user.organizationId, params, controller.signal).then(next => { if (!controller.signal.aborted) { setData(next); setError(""); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Clinical reviews could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [user.organizationId, query, facilityId, state, risk, page, retry, workspaceRevision]);
  const columns: DataTableColumn<ClinicalReviewQueueItem>[] = [
    { id: "reference", header: "Assessment", cell: ({ row }) => <Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${row.original.reference}`}>{row.original.reference}</Link> },
    { id: "patient", header: "Patient", cell: ({ row }) => <div className="grid gap-1"><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/patients/${row.original.patient.reference}`}>{row.original.patient.displayName}</Link><span className="text-xs text-muted-foreground">{row.original.patient.reference}</span></div> },
    { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "—" },
    { id: "stage", header: "Stage", cell: ({ row }) => <StatusBadge status={reviewStage(row.original)} /> },
    { id: "owner", header: "Assigned to", cell: ({ row }) => reviewOwner(row.original) },
    { id: "sent", header: "Sent for review", cell: ({ row }) => reviewDate(row.original) },
    { id: "actions", header: () => <span className="block text-right">Actions</span>, cell: ({ row }) => reviewActions(row.original) },
  ];
  const unfilteredEmpty = !error && !data?.total && !query.trim() && facilityId === "all" && state === "all" && risk === "all";
  const empty = <div className={`table-empty-content${unfilteredEmpty ? " illustrated-empty-state" : ""}`}>{error ? <><p role="alert">{error}</p><Button variant="outline" onPress={() => setRetry(value => value + 1)}>Retry</Button></> : unfilteredEmpty ? <><ClinicalReviewEmptyIllustration /><strong>No clinical reviews yet</strong><span>Reviews will appear after an assessment is sent for review.</span><div className="flex flex-wrap justify-center gap-2">{canCreate && <RouterButtonLink to="/assessments/new">New assessment</RouterButtonLink>}<Button variant="outline" onPress={onViewAssessments}>View assessments</Button></div></> : <p>No clinical reviews match these filters.</p>}</div>;
  return <div className="space-y-4">
    {(claimError || priorityError) && <p role="alert" className="text-sm text-destructive">{claimError || priorityError}</p>}
    {loading ? <ClinicalReviewSkeleton /> : <section className="surface table-surface"><div className="mobile-card-list">{data?.items.length ? data.items.map(item => <article className="mobile-data-card list-mobile-card assessment-mobile-card" key={item.assessmentId}><div className="mobile-card-heading"><div className="mobile-card-primary"><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${item.reference}`}>{item.reference}</Link><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/patients/${item.patient.reference}`}>{item.patient.displayName}</Link><span>{item.patient.reference}</span></div><div className="mobile-card-actions">{priorityButton(item)}</div></div><StatusBadge status={reviewStage(item)} /><span>{item.facility?.name ?? "No facility"} · {reviewOwner(item)}</span><span>Sent for review: {reviewDate(item)}</span><div className="assessment-card-footer">{openReview(item)}{canClaim(item) && <div className="assessment-card-secondary">{claimButton(item)}</div>}</div></article>) : empty}</div><div className="desktop-table p-5"><DataTable columns={columns} data={data?.items ?? []} label="Clinical reviews" emptyContent={empty} /></div></section>}
    {!loading && !!data?.total && data.total > data.pageSize && <div className="flex items-center justify-center gap-3"><Button variant="outline" size="sm" isDisabled={page <= 1} onPress={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground" role="status">Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="outline" size="sm" isDisabled={page * data.pageSize >= data.total} onPress={() => setPage(value => value + 1)}>Next</Button></div>}
  </div>;
}
