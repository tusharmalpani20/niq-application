import { Skeleton } from "@/components/ui/skeleton";

const shimmer = "motion-reduce:animate-none";

export function OverviewStatSkeleton() {
  return <div className="surface flex min-h-28 min-w-0 items-center gap-2 p-3 sm:gap-4 sm:p-4" role="status" aria-label="Loading overview statistic">
    <Skeleton className={`size-10 shrink-0 rounded-xl sm:size-14 sm:rounded-2xl ${shimmer}`} />
    <div className="min-w-0 flex-1 border-l border-border/70 pl-2 sm:pl-4"><Skeleton className={`h-3 w-24 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-7 w-16 ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-28 max-w-full ${shimmer}`} /></div>
  </div>;
}

export function OverviewPrioritySkeleton() {
  return <section className="surface min-w-0 p-5" role="status" aria-label="Loading priority assessments">
    <Skeleton className={`h-5 w-44 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-56 max-w-full ${shimmer}`} />
    <div className="mt-5 divide-y">{Array.from({ length: 3 }, (_, index) => <div className="py-3" key={index}><Skeleton className={`h-4 w-36 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-28 max-w-full ${shimmer}`} /></div>)}</div>
  </section>;
}

export function OverviewActionsSkeleton() {
  return <section className="surface min-w-0 p-5" role="status" aria-label="Loading quick actions"><Skeleton className={`h-5 w-32 ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-44 max-w-full ${shimmer}`} /><div className="mt-5 grid gap-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className={`h-14 w-full rounded-xl ${shimmer}`} />)}</div></section>;
}

export function OverviewRiskSkeleton() {
  return <section className="surface mt-4 p-5" role="status" aria-label="Loading risk overview"><Skeleton className={`h-5 w-44 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-56 max-w-full ${shimmer}`} /><Skeleton className={`mx-auto mt-5 size-48 rounded-full sm:size-56 ${shimmer}`} /><div className="mt-5 flex justify-center gap-4"><Skeleton className={`h-4 w-20 ${shimmer}`} /><Skeleton className={`h-4 w-24 ${shimmer}`} /><Skeleton className={`h-4 w-20 ${shimmer}`} /></div></section>;
}

export function OverviewRecentSkeleton() {
  return <section className="surface min-w-0 p-5" role="status" aria-label="Loading recent patients"><Skeleton className={`h-5 w-36 ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-24 ${shimmer}`} /><div className="mt-4 divide-y">{Array.from({ length: 4 }, (_, index) => <div className="flex justify-between gap-4 py-3" key={index}><div className="flex-1"><Skeleton className={`h-4 w-32 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-40 max-w-full ${shimmer}`} /></div><Skeleton className={`h-4 w-24 ${shimmer}`} /></div>)}</div></section>;
}

export function OverviewInsightsSkeleton() {
  return <section className="surface min-w-0 p-5" role="status" aria-label="Loading nutrition insights"><Skeleton className={`h-5 w-44 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-48 max-w-full ${shimmer}`} /><div className="mt-5 divide-y rounded-2xl border px-4">{Array.from({ length: 3 }, (_, index) => <div className="flex gap-3 py-4" key={index}><Skeleton className={`size-11 shrink-0 rounded-xl ${shimmer}`} /><div className="flex-1"><Skeleton className={`h-4 w-32 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-48 max-w-full ${shimmer}`} /></div></div>)}</div></section>;
}

export function OverviewActivitySkeleton() {
  return <section className="surface mt-7 p-5" role="status" aria-label="Loading assessment activity"><Skeleton className={`h-5 w-48 max-w-full ${shimmer}`} /><Skeleton className={`mt-2 h-3 w-64 max-w-full ${shimmer}`} /><div className="mt-5 grid gap-5 md:grid-cols-[250px_minmax(0,1fr)]"><Skeleton className={`h-72 w-full rounded-xl ${shimmer}`} /><div className="grid content-start gap-4"><Skeleton className={`h-5 w-48 max-w-full ${shimmer}`} />{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className={`h-14 w-full ${shimmer}`} />)}</div></div></section>;
}
