import { Badge } from "@/components/ui/badge";

const accents: Record<string, string> = {
  Draft: "var(--client-muted)",
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
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className="status-badge" data-status={status.toLowerCase().replaceAll(" ", "-")} style={{ color: "var(--foreground)", backgroundColor: "var(--surface-subtle)", borderColor: "var(--border)" }}><span className="status-dot" style={{ backgroundColor: accents[status] ?? "var(--client-muted)" }} />{status}</Badge>;
}
