import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthenticatedUser, ClinicalReviewQueue as Queue, ClinicalReviewQueueItem } from "@niq/application-contracts";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { RouterButtonLink } from "@/components/RouterButtonLink";
import { clinicalReviewLabels, listClinicalReviews } from "./clinical-review-api";

const reviewStage = (item: ClinicalReviewQueueItem) => item.review.state === "RETURNED" && !item.review.submittedAt ? "Reopened for corrections" : clinicalReviewLabels[item.review.state];
const reviewOwner = (item: ClinicalReviewQueueItem) => item.review.correctionPerson ? `Corrections: ${item.review.correctionPerson.displayName}` : item.review.assignee ? `Reviewer: ${item.review.assignee.displayName}` : "Awaiting reviewer";
const reviewDate = (item: ClinicalReviewQueueItem) => item.review.submittedAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.review.submittedAt)) : "—";
const openReview = (item: ClinicalReviewQueueItem) => <RouterButtonLink variant="ghost" size="icon" to={`/assessments/${item.reference}`} aria-label={`Open clinical review ${item.reference}`} title="Open clinical review"><ChevronRight className="size-4" aria-hidden="true" /></RouterButtonLink>;

export function ClinicalReviewQueue({ user, query, state }: { user: AuthenticatedUser; query: string; state: string }) {
  const [data, setData] = useState<Queue | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { setPage(1); }, [query, state]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setData(null);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (query.trim()) params.set("search", query.trim());
      if (state === "mine-active") { params.set("mine", "true"); params.set("state", "IN_REVIEW"); }
      else if (state !== "all") params.set(state === "mine" ? "mine" : "state", state === "mine" ? "true" : state);
      listClinicalReviews(user.organizationId, params, controller.signal).then(next => { if (!controller.signal.aborted) { setData(next); setError(""); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Clinical reviews could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [user.organizationId, query, state, page, retry]);
  const columns: DataTableColumn<ClinicalReviewQueueItem>[] = [
    { id: "reference", header: "Assessment", cell: ({ row }) => <Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${row.original.reference}`}>{row.original.reference}</Link> },
    { id: "patient", header: "Patient", cell: ({ row }) => <div className="grid gap-1"><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/patients/${row.original.patient.reference}`}>{row.original.patient.displayName}</Link><span className="text-xs text-muted-foreground">{row.original.patient.reference}</span></div> },
    { id: "facility", header: "Facility", cell: ({ row }) => row.original.facility?.name ?? "—" },
    { id: "stage", header: "Stage", cell: ({ row }) => <span className="inline-flex rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">{reviewStage(row.original)}</span> },
    { id: "owner", header: "Assigned to", cell: ({ row }) => reviewOwner(row.original) },
    { id: "sent", header: "Sent for review", cell: ({ row }) => reviewDate(row.original) },
    { id: "actions", header: () => <span className="block text-right">Action</span>, cell: ({ row }) => <div className="flex justify-end">{openReview(row.original)}</div> },
  ];
  const empty = <div className="table-empty-content">{loading ? <p role="status">Loading clinical reviews…</p> : error ? <><p role="alert">{error}</p><Button variant="outline" onPress={() => setRetry(value => value + 1)}>Retry</Button></> : <p>No clinical reviews match these filters.</p>}</div>;
  return <div className="space-y-4">
    <section className="surface table-surface"><div className="mobile-card-list">{data?.items.length ? data.items.map(item => <article className="mobile-data-card" key={item.assessmentId}><div><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/assessments/${item.reference}`}>{item.reference}</Link><Link className="font-normal text-primary hover:underline focus-visible:underline" to={`/patients/${item.patient.reference}`}>{item.patient.displayName}</Link><span>{item.patient.reference}</span></div><span className="inline-flex w-fit rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">{reviewStage(item)}</span><span>{item.facility?.name ?? "No facility"} · {reviewOwner(item)}</span><span>Sent for review: {reviewDate(item)}</span><div className="flex justify-end">{openReview(item)}</div></article>) : empty}</div><div className="desktop-table p-5"><DataTable columns={columns} data={data?.items ?? []} label="Clinical reviews" emptyContent={empty} /></div></section>
    {!!data?.total && <div className="flex items-center justify-center gap-3"><Button variant="outline" size="sm" isDisabled={loading || page <= 1} onPress={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground" role="status">Page {page} of {Math.ceil(data.total / data.pageSize)} · {data.total} total</span><Button variant="outline" size="sm" isDisabled={loading || page * data.pageSize >= data.total} onPress={() => setPage(value => value + 1)}>Next</Button></div>}
  </div>;
}
