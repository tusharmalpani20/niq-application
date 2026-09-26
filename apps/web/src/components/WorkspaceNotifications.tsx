import { hasPermission } from "@niq/application-contracts";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { Bell, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { listClinicalReviews } from "../features/assessments/clinical-review-api";
import { listAssessments } from "../lib/api";

type WorkCounts = { actions: number; waiting: number; inProgress: number };

export function WorkspaceNotifications({ user, onNavigate }: { user: AuthenticatedUser; onNavigate: (to: string) => void }) {
  const canReadAssessments = hasPermission(user.role, "assessments.read");
  const canSeeQueue = hasPermission(user.role, "reviews.claim") || hasPermission(user.role, "reviews.assign");
  const canSeeMine = hasPermission(user.role, "reviews.claim");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState<WorkCounts>({ actions: 0, waiting: 0, inProgress: 0 });

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    const org = user.organizationId;
    Promise.allSettled([
      canReadAssessments ? listAssessments(org) : Promise.resolve([]),
      canSeeQueue ? listClinicalReviews(org, new URLSearchParams({ state: "QUEUED", page: "1", pageSize: "1" })) : Promise.resolve(null),
      canSeeMine ? listClinicalReviews(org, new URLSearchParams({ state: "IN_REVIEW", mine: "true", page: "1", pageSize: "1" })) : Promise.resolve(null),
    ]).then(([assessments, queued, mine]) => {
      if (!active) return;
      setCounts({
        actions: assessments.status === "fulfilled" ? assessments.value.filter(item => !!item.myAction).length : 0,
        waiting: queued.status === "fulfilled" ? queued.value?.total ?? 0 : 0,
        inProgress: mine.status === "fulfilled" ? mine.value?.total ?? 0 : 0,
      });
      setFailed(assessments.status === "rejected" || queued.status === "rejected" || mine.status === "rejected");
      setLoading(false);
    });
    return () => { active = false; };
  }, [open, user.organizationId, canReadAssessments, canSeeQueue, canSeeMine]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);

  function go(to: string) {
    if (detailsRef.current) detailsRef.current.open = false;
    onNavigate(to);
  }

  const items = [
    ...(counts.actions ? [{ label: "My assessment actions", count: counts.actions, to: "/assessments?status=MY_ACTIONS" }] : []),
    ...(counts.waiting ? [{ label: "Awaiting a reviewer", count: counts.waiting, to: "/assessments?tab=clinical-reviews&review=QUEUED" }] : []),
    ...(counts.inProgress ? [{ label: "My reviews in progress", count: counts.inProgress, to: "/assessments?tab=clinical-reviews&review=mine-active" }] : []),
  ];

  return <details ref={detailsRef} onToggle={() => setOpen(detailsRef.current?.open ?? false)} className="relative shrink-0">
    <summary aria-label="Notifications" className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"><Bell className="size-[18px]" aria-hidden="true" /></summary>
    <div className="absolute right-0 top-[calc(100%+.75rem)] z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-background p-3 shadow-xl" aria-label="Notifications panel">
      <h2 className="px-1 text-sm font-semibold">Notifications</h2>
      <p className="px-1 pb-2 text-xs text-muted-foreground">Current assessment work</p>
      {loading ? <p className="px-1 py-3 text-sm text-muted-foreground">Loading work updates…</p> : <>
        {failed && <p className="px-1 py-2 text-xs text-destructive">Some work updates could not be loaded.</p>}
        {items.length ? <div className="space-y-1">{items.map(item => <button key={item.to} type="button" onClick={() => go(item.to)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-primary/5"><span className="min-w-0 flex-1">{item.label}</span><span className="font-semibold tabular-nums">{item.count}</span><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></button>)}</div> : <p className="px-1 py-3 text-sm text-muted-foreground">No assessment work needing attention.</p>}
      </>}
    </div>
  </details>;
}
