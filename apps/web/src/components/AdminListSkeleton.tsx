import { Skeleton } from "@/components/ui/skeleton";

export function AdminListSkeleton({ label, columns }: { label: string; columns: string[] }) {
  return <section className="surface table-surface" role="status" aria-label={`Loading ${label}`}>
    <span className="sr-only">Loading {label}…</span>
    <div className="mobile-card-list" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <article className="mobile-data-card grid gap-3" key={index}>
      <Skeleton className="h-4 w-36 max-w-full motion-reduce:animate-none" />
      <Skeleton className="h-3 w-48 max-w-full motion-reduce:animate-none" />
      <div className="flex items-center justify-between gap-3"><Skeleton className="h-6 w-20 rounded-full motion-reduce:animate-none" /><Skeleton className="size-8 motion-reduce:animate-none" /></div>
    </article>)}</div>
    <div className="desktop-table p-5" aria-hidden="true"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, index) => <tr key={index}>{columns.map((column, cell) => <td key={column}>{cell === 0 ? <div className="grid gap-2"><Skeleton className="h-4 w-32 motion-reduce:animate-none" /><Skeleton className="h-3 w-24 motion-reduce:animate-none" /></div> : <Skeleton className={cell === columns.length - 1 ? "size-8 motion-reduce:animate-none" : "h-5 w-24 motion-reduce:animate-none"} />}</td>)}</tr>)}</tbody></table></div></div>
  </section>;
}
