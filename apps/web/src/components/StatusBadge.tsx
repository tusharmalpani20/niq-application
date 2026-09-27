import { Badge } from "@/components/ui/badge";

const accents: Record<string, string> = {
  Draft: "var(--client-muted)",
  "Needs correction": "var(--danger)",
  "Ready to send": "var(--primary)",
  "Ready for scoring": "var(--primary)",
  "Pending scoring": "var(--primary)",
  "Scoring unavailable": "var(--danger)",
  Scored: "var(--review-foreground)",
  "Under review": "var(--review-foreground)",
  Completed: "var(--success)",
  Voided: "var(--client-muted)",
  "Awaiting reviewer": "var(--client-muted)",
  "In review": "var(--review-foreground)",
  "Returned for correction": "var(--danger)",
  "Reopened for corrections": "var(--review-foreground)",
  "Awaiting resubmission": "var(--client-muted)",
  Active: "var(--success)",
  Deactivated: "var(--destructive)",
};

export function StatusBadge({ status }: { status: string }) {
  const style = status === "Active"
    ? { color: "var(--success)", backgroundColor: "var(--success-soft)", borderColor: "var(--success-border)" }
    : status === "Deactivated"
      ? { color: "var(--destructive)", backgroundColor: "var(--destructive-soft)", borderColor: "var(--border)" }
      : { color: "var(--foreground)", backgroundColor: "var(--surface-subtle)", borderColor: "var(--border)" };
  return <Badge variant="outline" className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")} style={style}><span className="status-dot" style={{ backgroundColor: accents[status] ?? "var(--client-muted)" }} />{status}</Badge>;
}
