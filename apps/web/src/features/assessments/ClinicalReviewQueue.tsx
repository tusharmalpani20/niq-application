import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthenticatedUser, ClinicalReviewQueue as Queue, ClinicalReviewQueueItem } from "@niq/application-contracts";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { clinicalReviewLabels, listClinicalReviews } from "./clinical-review-api";

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
    { id: "stage", header: "Stage", cell: ({ row }) => clinicalReviewLabels[row.original.review.state] },
    { id: "owner", header: "Assigned to", cell: ({ row }) => row.original.review.correctionPerson ? `Corrections: ${row.original.review.correctionPerson.displayName}` : row.original.review.assignee ? `Reviewer: ${row.original.review.assignee.displayName}` : "Awaiting reviewer" },
    { id: "sent", header: "Sent for review", cell: ({ row }) => row.original.review.submittedAt ? new Date(row.original.review.submittedAt).toLocaleDateString("en-GB") : "—" },
  ];
  const empty = <div className="table-empty-content">{loading ? <p role="status">Loading clinical reviews…</p> : error ? <><p role="alert">{error}</p><Button variant="outline" onPress={() => setRetry(value => value + 1)}>Retry</Button></> : <p>No clinical reviews match these filters.</p>}</div>;
  return <div className="space-y-4">
    <section className="surface table-surface"><div className="overflow-x-auto p-5"><DataTable columns={columns} data={data?.items ?? []} label="Clinical reviews" emptyContent={empty} /></div></section>
    {!!data?.total && <div className="flex items-center justify-center gap-3"><Button variant="outline" size="sm" isDisabled={loading || page <= 1} onPress={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground" role="status">Page {page} of {Math.ceil(data.total / data.pageSize)} · {data.total} total</span><Button variant="outline" size="sm" isDisabled={loading || page * data.pageSize >= data.total} onPress={() => setPage(value => value + 1)}>Next</Button></div>}
  </div>;
}
