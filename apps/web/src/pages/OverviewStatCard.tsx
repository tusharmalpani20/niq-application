import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

type OverviewStatCardProps = {
  label: string;
  value: number | null;
  icon: LucideIcon;
  detail: string;
  to?: string;
  tone?: "primary" | "alert";
  growth?: { added: number; percent: number | null };
};

export function OverviewStatCard({ label, value, icon: Icon, detail, to, tone = "primary", growth }: OverviewStatCardProps) {
  const content = <>
    <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tone === "alert" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`} aria-hidden="true"><Icon className="size-7" strokeWidth={2.25} /></span>
    <span className="min-w-0 self-stretch border-l border-border/70 pl-4">
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <strong className="text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{value ?? "—"}</strong>
        {growth && growth.added > 0 && <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-success"><ArrowUpRight className="size-4" aria-hidden="true" />{growth.percent === null ? `+${growth.added}` : `+${growth.percent}%`}</span>}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </span>
  </>;
  const className = "surface flex min-h-28 items-center gap-4 p-4 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-primary";
  return to ? <Link to={to} className={`${className} hover:bg-primary/5`}>{content}</Link> : <div className={className}>{content}</div>;
}
