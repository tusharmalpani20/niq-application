import { Skeleton } from "@/components/ui/skeleton";

export function AssessmentListSkeleton({ showActions, showPatient = true }: { showActions: boolean; showPatient?: boolean }) {
  return <section className="surface table-surface" role="status" aria-label="Loading assessments">
    <span className="sr-only">Loading assessments…</span>
    <div className="mobile-card-list" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <article className="mobile-data-card list-mobile-card assessment-mobile-card" key={index}>
      <div className="mobile-card-heading"><div className="mobile-card-primary flex-1"><Skeleton className="h-4 w-28 motion-reduce:animate-none" />{showPatient && <Skeleton className="h-4 w-36 max-w-full motion-reduce:animate-none" />}<Skeleton className="h-3 w-16 motion-reduce:animate-none" /></div>{showActions && <div className="mobile-card-actions"><Skeleton className="size-8 motion-reduce:animate-none" /></div>}</div>
      <div className="mobile-card-meta"><Skeleton className="h-6 w-24 rounded-full motion-reduce:animate-none" /><Skeleton className="h-3 w-32 motion-reduce:animate-none" /></div>
      {showActions && <div className="assessment-card-footer"><Skeleton className="h-9 w-36 motion-reduce:animate-none" /></div>}
    </article>)}</div>
    <div className="desktop-table p-5" aria-hidden="true"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Assessment</th>{showPatient && <th>Patient</th>}<th>Facility</th><th>Started</th><th>Status</th>{showActions && <th className="text-right">Actions</th>}</tr></thead><tbody>{Array.from({ length: 6 }, (_, index) => <tr key={index}>
      <td><Skeleton className="h-4 w-28 motion-reduce:animate-none" /></td>
      {showPatient && <td><div className="grid gap-2"><Skeleton className="h-4 w-32 motion-reduce:animate-none" /><Skeleton className="h-3 w-16 motion-reduce:animate-none" /></div></td>}
      <td><Skeleton className="h-4 w-28 motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-4 w-20 motion-reduce:animate-none" /></td>
      <td><Skeleton className="h-6 w-24 rounded-full motion-reduce:animate-none" /></td>
      {showActions && <td><div className="flex justify-end gap-2"><Skeleton className="h-8 w-28 motion-reduce:animate-none" /><Skeleton className="size-8 motion-reduce:animate-none" /></div></td>}
    </tr>)}</tbody></table></div></div>
  </section>;
}
